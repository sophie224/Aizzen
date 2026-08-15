import { create } from 'zustand'
import type { Language } from '../../domain/types/index.ts'

/*
 * Session and UI state (ARCHITECTURE.md §2.1).
 *
 * Deliberately NOT authoritative business data — that lives in AppState behind
 * the repository. This store holds only what the current browser session
 * needs: the signed-in user reference, the active language and transient UI
 * flags.
 *
 * It stores a user ID, never a role or permission. Roles are always read from
 * AppState at decision time, so revoking a role takes effect immediately
 * rather than at next sign-in (ARCHITECTURE.md §5).
 *
 * Persisting the reference across a refresh is the SessionRepository's job in
 * src/data — browser storage is out of bounds here.
 */

export interface SessionState {
  /** ID of the signed-in user, or null when signed out. */
  currentUserId: string | null
  /**
   * False until the persisted session has been read and resolved. Guards must
   * wait: deciding early would bounce a returning user to sign-in.
   */
  sessionRestored: boolean
  language: Language
  navOpen: boolean

  setCurrentUser: (userId: string | null) => void
  markSessionRestored: () => void
  setLanguage: (language: Language) => void
  toggleLanguage: () => void
  setNavOpen: (open: boolean) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  currentUserId: null,
  sessionRestored: false,
  language: 'en',
  navOpen: false,

  setCurrentUser: (currentUserId) => set({ currentUserId, navOpen: false }),
  markSessionRestored: () => set({ sessionRestored: true }),
  setLanguage: (language) => set({ language }),
  toggleLanguage: () => set((state) => ({ language: state.language === 'en' ? 'ka' : 'en' })),
  setNavOpen: (navOpen) => set({ navOpen }),
}))

/** Resets the store between tests. */
export function resetSessionStore(): void {
  useSessionStore.setState({
    currentUserId: null,
    sessionRestored: false,
    language: 'en',
    navOpen: false,
  })
}
