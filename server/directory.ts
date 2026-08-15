import { readFile } from 'node:fs/promises'
import { normalizeEmail } from '../src/domain/auth/index.ts'
import type { User } from '../src/domain/types/index.ts'

/*
 * Internal user directory (ARCHITECTURE.md §6.2).
 *
 * PHASE 1 BRIDGE. The authoritative directory is still the browser's AppState,
 * so this service reads a JSON snapshot exported from Administration → Data
 * Tools. Both sides agree on user IDs because the snapshot comes from the same
 * state. M17/M18 removes the duplication when the API owns AppState.
 *
 * The authorization RULES are shared with the client, not reimplemented:
 * `normalizeEmail` comes from src/domain/auth.
 */

export interface Directory {
  users: User[]
}

interface DirectoryFile {
  users?: unknown
  state?: { users?: unknown }
}

/** Reads a snapshot, accepting either a raw state object or an export envelope. */
export async function loadDirectory(path: string): Promise<Directory> {
  const raw = await readFile(path, 'utf8')
  const parsed = JSON.parse(raw) as DirectoryFile

  const users = Array.isArray(parsed.users)
    ? parsed.users
    : Array.isArray(parsed.state?.users)
      ? parsed.state.users
      : []

  return { users: users as User[] }
}

export type AuthorizationDenial =
  | 'emailNotVerified'
  | 'noInternalUser'
  | 'userInactive'
  | 'subMismatch'

export type AuthorizationOutcome =
  | { readonly ok: true; readonly user: User; readonly linkSub: boolean }
  | { readonly ok: false; readonly reason: AuthorizationDenial }

export interface GoogleIdentity {
  sub: string
  email: string
  emailVerified: boolean
}

/**
 * Decides whether a verified Google identity may enter the application.
 *
 * The rules, in the PRD's own order:
 *   1. Google must have verified the email.
 *   2. An internal user with the same NORMALIZED email must already exist —
 *      accounts are never auto-provisioned.
 *   3. That user must be Active.
 *   4. Once linked, the stored `sub` must match; a different Google account
 *      claiming the same address is refused.
 *
 * Domain membership grants nothing: `@aizzen.com` alone is not access.
 * Roles are deliberately NOT consulted here — they are read from AppState at
 * decision time, never derived from Google.
 */
export function authorizeGoogleIdentity(
  identity: GoogleIdentity,
  directory: Directory,
): AuthorizationOutcome {
  if (!identity.emailVerified) return { ok: false, reason: 'emailNotVerified' }

  const normalized = normalizeEmail(identity.email)
  const user = directory.users.find((candidate) => normalizeEmail(candidate.email) === normalized)

  if (!user) return { ok: false, reason: 'noInternalUser' }
  if (user.status !== 'Active') return { ok: false, reason: 'userInactive' }

  // First successful login links the account; later logins must match.
  if (user.googleSub !== undefined && user.googleSub !== identity.sub) {
    return { ok: false, reason: 'subMismatch' }
  }

  return { ok: true, user, linkSub: user.googleSub === undefined }
}

/**
 * Every denial reads the same to the user.
 *
 * The specific reason exists only for the audit log — telling a caller which
 * rule failed would reveal whether an address is registered.
 */
export const GENERIC_DENIAL_MESSAGE = 'Sign-in failed. Check your details and try again.'
