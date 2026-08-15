import type { AppState } from '../domain/types/index.ts'

/**
 * The storage contract (ARCHITECTURE.md §4).
 *
 * Every configuration — localStorage, on-premises API, AWS-backed API —
 * implements exactly this interface, so the adapter can be swapped through
 * configuration alone with no change to business logic or UI.
 *
 * Declared verbatim from the specification (p. 62). Do not widen it without a
 * corresponding architecture change: any method added here has to be
 * implementable by all three adapters.
 */
export interface AppRepository {
  /** Loads current state, seeding and migrating as required. */
  getState(): Promise<AppState>

  /** Persists the supplied state and returns what was stored. */
  saveState(state: AppState): Promise<AppState>

  /** Replaces stored state with a fresh seed. */
  reset(): Promise<AppState>

  /** Serialises state as a full JSON backup payload. */
  exportJson(state: AppState): string

  /**
   * Parses, validates, migrates and persists an imported backup.
   *
   * Must leave existing state untouched when the input is invalid — the
   * caller relies on this to satisfy "invalid JSON import → no state
   * replacement" (ARCHITECTURE.md §10).
   */
  importJson(text: string): Promise<AppState>
}

/** Raised when an import payload cannot be parsed or fails validation. */
export class ImportError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`Import rejected: ${issues.slice(0, 3).join('; ')}`)
    this.name = 'ImportError'
    this.issues = issues
  }
}

/** Raised when the adapter cannot write. The caller keeps its modal draft. */
export class RepositoryWriteError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'RepositoryWriteError'
  }
}
