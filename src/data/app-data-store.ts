import type { AppState, AuditEvent } from '../domain/types/index.ts'
import type { AppRepository } from './repository.ts'

/*
 * The single mutation transaction (ARCHITECTURE.md §2.2).
 *
 *   read state -> deep-clone -> apply deterministic mutator
 *     -> append audit event -> repository.save -> publish
 *
 * Kept free of React so the pipeline can be tested directly. The context in
 * app-data-context.tsx is a thin binding over this store.
 *
 * In Phase 2 the same sequence becomes a server transaction: entity write,
 * history and audit commit together, and a failed audit insert rolls the
 * mutation back.
 */

/** An audit event minus the fields the store stamps. */
export type AuditEventInput = Omit<AuditEvent, 'id' | 'date'>

export interface UpdateRecipe {
  /**
   * Applies the change to a cloned draft. Must be deterministic — no clock
   * reads, no randomness, no I/O.
   */
  mutate: (draft: AppState) => void
  /**
   * The audit event to record. Every mutation should produce one; omit it
   * only for changes that are not user-visible business events.
   */
  audit?: AuditEventInput | ((draft: AppState) => AuditEventInput | null)
}

export interface AppDataStoreOptions {
  repository: AppRepository
  /** Injected so audit timestamps are deterministic under test. */
  clock?: () => string
  /** Injected so audit IDs are deterministic under test. */
  createId?: (prefix: string) => string
}

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface StoreSnapshot {
  readonly status: StoreStatus
  readonly state: AppState | null
  readonly error: string | null
}

function defaultCreateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export class AppDataStore {
  readonly #repository: AppRepository
  readonly #clock: () => string
  readonly #createId: (prefix: string) => string
  readonly #listeners = new Set<() => void>()

  #snapshot: StoreSnapshot = { status: 'idle', state: null, error: null }

  constructor(options: AppDataStoreOptions) {
    this.#repository = options.repository
    this.#clock = options.clock ?? (() => new Date().toISOString())
    this.#createId = options.createId ?? defaultCreateId
  }

  getSnapshot = (): StoreSnapshot => this.#snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** Loads from the repository, migrating and seeding as required. */
  async load(): Promise<void> {
    this.#publish({ status: 'loading', state: this.#snapshot.state, error: null })
    try {
      const state = await this.#repository.getState()
      this.#publish({ status: 'ready', state, error: null })
    } catch (error) {
      this.#publish({ status: 'error', state: this.#snapshot.state, error: describe(error) })
    }
  }

  /**
   * Runs one mutation through the pipeline.
   *
   * On a write failure the previously published state is retained and the
   * error is surfaced, so a caller can keep its modal draft open
   * (ARCHITECTURE.md §10).
   */
  async update(recipe: UpdateRecipe): Promise<AppState> {
    const current = this.#requireState()

    // 2. deep-clone — the mutator never touches published state.
    const draft = structuredClone(current)

    // 3. apply the deterministic mutator.
    recipe.mutate(draft)

    // 4. append the audit event.
    const input = typeof recipe.audit === 'function' ? recipe.audit(draft) : recipe.audit
    if (input) {
      const event: AuditEvent = { ...input, id: this.#createId('audit'), date: this.#clock() }
      // Newest first, globally and on the risk it belongs to.
      draft.auditEvents = [event, ...draft.auditEvents]
      if (input.entityType === 'Risk') {
        const risk = draft.risks.find((candidate) => candidate.id === input.entityId)
        if (risk) risk.audit = [event, ...risk.audit]
      }
    }

    // 5. persist, then 6. publish.
    try {
      const saved = await this.#repository.saveState(draft)
      this.#publish({ status: 'ready', state: saved, error: null })
      return saved
    } catch (error) {
      this.#publish({ status: 'ready', state: current, error: describe(error) })
      throw error
    }
  }

  async reset(): Promise<AppState> {
    const state = await this.#repository.reset()
    this.#publish({ status: 'ready', state, error: null })
    return state
  }

  /** Leaves published state untouched when the payload is rejected. */
  async importJson(text: string): Promise<AppState> {
    const state = await this.#repository.importJson(text)
    this.#publish({ status: 'ready', state, error: null })
    return state
  }

  exportJson(): string {
    return this.#repository.exportJson(this.#requireState())
  }

  clearError(): void {
    if (this.#snapshot.error !== null) this.#publish({ ...this.#snapshot, error: null })
  }

  #requireState(): AppState {
    const { state } = this.#snapshot
    if (!state) throw new Error('AppDataStore has no state yet — call load() first.')
    return state
  }

  #publish(snapshot: StoreSnapshot): void {
    this.#snapshot = snapshot
    for (const listener of this.#listeners) listener()
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error'
}
