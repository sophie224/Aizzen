import type { User } from '../types/index.ts'

/*
 * Phase 1 local authentication (ARCHITECTURE.md §6.1).
 *
 * THIS IS NOT PRODUCTION AUTHENTICATION. Passwords are compared in plain text
 * against demo credentials held in AppState. It exists to exercise the role
 * and scope model; M15 replaces it with Google Sign-In backed by server-side
 * token validation and an HttpOnly session cookie.
 *
 * Known and accepted Phase 1 limitations, documented in docs/SECURITY-PHASE-1.md:
 *   - passwords stored and compared in plain text
 *   - no password complexity, expiry, rotation or MFA
 *   - no failed-attempt lockout or rate limiting
 *   - local state is editable through developer tools
 *   - no server trust boundary of any kind
 */

export interface Credentials {
  email: string
  password: string
}

/**
 * The single failure reason.
 *
 * Deliberately does NOT distinguish unknown email from wrong password from
 * deactivated account: a caller cannot leak which accounts exist, matching the
 * generic access-denied rule the specification sets for sign-in
 * (ARCHITECTURE.md §6.2).
 */
export type AuthFailureReason = 'invalidCredentials'

export type AuthResult =
  | { readonly ok: true; readonly user: User }
  | { readonly ok: false; readonly reason: AuthFailureReason }

/** Email comparison is case-insensitive and ignores surrounding whitespace. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Finds a directory entry by normalized email, active or not. */
export function findUserByEmail(users: readonly User[], email: string): User | undefined {
  const normalized = normalizeEmail(email)
  return users.find((candidate) => normalizeEmail(candidate.email) === normalized)
}

/**
 * Verifies credentials against the user directory.
 *
 * Order matters only for readability — every failure returns the same reason,
 * so the sequence is not observable from outside.
 */
export function authenticate(users: readonly User[], credentials: Credentials): AuthResult {
  const user = findUserByEmail(users, credentials.email)

  if (!user) return { ok: false, reason: 'invalidCredentials' }
  // An inactive account can never sign in, whatever the password.
  if (user.status !== 'Active') return { ok: false, reason: 'invalidCredentials' }
  if (user.password !== credentials.password) return { ok: false, reason: 'invalidCredentials' }

  return { ok: true, user }
}

/**
 * Whether a restored session reference is still valid.
 *
 * Re-checked on every load rather than trusted: deactivating or deleting a
 * user must take effect immediately, without waiting for them to sign out
 * (ARCHITECTURE.md §6.2).
 */
export function resolveSessionUser(users: readonly User[], userId: string | null): User | null {
  if (!userId) return null
  const user = users.find((candidate) => candidate.id === userId)
  return user && user.status === 'Active' ? user : null
}
