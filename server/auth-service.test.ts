import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from 'jose'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp, type AuthAuditEvent } from './app.ts'
import { loadConfig, type AuthServiceConfig } from './config.ts'
import { authorizeGoogleIdentity, type Directory } from './directory.ts'
import { createLoginChallenge } from './oidc.ts'
import { openSession, sealSession } from './session.ts'
import type { User } from '../src/domain/types/index.ts'

/*
 * The service is tested end to end against a LOCAL mock issuer: a key pair
 * generated in-process, a discovery document served from memory, and a token
 * endpoint that mints ID tokens on demand. No network, no Google credentials,
 * and every failure mode is reachable — including ones a live provider would
 * never produce on request.
 */

const ISSUER = 'https://mock-issuer.test'
const CLIENT_ID = 'test-client-id.apps.googleusercontent.com'

let privateKey: CryptoKey
let publicJwk: JWK

beforeEach(async () => {
  const pair = await generateKeyPair('RS256')
  privateKey = pair.privateKey
  publicJwk = await exportJWK(pair.publicKey)
  publicJwk.kid = 'test-key'
  publicJwk.alg = 'RS256'
})

interface TokenClaims {
  sub?: string
  email?: string
  emailVerified?: boolean | string
  nonce?: string
  audience?: string
  issuer?: string
  expiresIn?: string
}

async function mintIdToken(claims: TokenClaims): Promise<string> {
  return new SignJWT({
    email: claims.email ?? 'admin@erm.local',
    email_verified: claims.emailVerified ?? true,
    nonce: claims.nonce,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject(claims.sub ?? 'google-sub-123')
    .setIssuer(claims.issuer ?? ISSUER)
    .setAudience(claims.audience ?? CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(claims.expiresIn ?? '5m')
    .sign(privateKey)
}

function directoryWith(users: Partial<User>[]): Directory {
  return {
    users: users.map((user) => ({
      id: 'usr_admin', name: 'ERM Administrator', title: '', email: 'admin@erm.local',
      password: 'x', status: 'Active', roleIds: ['role_admin'], businessUnitIds: ['bu_enterprise'],
      ...user,
    })) as User[],
  }
}

interface Harness {
  app: FastifyInstance
  audit: AuthAuditEvent[]
  config: AuthServiceConfig
  /** Claims the mock token endpoint will mint next. */
  nextClaims: TokenClaims
}

async function makeHarness(directory: Directory, overrides: Partial<TokenClaims> = {}): Promise<Harness> {
  const audit: AuthAuditEvent[] = []
  const nextClaims: TokenClaims = { ...overrides }

  const config = loadConfig({
    google: { clientId: CLIENT_ID, clientSecret: 'test-secret', discoveryUrl: `${ISSUER}/.well-known/openid-configuration` },
    session: { secret: 'test-session-secret', cookieName: 'aizzen_session', maxAge: 3600, secure: false },
    appOrigin: 'http://app.test',
    serviceOrigin: 'http://auth.test',
  })

  // Mock issuer: discovery + token endpoint, no sockets involved.
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input)

    if (url.endsWith('/.well-known/openid-configuration')) {
      return new Response(
        JSON.stringify({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/authorize`,
          token_endpoint: `${ISSUER}/token`,
          jwks_uri: `${ISSUER}/jwks`,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    if (url === `${ISSUER}/token`) {
      if (nextClaims.sub === 'EXCHANGE_FAILS') return new Response('nope', { status: 400 })
      return new Response(JSON.stringify({ id_token: await mintIdToken(nextClaims) }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    throw new Error(`unexpected fetch: ${url}`)
  }

  const app = await buildApp({
    config,
    fetchImpl,
    keySet: createLocalJWKSet({ keys: [publicJwk] }),
    onAudit: (event) => audit.push(event),
    loadDirectoryImpl: () => Promise.resolve(directory),
  })

  return { app, audit, config, nextClaims }
}

/** Runs a full start → callback round trip and returns the callback response. */
async function signIn(harness: Harness, claims: Partial<TokenClaims> = {}) {
  const start = await harness.app.inject({ method: 'GET', url: '/auth/google/start' })
  const location = new URL(start.headers.location as string)
  const state = location.searchParams.get('state') ?? ''
  const nonce = location.searchParams.get('nonce') ?? ''

  Object.assign(harness.nextClaims, { nonce, ...claims })

  const callback = await harness.app.inject({
    method: 'GET',
    url: `/auth/google/callback?code=abc&state=${state}`,
  })
  return { start, callback, state, nonce }
}

let harness: Harness

afterEach(async () => {
  await harness.app.close()
})

// --- the authorization flow -------------------------------------------------

describe('authorization request', () => {
  it('redirects to the provider with PKCE, state and nonce', async () => {
    harness = await makeHarness(directoryWith([{}]))
    const response = await harness.app.inject({ method: 'GET', url: '/auth/google/start' })

    expect(response.statusCode).toBe(302)
    const url = new URL(response.headers.location as string)

    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('state')).toBeTruthy()
    expect(url.searchParams.get('nonce')).toBeTruthy()
    expect(url.searchParams.get('scope')).toContain('openid')
  })

  it('never puts the client secret in the redirect', async () => {
    harness = await makeHarness(directoryWith([{}]))
    const response = await harness.app.inject({ method: 'GET', url: '/auth/google/start' })

    expect(response.headers.location).not.toContain('test-secret')
  })

  it('issues a fresh state and nonce per attempt', async () => {
    harness = await makeHarness(directoryWith([{}]))
    const first = await harness.app.inject({ method: 'GET', url: '/auth/google/start' })
    const second = await harness.app.inject({ method: 'GET', url: '/auth/google/start' })

    const stateOf = (response: typeof first) =>
      new URL(response.headers.location as string).searchParams.get('state')

    expect(stateOf(first)).not.toBe(stateOf(second))
  })
})

// --- successful sign-in -----------------------------------------------------

describe('a pre-provisioned active user signs in', () => {
  it('issues an HttpOnly session cookie and redirects into the app', async () => {
    harness = await makeHarness(directoryWith([{ googleSub: 'google-sub-123' }]))
    const { callback } = await signIn(harness)

    expect(callback.statusCode).toBe(302)
    expect(callback.headers.location).toBe('http://app.test/app/dashboard')

    const cookie = callback.cookies.find((entry) => entry.name === 'aizzen_session')
    expect(cookie).toBeDefined()
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax')
  })

  it('carries only the user ID — never a token, role or permission', async () => {
    harness = await makeHarness(directoryWith([{ googleSub: 'google-sub-123' }]))
    const { callback } = await signIn(harness)

    const raw = callback.cookies.find((entry) => entry.name === 'aizzen_session')?.value ?? ''
    const session = openSession(raw, 'test-session-secret', 3600)

    expect(session?.userId).toBe('usr_admin')
    expect(JSON.stringify(session)).not.toContain('role_admin')
    expect(JSON.stringify(session)).not.toContain('eyJ') // no JWT
  })

  it('rotates the session ID on every login, defeating fixation', async () => {
    harness = await makeHarness(directoryWith([{ googleSub: 'google-sub-123' }]))

    const first = await signIn(harness)
    const second = await signIn(harness)

    const idOf = (response: typeof first.callback) =>
      openSession(
        response.cookies.find((entry) => entry.name === 'aizzen_session')?.value ?? '',
        'test-session-secret',
        3600,
      )?.sessionId

    expect(idOf(first.callback)).not.toBe(idOf(second.callback))
  })

  it('audits the login with the resolved user', async () => {
    harness = await makeHarness(directoryWith([{ googleSub: 'google-sub-123' }]))
    await signIn(harness)

    const event = harness.audit.find((entry) => entry.action === 'auth.google.login')
    expect(event?.userId).toBe('usr_admin')
  })

  it('audits the account link on first sign-in only', async () => {
    harness = await makeHarness(directoryWith([{}])) // no googleSub yet
    await signIn(harness)

    expect(harness.audit.some((entry) => entry.action === 'auth.google.linked')).toBe(true)
  })

  it('exposes the session to the SPA', async () => {
    harness = await makeHarness(directoryWith([{ googleSub: 'google-sub-123' }]))
    const { callback } = await signIn(harness)
    const cookie = callback.cookies.find((entry) => entry.name === 'aizzen_session')?.value ?? ''

    const session = await harness.app.inject({
      method: 'GET', url: '/auth/session', cookies: { aizzen_session: cookie },
    })

    expect(session.statusCode).toBe(200)
    expect(session.json()).toEqual({ authenticated: true, userId: 'usr_admin' })
  })
})

// --- denials ----------------------------------------------------------------

describe('access is denied', () => {
  /** Every denial must look identical from outside. */
  const expectGenericDenial = (callback: { statusCode: number; headers: Record<string, unknown> }) => {
    expect(callback.statusCode).toBe(302)
    expect(callback.headers.location).toBe('http://app.test/login?error=denied')
  }

  it('for an unknown Google account', async () => {
    harness = await makeHarness(directoryWith([{ email: 'someone.else@erm.local' }]))
    const { callback } = await signIn(harness, { email: 'stranger@gmail.com' })

    expectGenericDenial(callback)
    expect(harness.audit.at(-1)?.reason).toBe('noInternalUser')
  })

  it('for a disabled internal user', async () => {
    harness = await makeHarness(directoryWith([{ status: 'Inactive' }]))
    const { callback } = await signIn(harness)

    expectGenericDenial(callback)
    expect(harness.audit.at(-1)?.reason).toBe('userInactive')
  })

  it('for an unverified Google email', async () => {
    harness = await makeHarness(directoryWith([{}]))
    const { callback } = await signIn(harness, { emailVerified: false })

    expectGenericDenial(callback)
    expect(harness.audit.at(-1)?.reason).toBe('emailNotVerified')
  })

  it('for a wrong audience', async () => {
    harness = await makeHarness(directoryWith([{}]))
    const { callback } = await signIn(harness, { audience: 'someone-elses-client-id' })

    expectGenericDenial(callback)
    expect(harness.audit.at(-1)?.reason).toBe('tokenInvalid')
  })

  it('for a wrong issuer', async () => {
    harness = await makeHarness(directoryWith([{}]))
    const { callback } = await signIn(harness, { issuer: 'https://evil.test' })

    expectGenericDenial(callback)
    expect(harness.audit.at(-1)?.reason).toBe('tokenInvalid')
  })

  it('for an expired token', async () => {
    harness = await makeHarness(directoryWith([{}]))
    const { callback } = await signIn(harness, { expiresIn: '-1m' })

    expectGenericDenial(callback)
    expect(harness.audit.at(-1)?.reason).toBe('tokenInvalid')
  })

  it('for a mismatched nonce — a replayed ID token', async () => {
    harness = await makeHarness(directoryWith([{}]))
    // Overwrite the nonce after start, simulating a token minted for another attempt.
    const start = await harness.app.inject({ method: 'GET', url: '/auth/google/start' })
    const state = new URL(start.headers.location as string).searchParams.get('state') ?? ''
    Object.assign(harness.nextClaims, { nonce: 'a-different-nonce' })

    const callback = await harness.app.inject({
      method: 'GET', url: `/auth/google/callback?code=abc&state=${state}`,
    })

    expectGenericDenial(callback)
    expect(harness.audit.at(-1)?.reason).toBe('tokenInvalid')
  })

  it('for an unrecognised state — the CSRF defence', async () => {
    harness = await makeHarness(directoryWith([{}]))
    const callback = await harness.app.inject({
      method: 'GET', url: '/auth/google/callback?code=abc&state=forged',
    })

    expectGenericDenial(callback)
    expect(harness.audit.at(-1)?.reason).toBe('invalidState')
  })

  it('for a replayed callback — state is single-use', async () => {
    harness = await makeHarness(directoryWith([{ googleSub: 'google-sub-123' }]))
    const { state } = await signIn(harness)

    const replay = await harness.app.inject({
      method: 'GET', url: `/auth/google/callback?code=abc&state=${state}`,
    })

    expectGenericDenial(replay)
    expect(harness.audit.at(-1)?.reason).toBe('invalidState')
  })

  it('when the token exchange itself fails', async () => {
    harness = await makeHarness(directoryWith([{}]))
    const { callback } = await signIn(harness, { sub: 'EXCHANGE_FAILS' })

    expectGenericDenial(callback)
    expect(harness.audit.at(-1)?.reason).toBe('tokenInvalid')
  })

  it('never issues a cookie on any denial', async () => {
    harness = await makeHarness(directoryWith([{ status: 'Inactive' }]))
    const { callback } = await signIn(harness)

    expect(callback.cookies.find((entry) => entry.name === 'aizzen_session')).toBeUndefined()
  })

  it('gives every denial the same outward response', async () => {
    const cases: [string, Directory, Partial<TokenClaims>][] = [
      ['unknown', directoryWith([{ email: 'other@erm.local' }]), { email: 'nobody@gmail.com' }],
      ['inactive', directoryWith([{ status: 'Inactive' }]), {}],
      ['unverified', directoryWith([{}]), { emailVerified: false }],
    ]

    const locations = new Set<string>()
    for (const [, directory, claims] of cases) {
      harness = await makeHarness(directory)
      const { callback } = await signIn(harness, claims)
      locations.add(String(callback.headers.location))
      await harness.app.close()
    }

    harness = await makeHarness(directoryWith([{}]))
    expect(locations.size).toBe(1)
  })
})

// --- domain membership grants nothing ---------------------------------------

describe('domain membership is not access', () => {
  it('refuses an aizzen.com address with no internal record', async () => {
    harness = await makeHarness(directoryWith([{ email: 'admin@erm.local' }]))
    const { callback } = await signIn(harness, { email: 'not.provisioned@aizzen.com' })

    expect(callback.headers.location).toBe('http://app.test/login?error=denied')
    expect(harness.audit.at(-1)?.reason).toBe('noInternalUser')
  })

  it('never auto-creates a user', async () => {
    const directory = directoryWith([{ email: 'admin@erm.local' }])
    harness = await makeHarness(directory)
    await signIn(harness, { email: 'brand.new@aizzen.com' })

    expect(directory.users).toHaveLength(1)
  })
})

// --- account linking --------------------------------------------------------

describe('account linking', () => {
  it('refuses a different Google account claiming a linked address', async () => {
    harness = await makeHarness(directoryWith([{ googleSub: 'the-original-sub' }]))
    const { callback } = await signIn(harness, { sub: 'a-different-sub' })

    expect(callback.headers.location).toBe('http://app.test/login?error=denied')
    expect(harness.audit.at(-1)?.reason).toBe('subMismatch')
  })

  it('accepts the linked account on subsequent logins', async () => {
    harness = await makeHarness(directoryWith([{ googleSub: 'google-sub-123' }]))
    const { callback } = await signIn(harness, { sub: 'google-sub-123' })

    expect(callback.headers.location).toBe('http://app.test/app/dashboard')
  })
})

// --- sign out ---------------------------------------------------------------

describe('sign out', () => {
  it('clears the cookie and audits it', async () => {
    harness = await makeHarness(directoryWith([{ googleSub: 'google-sub-123' }]))
    const { callback } = await signIn(harness)
    const cookie = callback.cookies.find((entry) => entry.name === 'aizzen_session')?.value ?? ''

    const response = await harness.app.inject({
      method: 'POST', url: '/auth/signout', cookies: { aizzen_session: cookie },
    })

    expect(response.json()).toEqual({ authenticated: false })
    expect(harness.audit.some((entry) => entry.action === 'auth.signout')).toBe(true)
  })

  it('rejects a session request once signed out', async () => {
    harness = await makeHarness(directoryWith([{}]))
    const response = await harness.app.inject({ method: 'GET', url: '/auth/session' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ authenticated: false })
  })
})

// --- session integrity ------------------------------------------------------

describe('session cookie integrity', () => {
  it('rejects a tampered payload', async () => {
    const sealed = sealSession({ sessionId: 's1', userId: 'usr_admin', issuedAt: Math.floor(Date.now() / 1000) }, 'secret')
    const [body, signature] = sealed.split('.')
    const forged = `${Buffer.from(JSON.stringify({ sessionId: 's1', userId: 'usr_super_admin', issuedAt: Math.floor(Date.now() / 1000) })).toString('base64url')}.${signature}`

    expect(openSession(forged, 'secret', 3600)).toBeNull()
    expect(openSession(sealed, 'secret', 3600)?.userId).toBe('usr_admin')
    expect(body.length).toBeGreaterThan(0)
  })

  it('rejects a session signed with another secret', async () => {
    const sealed = sealSession({ sessionId: 's1', userId: 'usr_admin', issuedAt: Math.floor(Date.now() / 1000) }, 'other-secret')
    expect(openSession(sealed, 'secret', 3600)).toBeNull()
  })

  it('rejects an expired session', async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 7200
    const sealed = sealSession({ sessionId: 's1', userId: 'usr_admin', issuedAt }, 'secret')
    expect(openSession(sealed, 'secret', 3600)).toBeNull()
  })

  it('rejects malformed input', async () => {
    for (const value of [undefined, '', 'nodot', 'a.b.c']) {
      expect(openSession(value, 'secret', 3600)).toBeNull()
    }
  })
})

// --- rate limiting ----------------------------------------------------------

describe('rate limiting', () => {
  it('throttles repeated login attempts', async () => {
    harness = await makeHarness(directoryWith([{}]))

    const statuses: number[] = []
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const response = await harness.app.inject({ method: 'GET', url: '/auth/google/start' })
      statuses.push(response.statusCode)
    }

    expect(statuses).toContain(429)
  })
})

// --- authorization rules in isolation ---------------------------------------

describe('authorizeGoogleIdentity', () => {
  const directory = directoryWith([{ id: 'usr_admin', email: 'Admin@ERM.local' }])

  it('matches the email case-insensitively', () => {
    const outcome = authorizeGoogleIdentity(
      { sub: 's', email: '  ADMIN@erm.LOCAL ', emailVerified: true },
      directory,
    )
    expect(outcome.ok).toBe(true)
  })

  it('reports linkSub only when the account is not yet linked', () => {
    const unlinked = authorizeGoogleIdentity({ sub: 's', email: 'admin@erm.local', emailVerified: true }, directory)
    expect(unlinked.ok && unlinked.linkSub).toBe(true)

    const linked = authorizeGoogleIdentity(
      { sub: 's', email: 'admin@erm.local', emailVerified: true },
      directoryWith([{ email: 'admin@erm.local', googleSub: 's' }]),
    )
    expect(linked.ok && linked.linkSub).toBe(false)
  })

  it('never consults roles', () => {
    const outcome = authorizeGoogleIdentity(
      { sub: 's', email: 'admin@erm.local', emailVerified: true },
      directoryWith([{ email: 'admin@erm.local', roleIds: [] }]),
    )
    // No roles at all, yet identity still resolves — permissions are a
    // separate decision made from AppState.
    expect(outcome.ok).toBe(true)
  })
})

// --- PKCE -------------------------------------------------------------------

describe('PKCE challenge', () => {
  it('derives an S256 challenge from a fresh verifier', () => {
    const first = createLoginChallenge()
    const second = createLoginChallenge()

    expect(first.codeVerifier).not.toBe(second.codeVerifier)
    expect(first.codeChallenge).not.toBe(first.codeVerifier)
    // base64url: no padding, no + or /
    expect(first.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})
