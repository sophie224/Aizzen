import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { AppDataContext } from './app-data-context.ts'
import { AppDataStore } from './app-data-store.ts'
import { createRepository } from './create-repository.ts'

/*
 * React binding for the application data store (ARCHITECTURE.md §2.1).
 *
 * The store owns the authoritative AppState and the single mutation
 * transaction; this component only wires it into the tree. UI state — active
 * language, signed-in user, modal visibility — belongs to the session store,
 * not here.
 */

export interface AppDataProviderProps {
  children: ReactNode
  /** Injectable for tests and Storybook; defaults to the configured adapter. */
  store?: AppDataStore
}

export function AppDataProvider({ children, store }: AppDataProviderProps) {
  const resolved = useMemo(
    () => store ?? new AppDataStore({ repository: createRepository() }),
    [store],
  )

  useEffect(() => {
    void resolved.load()
  }, [resolved])

  return <AppDataContext.Provider value={resolved}>{children}</AppDataContext.Provider>
}
