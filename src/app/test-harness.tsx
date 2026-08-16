import { render, type RenderResult } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppDataStore } from '../data/app-data-store.ts'
import { AppDataProvider } from '../data/app-data-provider.tsx'
import { LocalStorageRepository, type StorageLike } from '../data/local-storage-repository.ts'
import {
  MemorySessionRepository,
  type SessionRepository,
} from '../data/session-repository.ts'
import { AppRoutes } from './routes.tsx'
import { SessionBootstrap } from './session/session-bootstrap.tsx'
import { SessionRepositoryContext } from './session/session-repository-context.ts'
import { resetSessionStore, useSessionStore } from './session/session-store.ts'

/*
 * Shared harness for shell and authentication tests.
 *
 * Uses the real repositories over in-memory storage, so tests exercise the
 * genuine load → migrate → seed and session-restore paths rather than mocks
 * of them.
 */

export class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>()

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
}

export interface RenderAppOptions {
  route?: string
  /**
   * Seeded user ID to treat as already signed in. Written to the session
   * repository, so it exercises the same restore path a refresh would.
   */
  signedInAs?: string
  language?: 'en' | 'ka'
  /** Reused across renders to simulate a page refresh. */
  storage?: MemoryStorage
  sessionRepository?: SessionRepository
}

export interface RenderAppResult extends RenderResult {
  storage: MemoryStorage
  sessionRepository: SessionRepository
}

export function renderApp(options: RenderAppOptions = {}): RenderAppResult {
  const {
    route = '/dashboard',
    signedInAs,
    language = 'en',
    storage = new MemoryStorage(),
    sessionRepository = new MemorySessionRepository(),
  } = options

  resetSessionStore()
  useSessionStore.getState().setLanguage(language)
  if (signedInAs) sessionRepository.write(signedInAs)

  const store = new AppDataStore({
    repository: new LocalStorageRepository({ storage }),
  })

  const view = render(
    <AppDataProvider store={store}>
      <SessionRepositoryContext.Provider value={sessionRepository}>
        <SessionBootstrap>
          <MemoryRouter initialEntries={[route]}>
            <AppRoutes />
          </MemoryRouter>
        </SessionBootstrap>
      </SessionRepositoryContext.Provider>
    </AppDataProvider>,
  )

  return Object.assign(view, { storage, sessionRepository })
}

/** Seeded account IDs, by the role each one exercises. */
export const SEEDED = {
  superAdmin: 'usr_super_admin',
  admin: 'usr_admin',
  riskManager: 'usr_manager',
  riskOwner: 'usr_owner',
  controlOwner: 'usr_control',
  actionOwner: 'usr_action',
  auditor: 'usr_auditor',
} as const

/** Demo credentials, matching the seeded directory. */
export const CREDENTIALS = {
  admin: { email: 'admin@erm.local', password: 'Admin#2026' },
  superAdmin: { email: 'superadmin@aizen.local', password: 'Aizen#2026' },
  riskManager: { email: 'risk.manager@erm.local', password: 'Test#2026' },
  riskOwner: { email: 'risk.owner@erm.local', password: 'Owner#2026' },
  controlOwner: { email: 'control.owner@erm.local', password: 'Control#2026' },
  actionOwner: { email: 'action.owner@erm.local', password: 'Action#2026' },
  auditor: { email: 'auditor@erm.local', password: 'Audit#2026' },
} as const
