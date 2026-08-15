import type { AppState } from '../domain/types/index.ts'
import { SCHEMA_VERSION, STORAGE_KEY } from '../domain/types/index.ts'
import { migrateState } from './migration/index.ts'
import { createSeedState } from './seed/index.ts'
import { ImportError, RepositoryWriteError, type AppRepository } from './repository.ts'

/*
 * Phase 1 storage adapter (ARCHITECTURE.md §4).
 *
 * This module is the ONLY place in the application permitted to touch browser
 * storage; the ESLint config enforces that everywhere else.
 */

/** Minimal slice of the Storage API, so tests can supply a fake. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface LocalStorageRepositoryOptions {
  storage?: StorageLike
  /** Storage key. Defaults to the retained v3 key — do not change in production. */
  key?: string
  /** Fixed timestamp for export payloads; injected so exports are testable. */
  now?: () => string
}

function defaultStorage(): StorageLike {
  return localStorage
}

export class LocalStorageRepository implements AppRepository {
  readonly #storage: StorageLike
  readonly #key: string
  readonly #now: () => string

  constructor(options: LocalStorageRepositoryOptions = {}) {
    this.#storage = options.storage ?? defaultStorage()
    this.#key = options.key ?? STORAGE_KEY
    this.#now = options.now ?? (() => new Date().toISOString())
  }

  /**
   * Reads, migrating and repairing as needed. Seeds when storage is empty.
   *
   * A stored payload that cannot be migrated is left untouched on disk — the
   * caller gets a fresh seed to work with rather than losing the raw source,
   * so the user can still export it for recovery (ARCHITECTURE.md §10).
   */
  async getState(): Promise<AppState> {
    const raw = this.#storage.getItem(this.#key)

    if (raw === null) {
      const seeded = createSeedState()
      this.#write(seeded)
      return Promise.resolve(seeded)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      return Promise.resolve(createSeedState())
    }

    const outcome = migrateState(parsed)
    if (!outcome.ok) return Promise.resolve(createSeedState())

    // Persist the migrated shape so the upgrade happens once, not every load.
    if (this.#serialise(outcome.result.state) !== raw) this.#write(outcome.result.state)
    return Promise.resolve(outcome.result.state)
  }

  async saveState(state: AppState): Promise<AppState> {
    const next: AppState = { ...state, schemaVersion: SCHEMA_VERSION }
    this.#write(next)
    return Promise.resolve(next)
  }

  async reset(): Promise<AppState> {
    const seeded = createSeedState()
    this.#write(seeded)
    return Promise.resolve(seeded)
  }

  /** Full backup payload, matching the legacy export envelope. */
  exportJson(state: AppState): string {
    return JSON.stringify(
      {
        exportedAt: this.#now(),
        app: 'AIZEN Risk & Compliance',
        schemaVersion: state.schemaVersion,
        state,
      },
      null,
      2,
    )
  }

  /**
   * Validates, migrates and persists an imported backup.
   *
   * Throws `ImportError` without writing when the payload is unusable, so
   * invalid input provably leaves stored state unchanged.
   */
  async importJson(text: string): Promise<AppState> {
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unparseable input'
      throw new ImportError([`root: invalid JSON (${detail})`])
    }

    const outcome = migrateState(parsed)
    if (!outcome.ok) throw new ImportError(outcome.errors)

    this.#write(outcome.result.state)
    return Promise.resolve(outcome.result.state)
  }

  #serialise(state: AppState): string {
    return JSON.stringify(state)
  }

  #write(state: AppState): void {
    try {
      this.#storage.setItem(this.#key, this.#serialise(state))
    } catch (error) {
      // Quota exhaustion is the realistic failure — a large base64 client logo
      // will do it (ARCHITECTURE.md §8.5).
      throw new RepositoryWriteError(
        'Could not write to browser storage. The change was not saved.',
        { cause: error },
      )
    }
  }
}
