import type { AppState } from '../domain/types/index.ts'
import { migrateState } from './migration/index.ts'
import { ImportError, type AppRepository } from './repository.ts'

/*
 * Phase 2 adapter scaffold (ARCHITECTURE.md §4, §12).
 *
 * Serves both API-backed configurations:
 *   - on-premises repository API
 *   - AWS-backed API (the browser talks only to this API; the server holds the
 *     IAM credentials and performs S3 access)
 *
 * NO CREDENTIAL EVER APPEARS HERE. `baseUrl` is public configuration; the
 * session travels in an HttpOnly cookie set by the server, never in a header
 * this code constructs and never in browser storage.
 *
 * The methods are deliberately unimplemented. M17 completes them; wiring an
 * adapter that silently half-works would be worse than one that fails loudly.
 */

export interface ApiRepositoryOptions {
  /** Public API origin, e.g. `https://rm.internal.example.com/api`. */
  baseUrl: string
  fetchImpl?: typeof fetch
}

/** Maps an HTTP status to the meaning fixed in ARCHITECTURE.md §10. */
export function describeHttpStatus(status: number): string {
  switch (status) {
    case 400: return 'invalid data'
    case 401: return 'unauthenticated'
    case 403: return 'authenticated but not authorized'
    case 404: return 'not found, or hidden by scope'
    case 409: return 'version conflict or duplicate'
    case 422: return 'business-rule validation failed'
    case 429: return 'rate limited'
    default: return status >= 500 ? 'unexpected server error' : `unexpected status ${String(status)}`
  }
}

const NOT_IMPLEMENTED = 'ApiRepository is a scaffold; it is completed in milestone M17.'

export class ApiRepository implements AppRepository {
  readonly #baseUrl: string
  readonly #fetch: typeof fetch

  constructor(options: ApiRepositoryOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, '')
    this.#fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  /** Public API origin this adapter targets. */
  get baseUrl(): string {
    return this.#baseUrl
  }

  getState(): Promise<AppState> {
    void this.#fetch
    return Promise.reject(new Error(NOT_IMPLEMENTED))
  }

  saveState(): Promise<AppState> {
    return Promise.reject(new Error(NOT_IMPLEMENTED))
  }

  reset(): Promise<AppState> {
    return Promise.reject(new Error(NOT_IMPLEMENTED))
  }

  /**
   * Serialisation is transport-independent, so it already matches the
   * localStorage adapter byte for byte.
   */
  exportJson(state: AppState): string {
    return JSON.stringify(
      { exportedAt: new Date().toISOString(), app: 'AIZEN Risk & Compliance', schemaVersion: state.schemaVersion, state },
      null,
      2,
    )
  }

  importJson(text: string): Promise<AppState> {
    // Validation is shared with the local adapter; only the write differs.
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unparseable input'
      return Promise.reject(new ImportError([`root: invalid JSON (${detail})`]))
    }

    const outcome = migrateState(parsed)
    if (!outcome.ok) return Promise.reject(new ImportError(outcome.errors))

    return Promise.reject(new Error(NOT_IMPLEMENTED))
  }
}
