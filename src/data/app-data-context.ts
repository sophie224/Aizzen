import { createContext, useContext, useSyncExternalStore } from 'react'
import type { AppDataStore, StoreSnapshot } from './app-data-store.ts'

/*
 * Context object and hooks for the application data store.
 *
 * Kept separate from the provider component so the file exports no components
 * — React Fast Refresh requires a module to export either components or
 * non-components, not both.
 */

export const AppDataContext = createContext<AppDataStore | null>(null)

/** Returns the store itself, for mutations and lifecycle calls. */
export function useAppDataStore(): AppDataStore {
  const store = useContext(AppDataContext)
  if (!store) throw new Error('useAppDataStore must be used inside an AppDataProvider.')
  return store
}

/** Subscribes to the current snapshot: status, state and last error. */
export function useAppData(): StoreSnapshot {
  const store = useAppDataStore()
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
