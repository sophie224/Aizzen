import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/*
 * Server-issued sessions (ARCHITECTURE.md §6.2).
 *
 * The cookie carries a signed session ID and the internal user ID — never a
 * Google token, never a role or permission. Roles are always re-read from the
 * directory, so revoking access takes effect immediately.
 */

export interface SessionPayload {
  /** Rotated on every successful login, defeating session fixation. */
  sessionId: string
  /** Internal user ID. The client resolves the rest from AppState. */
  userId: string
  /** Seconds since the epoch. */
  issuedAt: number
}

export function createSessionId(): string {
  return randomBytes(24).toString('base64url')
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

/** Serialises the payload with an HMAC suffix. */
export function sealSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, secret)}`
}

/**
 * Verifies and parses a sealed session.
 *
 * Signature comparison is constant-time; any tampering, malformed value or
 * expiry returns null rather than a reason, so nothing leaks to a caller.
 */
export function openSession(
  sealed: string | undefined,
  secret: string,
  maxAgeSeconds: number,
  now = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  if (!sealed) return null

  const separator = sealed.lastIndexOf('.')
  if (separator <= 0) return null

  const body = sealed.slice(0, separator)
  const signature = sealed.slice(separator + 1)

  const expected = sign(body, secret)
  const provided = Buffer.from(signature)
  const computed = Buffer.from(expected)
  if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) return null

  let payload: SessionPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
  } catch {
    return null
  }

  if (typeof payload.userId !== 'string' || typeof payload.issuedAt !== 'number') return null
  if (now - payload.issuedAt > maxAgeSeconds) return null

  return payload
}

export interface CookieOptions {
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: string
  maxAge: number
}

/**
 * Cookie attributes the PRD requires.
 *
 * `HttpOnly` keeps the session out of reach of JavaScript — which is what
 * makes "no authentication token in localStorage" true rather than aspirational.
 * `SameSite=Lax` still allows the top-level redirect back from Google.
 */
export function sessionCookieOptions(secure: boolean, maxAge: number): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge }
}
