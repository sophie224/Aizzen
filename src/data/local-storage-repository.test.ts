import { beforeEach, describe, expect, it, vi } from 'vitest'
import baseline from '../../fixtures/legacy-state.json'
import { STORAGE_KEY } from '../domain/types/index.ts'
import { validateAppState } from '../domain/validation/app-state.ts'
import { AppDataStore } from './app-data-store.ts'
import { LocalStorageRepository, type StorageLike } from './local-storage-repository.ts'
import { ImportError, RepositoryWriteError } from './repository.ts'

/** In-memory Storage stand-in, so tests never depend on a real browser. */
class FakeStorage implements StorageLike {
  readonly map = new Map<string, string>()
  failWrites = false

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('QuotaExceededError')
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }
}

let storage: FakeStorage
let repository: LocalStorageRepository

beforeEach(() => {
  storage = new FakeStorage()
  repository = new LocalStorageRepository({
    storage,
    now: () => '2026-01-05T10:00:00.000Z',
  })
})

describe('LocalStorageRepository.getState', () => {
  it('seeds and persists when storage is empty', async () => {
    const state = await repository.getState()

    expect(state.schemaVersion).toBe(11)
    expect(storage.map.has(STORAGE_KEY)).toBe(true)
    expect(validateAppState(state).ok).toBe(true)
  })

  it('uses the retained v3 storage key', async () => {
    await repository.getState()
    expect([...storage.map.keys()]).toEqual(['erm-risk-management-v3-state'])
  })

  it('migrates a stored legacy v7 payload and rewrites it at the current version', async () => {
    storage.map.set(STORAGE_KEY, JSON.stringify(baseline.state))

    const state = await repository.getState()
    expect(state.schemaVersion).toBe(11)
    expect(state.risks).toHaveLength(8)

    // The upgrade is persisted, so it happens once rather than on every load.
    const stored: unknown = JSON.parse(storage.map.get(STORAGE_KEY) ?? '{}')
    expect((stored as { schemaVersion: number }).schemaVersion).toBe(11)
  })

  it('does not rewrite storage when the payload is already current', async () => {
    const first = await repository.getState()
    const afterFirst = storage.map.get(STORAGE_KEY)

    const setItem = vi.spyOn(storage, 'setItem')
    const second = await repository.getState()

    expect(setItem).not.toHaveBeenCalled()
    expect(storage.map.get(STORAGE_KEY)).toBe(afterFirst)
    expect(second.risks.length).toBe(first.risks.length)
  })

  it('falls back to a seed without destroying unreadable stored data', async () => {
    storage.map.set(STORAGE_KEY, '{ corrupt json')

    const state = await repository.getState()
    expect(state.schemaVersion).toBe(11)
    // The unreadable original is preserved so the user can still recover it.
    expect(storage.map.get(STORAGE_KEY)).toBe('{ corrupt json')
  })
})

describe('LocalStorageRepository.saveState', () => {
  it('stamps the current schema version', async () => {
    const state = await repository.getState()
    const saved = await repository.saveState({ ...state, schemaVersion: 3 })

    expect(saved.schemaVersion).toBe(11)
  })

  it('raises RepositoryWriteError when storage refuses the write', async () => {
    const state = await repository.getState()
    storage.failWrites = true

    await expect(repository.saveState(state)).rejects.toBeInstanceOf(RepositoryWriteError)
  })
})

describe('LocalStorageRepository import/export', () => {
  it('round-trips export -> clear -> import to an equal state', async () => {
    const original = await repository.getState()
    const exported = repository.exportJson(original)

    storage.map.clear()

    const imported = await repository.importJson(exported)
    expect(imported).toEqual(original)
    expect(storage.map.has(STORAGE_KEY)).toBe(true)
  })

  it('exports the documented backup envelope', async () => {
    const state = await repository.getState()
    const payload: unknown = JSON.parse(repository.exportJson(state))

    expect(payload).toMatchObject({
      exportedAt: '2026-01-05T10:00:00.000Z',
      app: 'AIZEN Risk & Compliance',
      schemaVersion: 11,
    })
  })

  it('imports a legacy v7 backup, migrating it in flight', async () => {
    await repository.getState()

    const imported = await repository.importJson(JSON.stringify(baseline))
    expect(imported.schemaVersion).toBe(11)
    expect(imported.risks).toHaveLength(8)
    expect(imported.risks.map((risk) => risk.ref)).toContain('IT-001')
  })

  it('leaves stored state unchanged when the JSON is malformed', async () => {
    await repository.getState()
    const before = storage.map.get(STORAGE_KEY)

    await expect(repository.importJson('{ not json')).rejects.toBeInstanceOf(ImportError)
    expect(storage.map.get(STORAGE_KEY)).toBe(before)
  })

  it('leaves stored state unchanged when the structure is invalid', async () => {
    await repository.getState()
    const before = storage.map.get(STORAGE_KEY)

    await expect(repository.importJson(JSON.stringify({ users: [] }))).rejects.toBeInstanceOf(
      ImportError,
    )
    expect(storage.map.get(STORAGE_KEY)).toBe(before)
  })
})

describe('LocalStorageRepository.reset', () => {
  it('restores the seed', async () => {
    await repository.importJson(JSON.stringify(baseline))
    expect((await repository.getState()).risks).toHaveLength(8)

    const reseeded = await repository.reset()
    expect(reseeded.risks).toHaveLength(0)
    expect(reseeded.categories).toHaveLength(38)
  })
})

describe('AppDataStore mutation pipeline', () => {
  function makeStore() {
    let sequence = 0
    return new AppDataStore({
      repository,
      clock: () => '2026-02-01T12:00:00.000Z',
      createId: (prefix) => `${prefix}_test_${String(++sequence)}`,
    })
  }

  it('loads state through the repository', async () => {
    const store = makeStore()
    await store.load()

    expect(store.getSnapshot().status).toBe('ready')
    expect(store.getSnapshot().state?.schemaVersion).toBe(11)
  })

  it('applies the mutator to a clone, never to published state', async () => {
    const store = makeStore()
    await store.load()
    const before = store.getSnapshot().state

    await store.update({
      mutate: (draft) => {
        draft.categories[0].active = false
      },
    })

    expect(before?.categories[0].active).toBe(true)
    expect(store.getSnapshot().state?.categories[0].active).toBe(false)
  })

  it('appends an audit event newest-first', async () => {
    const store = makeStore()
    await store.load()

    await store.update({
      mutate: (draft) => {
        draft.branding.clientLogo = 'data:image/png;base64,AAAA'
      },
      audit: {
        actorId: 'usr_admin',
        action: 'branding.updated',
        entityType: 'Branding',
        entityId: 'branding',
        summary: 'Client logo replaced.',
      },
    })

    const events = store.getSnapshot().state?.auditEvents ?? []
    expect(events[0]).toMatchObject({
      id: 'audit_test_1',
      date: '2026-02-01T12:00:00.000Z',
      action: 'branding.updated',
    })
  })

  it('mirrors a risk audit event onto the risk itself', async () => {
    const store = makeStore()
    await store.load()
    await store.importJson(JSON.stringify(baseline))

    const riskId = store.getSnapshot().state?.risks[0].id ?? ''
    await store.update({
      mutate: (draft) => {
        draft.risks[0].statusNarrative = 'Updated narrative.'
      },
      audit: {
        actorId: 'usr_admin',
        action: 'risk.updated',
        entityType: 'Risk',
        entityId: riskId,
        summary: 'Status narrative updated.',
        changes: ['statusNarrative'],
      },
    })

    const risk = store.getSnapshot().state?.risks[0]
    expect(risk?.audit[0].action).toBe('risk.updated')
    expect(store.getSnapshot().state?.auditEvents[0].id).toBe(risk?.audit[0].id)
  })

  it('keeps the previous state and surfaces the error when the write fails', async () => {
    const store = makeStore()
    await store.load()
    const before = store.getSnapshot().state?.categories[0].active

    storage.failWrites = true

    await expect(
      store.update({
        mutate: (draft) => {
          draft.categories[0].active = false
        },
      }),
    ).rejects.toBeInstanceOf(RepositoryWriteError)

    expect(store.getSnapshot().state?.categories[0].active).toBe(before)
    expect(store.getSnapshot().error).toContain('Could not write')
  })

  it('notifies subscribers on each publish', async () => {
    const store = makeStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    await store.load()
    expect(listener).toHaveBeenCalled()

    unsubscribe()
    const callsAfterUnsubscribe = listener.mock.calls.length
    await store.update({ mutate: () => undefined })
    expect(listener.mock.calls.length).toBe(callsAfterUnsubscribe)
  })

  it('refuses to mutate before state is loaded', async () => {
    const store = makeStore()
    await expect(store.update({ mutate: () => undefined })).rejects.toThrow('call load() first')
  })
})
