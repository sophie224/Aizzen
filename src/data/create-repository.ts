import { appConfig, type AppConfig } from '../config/index.ts'
import { ApiRepository } from './api-repository.ts'
import { LocalStorageRepository } from './local-storage-repository.ts'
import type { AppRepository } from './repository.ts'

/**
 * Builds the configured storage adapter.
 *
 * This is the whole of the swap. Nothing in `src/features` or `src/app` names
 * a concrete adapter — they depend on `AppRepository` only, so changing
 * `VITE_STORAGE_ADAPTER` changes the backing store with no code edit
 * (ARCHITECTURE.md §4).
 */
export function createRepository(config: AppConfig = appConfig): AppRepository {
  switch (config.storageAdapter) {
    case 'onPremiseApi':
    case 'awsApi':
      return new ApiRepository({ baseUrl: config.apiBaseUrl })
    case 'local':
    default:
      return new LocalStorageRepository()
  }
}
