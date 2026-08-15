import type { StorageLike } from './local-storage-repository.ts'

/*
 * Session persistence (ARCHITECTURE.md §6.1).
 *
 * The Auth Test Plan requires the session to survive a page refresh. This
 * stores ONE THING: the signed-in user's ID. No password, no token, no
 * permission claim — the user is re-resolved from AppState on every load and
 * their roles are read fresh, so revoking access takes effect immediately.
 *
 * It lives under its own storage key rather than inside AppState, which is a
 * deliberate divergence from the v7 build. In v7 `currentUserId` was part of
 * the persisted state, which meant a full JSON backup carried a session with
 * it — importing a colleague's backup signed you in as them. Separating the
 * two removes that, and keeps sign-in from rewriting the whole state blob.
 *
 * Phase 2 replaces this entirely with a secure, HttpOnly, SameSite cookie
 * issued by the server (ARCHITECTURE.md §6.2). No authentication token is
 * ever written to browser storage.
 */

export const SESSION_STORAGE_KEY = 'erm-risk-management-v3-session'

export interface SessionRepository {
  /** The persisted user ID, or null when signed out. */
  read(): string | null
  write(userId: string): void
  clear(): void
}

export interface LocalSessionRepositoryOptions {
  storage?: StorageLike
  key?: string
}

export class LocalSessionRepository implements SessionRepository {
  readonly #storage: StorageLike
  readonly #key: string

  constructor(options: LocalSessionRepositoryOptions = {}) {
    this.#storage = options.storage ?? localStorage
    this.#key = options.key ?? SESSION_STORAGE_KEY
  }

  read(): string | null {
    try {
      const value = this.#storage.getItem(this.#key)
      return value !== null && value.length > 0 ? value : null
    } catch {
      // A blocked or unavailable store simply means "signed out".
      return null
    }
  }

  write(userId: string): void {
    try {
      this.#storage.setItem(this.#key, userId)
    } catch {
      // Losing refresh-persistence must not break signing in.
    }
  }

  clear(): void {
    try {
      this.#storage.removeItem(this.#key)
    } catch {
      // Nothing useful to do; the in-memory session is already cleared.
    }
  }
}

/** In-memory implementation for tests and for environments without storage. */
export class MemorySessionRepository implements SessionRepository {
  #userId: string | null = null

  read(): string | null {
    return this.#userId
  }
  write(userId: string): void {
    this.#userId = userId
  }
  clear(): void {
    this.#userId = null
  }
}
