import { describe, expect, it } from 'vitest'
import type { AppConfig } from '../config/index.ts'
import { STORAGE_ADAPTERS } from '../config/index.ts'
import { ApiRepository } from './api-repository.ts'
import { createRepository } from './create-repository.ts'
import { LocalStorageRepository } from './local-storage-repository.ts'
import type { AppRepository } from './repository.ts'

/*
 * The PRD requires three interchangeable storage configurations sharing one
 * data contract, selectable through configuration alone (ARCHITECTURE.md §4).
 * These tests hold that seam honest.
 */

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    storageAdapter: 'local',
    apiBaseUrl: 'https://rm.example.com/api',
    authServiceUrl: '',
    controlRegistersEnabled: true,
    ...overrides,
  }
}

describe('adapter selection', () => {
  it('offers exactly the three documented configurations', () => {
    expect([...STORAGE_ADAPTERS]).toEqual(['local', 'onPremiseApi', 'awsApi'])
  })

  it('builds the localStorage adapter for the local configuration', () => {
    expect(createRepository(config({ storageAdapter: 'local' }))).toBeInstanceOf(
      LocalStorageRepository,
    )
  })

  it('builds the API adapter for the on-premises configuration', () => {
    expect(createRepository(config({ storageAdapter: 'onPremiseApi' }))).toBeInstanceOf(
      ApiRepository,
    )
  })

  it('builds the API adapter for the AWS configuration', () => {
    // The browser addresses the application API, never S3 directly — no AWS
    // credential can reach the frontend (ARCHITECTURE.md §4).
    const repository = createRepository(config({ storageAdapter: 'awsApi' }))
    expect(repository).toBeInstanceOf(ApiRepository)
    expect((repository as ApiRepository).baseUrl).toBe('https://rm.example.com/api')
  })

  it('falls back to local storage for an unrecognised adapter name', () => {
    const unknown = { storageAdapter: 'sqlite', apiBaseUrl: '' } as unknown as AppConfig
    expect(createRepository(unknown)).toBeInstanceOf(LocalStorageRepository)
  })
})

describe('contract conformance', () => {
  /*
   * Every adapter must expose the full AppRepository surface. This is what
   * lets callers depend on the interface alone; if an adapter drops a method,
   * the swap stops being transparent.
   */
  const METHODS = ['getState', 'saveState', 'reset', 'exportJson', 'importJson'] as const

  for (const adapter of STORAGE_ADAPTERS) {
    it(`implements every AppRepository method for "${adapter}"`, () => {
      const repository: AppRepository = createRepository(config({ storageAdapter: adapter }))
      for (const method of METHODS) {
        expect(typeof repository[method]).toBe('function')
      }
    })
  }

  it('serialises exports identically across adapters', async () => {
    const local = createRepository(config({ storageAdapter: 'local' }))
    const api = createRepository(config({ storageAdapter: 'awsApi' }))
    const state = await local.getState()

    const parse = (text: string) => {
      const payload = JSON.parse(text) as Record<string, unknown>
      delete payload.exportedAt // the only field that varies — a timestamp
      return payload
    }

    expect(parse(api.exportJson(state))).toEqual(parse(local.exportJson(state)))
  })
})

describe('ApiRepository scaffold', () => {
  const repository = new ApiRepository({ baseUrl: 'https://rm.example.com/api/' })

  it('normalises a trailing slash off the base URL', () => {
    expect(repository.baseUrl).toBe('https://rm.example.com/api')
  })

  it('fails loudly rather than silently half-working', async () => {
    await expect(repository.getState()).rejects.toThrow('milestone M17')
    await expect(repository.saveState()).rejects.toThrow('milestone M17')
    await expect(repository.reset()).rejects.toThrow('milestone M17')
  })

  it('rejects invalid imports before reaching the network', async () => {
    await expect(repository.importJson('{ bad json')).rejects.toThrow('Import rejected')
  })
})
