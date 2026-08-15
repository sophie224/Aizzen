import { useCallback } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import { authenticate, normalizeEmail, type AuthResult, type Credentials } from '../../domain/auth/index.ts'
import { useAuthService } from './auth-service-context.ts'
import { useSessionRepository } from './session-repository-context.ts'
import { useSessionStore } from './session-store.ts'

/*
 * Sign-in and sign-out (ARCHITECTURE.md §6.1).
 *
 * Credential verification is pure and lives in src/domain/auth. This hook only
 * orchestrates the side effects: persist the session reference, and record the
 * attempt in the audit trail.
 */

export interface AuthActions {
  signIn: (credentials: Credentials) => Promise<AuthResult>
  signOut: () => Promise<void>
}

export function useAuth(): AuthActions {
  const store = useAppDataStore()
  const { state } = useAppData()
  const sessionRepository = useSessionRepository()
  const authService = useAuthService()
  const setCurrentUser = useSessionStore((session) => session.setCurrentUser)

  const signIn = useCallback(
    async (credentials: Credentials): Promise<AuthResult> => {
      if (!state) return { ok: false, reason: 'invalidCredentials' }

      const result = authenticate(state.users, credentials)

      if (!result.ok) {
        /*
         * Failed attempts are audited even though the v7 build did not record
         * them — PLAN.md M6 calls for it and the PRD requires failed attempts
         * in the security log. The attempted address is recorded for
         * investigation; the UI still shows only a generic error.
         *
         * Phase 1 caveat: this write is reachable without a session, so the
         * trail can be grown by anyone with the page open. Rate limiting is
         * server-side work in M15.
         */
        await store
          .update({
            mutate: () => undefined,
            audit: {
              actorId: '',
              action: 'auth.login_failed',
              entityType: 'User',
              entityId: '',
              summary: `Failed sign-in attempt for ${normalizeEmail(credentials.email)}`,
            },
          })
          .catch(() => undefined)
        return result
      }

      sessionRepository.write(result.user.id)
      setCurrentUser(result.user.id)

      await store
        .update({
          mutate: () => undefined,
          audit: {
            actorId: result.user.id,
            action: 'auth.login',
            entityType: 'User',
            entityId: result.user.id,
            summary: `Local demo sign-in: ${result.user.email}`,
          },
        })
        .catch(() => undefined)

      return result
    },
    [state, store, sessionRepository, setCurrentUser],
  )

  const signOut = useCallback(async (): Promise<void> => {
    const userId = useSessionStore.getState().currentUserId

    // Clear both sessions first: the audit write must not be able to strand a
    // signed-in session if persistence fails.
    sessionRepository.clear()
    await authService.signOut()
    setCurrentUser(null)

    if (!userId) return

    await store
      .update({
        mutate: () => undefined,
        audit: {
          actorId: userId,
          action: 'auth.logout',
          entityType: 'User',
          entityId: userId,
          summary: 'Signed out',
        },
      })
      .catch(() => undefined)
  }, [store, sessionRepository, authService, setCurrentUser])

  return { signIn, signOut }
}
