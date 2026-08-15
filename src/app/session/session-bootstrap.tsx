import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useAppData } from '../../data/app-data-context.ts'
import { resolveSessionUser } from '../../domain/auth/index.ts'
import { useAuthService } from './auth-service-context.ts'
import { useSessionRepository } from './session-repository-context.ts'
import { useSessionStore } from './session-store.ts'

/*
 * Restores a persisted session on load (ARCHITECTURE.md §6.1).
 *
 * The stored value is a user ID and nothing else, so it is re-validated
 * against AppState every time: an account deactivated or deleted since the
 * last visit resolves to null and the stale reference is discarded.
 *
 * Guards wait on `sessionRestored`, otherwise a returning user would be
 * bounced to sign-in for the moment before restoration completes.
 */
export function SessionBootstrap({ children }: { children: ReactNode }) {
  const { state, status } = useAppData()
  const sessionRepository = useSessionRepository()
  const authService = useAuthService()
  const setCurrentUser = useSessionStore((session) => session.setCurrentUser)
  const markSessionRestored = useSessionStore((session) => session.markSessionRestored)
  const sessionRestored = useSessionStore((session) => session.sessionRestored)

  useEffect(() => {
    if (sessionRestored || status !== 'ready' || !state) return

    let cancelled = false

    const restore = async () => {
      /*
       * The server session wins when one exists: it is the authenticated
       * source. The local reference is the Phase 1 credential fallback.
       */
      const remoteId = authService.enabled ? await authService.readSession() : null
      if (cancelled) return

      const persistedId = remoteId ?? sessionRepository.read()
      // Re-validated against AppState either way — a deactivated account is
      // refused however it signed in.
      const user = resolveSessionUser(state.users, persistedId)

      if (user) {
        setCurrentUser(user.id)
      } else if (persistedId) {
        sessionRepository.clear()
        setCurrentUser(null)
      }

      markSessionRestored()
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [state, status, sessionRestored, sessionRepository, authService, setCurrentUser, markSessionRestored])

  return <>{children}</>
}
