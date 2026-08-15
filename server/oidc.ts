import { createHash, randomBytes } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'

/*
 * OpenID Connect: Authorization Code flow with PKCE (ARCHITECTURE.md §6.2).
 *
 * The PRD mandates this flow with SERVER-SIDE token validation. Nothing here
 * runs in the browser: the client secret, the code verifier and the ID token
 * all stay on this side.
 */

export interface DiscoveryDocument {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
}

/** Base64url without padding, as PKCE and OAuth `state` require. */
function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * One-time values binding a login attempt to its callback.
 *
 * `state` defeats CSRF, `nonce` defeats ID-token replay, and the PKCE verifier
 * defeats authorization-code interception — the three the PRD names.
 */
export interface LoginChallenge {
  state: string
  nonce: string
  codeVerifier: string
  codeChallenge: string
}

export function createLoginChallenge(): LoginChallenge {
  const codeVerifier = base64url(randomBytes(32))

  return {
    state: base64url(randomBytes(24)),
    nonce: base64url(randomBytes(24)),
    codeVerifier,
    // S256 only. `plain` is permitted by the spec but offers no protection.
    codeChallenge: base64url(createHash('sha256').update(codeVerifier).digest()),
  }
}

export async function fetchDiscovery(
  discoveryUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DiscoveryDocument> {
  const response = await fetchImpl(discoveryUrl)
  if (!response.ok) throw new Error(`OIDC discovery failed: ${String(response.status)}`)
  return (await response.json()) as DiscoveryDocument
}

export interface AuthorizationUrlOptions {
  discovery: DiscoveryDocument
  clientId: string
  redirectUri: string
  challenge: LoginChallenge
}

export function buildAuthorizationUrl(options: AuthorizationUrlOptions): string {
  const url = new URL(options.discovery.authorization_endpoint)

  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', options.clientId)
  url.searchParams.set('redirect_uri', options.redirectUri)
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', options.challenge.state)
  url.searchParams.set('nonce', options.challenge.nonce)
  url.searchParams.set('code_challenge', options.challenge.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  return url.toString()
}

export interface TokenExchangeOptions {
  discovery: DiscoveryDocument
  clientId: string
  clientSecret: string
  redirectUri: string
  code: string
  codeVerifier: string
  fetchImpl?: typeof fetch
}

export interface TokenResponse {
  id_token: string
  access_token?: string
}

/** Exchanges the authorization code for tokens. The secret never leaves here. */
export async function exchangeCode(options: TokenExchangeOptions): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: options.code,
    redirect_uri: options.redirectUri,
    client_id: options.clientId,
    code_verifier: options.codeVerifier,
  })
  if (options.clientSecret.length > 0) body.set('client_secret', options.clientSecret)

  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(options.discovery.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) throw new Error(`Token exchange failed: ${String(response.status)}`)
  return (await response.json()) as TokenResponse
}

export interface VerifiedIdentity {
  /** Google's stable subject identifier. */
  sub: string
  email: string
  emailVerified: boolean
  name?: string
}

export interface VerifyOptions {
  idToken: string
  discovery: DiscoveryDocument
  clientId: string
  expectedNonce: string
  /**
   * Key resolver. Defaults to a remote JWKS fetched from the issuer; tests
   * inject a local set so verification needs no network.
   */
  keySet?: JWTVerifyGetKey
}

/**
 * Validates the ID token's signature, issuer, audience, expiry and nonce.
 *
 * `jwtVerify` enforces signature, `iss`, `aud` and time claims; the nonce is
 * checked explicitly because it is application state, not a JWT registered
 * claim. Any failure throws — callers must translate that into a generic
 * denial, never a specific reason.
 */
export async function verifyIdToken(options: VerifyOptions): Promise<VerifiedIdentity> {
  const keySet = options.keySet ?? createRemoteJWKSet(new URL(options.discovery.jwks_uri))

  const { payload } = await jwtVerify(options.idToken, keySet, {
    issuer: options.discovery.issuer,
    audience: options.clientId,
  })

  assertNonce(payload, options.expectedNonce)

  const email = typeof payload.email === 'string' ? payload.email : ''
  if (email.length === 0) throw new Error('ID token carries no email claim')

  return {
    sub: String(payload.sub ?? ''),
    email,
    // Google may send this as a boolean or a string; treat anything else as false.
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    name: typeof payload.name === 'string' ? payload.name : undefined,
  }
}

function assertNonce(payload: JWTPayload, expected: string): void {
  if (typeof payload.nonce !== 'string' || payload.nonce !== expected) {
    throw new Error('ID token nonce does not match the login attempt')
  }
}
