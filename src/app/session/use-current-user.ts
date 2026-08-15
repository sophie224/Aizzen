import { useMemo } from 'react'
import { useAppData } from '../../data/app-data-context.ts'
import { resolveSessionUser } from '../../domain/auth/index.ts'
import type { AccessContext } from '../../domain/permissions/index.ts'
import type { User } from '../../domain/types/index.ts'
import { useSessionStore } from './session-store.ts'

/*
 * Bridges the session reference (who is signed in) with AppState (who they
 * actually are) to build the AccessContext every guard needs.
 *
 * The context is derived, never stored: revoking a role or deactivating a user
 * takes effect on the next state evaluation, with no session to invalidate
 * (ARCHITECTURE.md §5).
 */

export interface CurrentUserResult {
  user: User | null
  context: AccessContext
  /**
   * False while AppState is loading OR the persisted session is still being
   * restored. Guards must not decide until both are settled.
   */
  ready: boolean
}

export function useCurrentUser(): CurrentUserResult {
  const currentUserId = useSessionStore((session) => session.currentUserId)
  const sessionRestored = useSessionStore((session) => session.sessionRestored)
  const { state, status } = useAppData()

  return useMemo(() => {
    const ready = status === 'ready' && state !== null && sessionRestored
    if (!state) {
      return { user: null, context: { user: null, roles: [], businessUnits: [] }, ready }
    }

    // An account deactivated mid-session stops being a valid principal at once.
    const user = resolveSessionUser(state.users, currentUserId)

    return {
      user,
      context: { user, roles: state.roles, businessUnits: state.businessUnits },
      ready,
    }
  }, [currentUserId, sessionRestored, state, status])
}
