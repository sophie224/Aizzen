import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AuthServiceConfig } from './config.ts'
import {
  authorizeGoogleIdentity,
  loadDirectory,
  type AuthorizationDenial,
  type Directory,
} from './directory.ts'
import {
  buildAuthorizationUrl,
  createLoginChallenge,
  exchangeCode,
  fetchDiscovery,
  verifyIdToken,
  type DiscoveryDocument,
} from './oidc.ts'
import { createSessionId, openSession, sealSession, sessionCookieOptions } from './session.ts'

/*
 * Aizzen auth service (ARCHITECTURE.md §6.2).
 *
 * Google authenticates IDENTITY ONLY. Access, roles and permissions stay with
 * the internal user-management system: this service resolves a Google identity
 * to an internal user ID and issues a session cookie. It never reads or writes
 * a role.
 */

/** Audit record. Written through the injected sink so the host decides storage. */
export interface AuthAuditEvent {
  action:
    | 'auth.google.login'
    | 'auth.google.denied'
    | 'auth.google.linked'
    | 'auth.google.error'
    | 'auth.signout'
  /** Present only once an internal user is resolved. */
  userId?: string
  /** Attempted address, for investigation. Never a token or a password. */
  email?: string
  reason?: AuthorizationDenial | 'invalidState' | 'tokenInvalid' | 'exchangeFailed'
  at: string
}

export interface BuildAppOptions {
  config: AuthServiceConfig
  /** Injected in tests to point at a local mock issuer. */
  fetchImpl?: typeof fetch
  /** Injected in tests so verification uses a local key set. */
  keySet?: Parameters<typeof verifyIdToken>[0]['keySet']
  /** Receives every audit event. Defaults to stderr. */
  onAudit?: (event: AuthAuditEvent) => void
  /** Overrides the directory loader, so tests need no file on disk. */
  loadDirectoryImpl?: (path: string) => Promise<Directory>
}

/** Pending login challenges, keyed by `state`. */
interface PendingLogin {
  nonce: string
  codeVerifier: string
  createdAt: number
}

const CHALLENGE_TTL_MS = 10 * 60 * 1000

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options
  const fetchImpl = options.fetchImpl ?? fetch
  const loadDirectoryFn = options.loadDirectoryImpl ?? loadDirectory
  const audit = options.onAudit ?? ((event) => { process.stderr.write(`${JSON.stringify(event)}\n`) })

  const app = Fastify({ logger: false })
  await app.register(cookie, { secret: config.session.secret })

  // Login rate limiting, as the PRD requires.
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
  })

  const pending = new Map<string, PendingLogin>()
  let discovery: DiscoveryDocument | null = null

  const getDiscovery = async (): Promise<DiscoveryDocument> => {
    discovery ??= await fetchDiscovery(config.google.discoveryUrl, fetchImpl)
    return discovery
  }

  const redirectUri = `${config.serviceOrigin}/auth/google/callback`
  const now = () => new Date().toISOString()

  /** Drops challenges older than the TTL, so `pending` cannot grow unbounded. */
  const prunePending = () => {
    const cutoff = Date.now() - CHALLENGE_TTL_MS
    for (const [state, entry] of pending) {
      if (entry.createdAt < cutoff) pending.delete(state)
    }
  }

  // --- start ----------------------------------------------------------------

  app.get('/auth/google/start', async (_request, reply) => {
    prunePending()

    const challenge = createLoginChallenge()
    pending.set(challenge.state, {
      nonce: challenge.nonce,
      codeVerifier: challenge.codeVerifier,
      createdAt: Date.now(),
    })

    const url = buildAuthorizationUrl({
      discovery: await getDiscovery(),
      clientId: config.google.clientId,
      redirectUri,
      challenge,
    })

    return reply.redirect(url, 302)
  })

  // --- callback -------------------------------------------------------------

  app.get<{ Querystring: { code?: string; state?: string } }>(
    '/auth/google/callback',
    async (request, reply) => {
      const { code, state } = request.query

      /** Every failure lands here: generic redirect, specific audit. */
      const deny = (reason: AuthAuditEvent['reason'], email?: string) => {
        audit({ action: 'auth.google.denied', reason, email, at: now() })
        return reply.redirect(`${config.appOrigin}/login?error=denied`, 302)
      }

      // `state` must match a challenge we issued — this is the CSRF defence.
      const challenge = state ? pending.get(state) : undefined
      if (!code || !state || !challenge) return deny('invalidState')
      // One-time use: consumed whether or not the rest succeeds, so a captured
      // callback URL cannot be replayed.
      pending.delete(state)

      let identity
      try {
        const discoveryDocument = await getDiscovery()
        const tokens = await exchangeCode({
          discovery: discoveryDocument,
          clientId: config.google.clientId,
          clientSecret: config.google.clientSecret,
          redirectUri,
          code,
          codeVerifier: challenge.codeVerifier,
          fetchImpl,
        })

        identity = await verifyIdToken({
          idToken: tokens.id_token,
          discovery: discoveryDocument,
          clientId: config.google.clientId,
          expectedNonce: challenge.nonce,
          keySet: options.keySet,
        })
      } catch {
        return deny('tokenInvalid')
      }

      const directory = await loadDirectoryFn(config.userDirectoryPath)
      const outcome = authorizeGoogleIdentity(identity, directory)

      if (!outcome.ok) return deny(outcome.reason, identity.email)

      if (outcome.linkSub) {
        // Phase 1 cannot persist the link — the directory is a read-only
        // snapshot of the browser's AppState. Auditing it keeps the event
        // trail complete; M17 makes the write real.
        audit({
          action: 'auth.google.linked',
          userId: outcome.user.id,
          email: identity.email,
          at: now(),
        })
      }

      // Session ID is fresh on every login: no fixation.
      const sealed = sealSession(
        { sessionId: createSessionId(), userId: outcome.user.id, issuedAt: Math.floor(Date.now() / 1000) },
        config.session.secret,
      )

      audit({ action: 'auth.google.login', userId: outcome.user.id, email: identity.email, at: now() })

      return reply
        .setCookie(
          config.session.cookieName,
          sealed,
          sessionCookieOptions(config.session.secure, config.session.maxAge),
        )
        .redirect(`${config.appOrigin}/app/dashboard`, 302)
    },
  )

  // --- session --------------------------------------------------------------

  app.get('/auth/session', (request, reply) => {
    const session = openSession(
      request.cookies[config.session.cookieName],
      config.session.secret,
      config.session.maxAge,
    )

    if (!session) return reply.code(401).send({ authenticated: false })
    // Only the user ID: the client resolves roles from AppState itself.
    return reply.send({ authenticated: true, userId: session.userId })
  })

  // --- sign out -------------------------------------------------------------

  app.post('/auth/signout', (request, reply) => {
    const session = openSession(
      request.cookies[config.session.cookieName],
      config.session.secret,
      config.session.maxAge,
    )
    if (session) audit({ action: 'auth.signout', userId: session.userId, at: now() })

    return reply
      .clearCookie(config.session.cookieName, { path: '/' })
      .send({ authenticated: false })
  })

  return app
}
