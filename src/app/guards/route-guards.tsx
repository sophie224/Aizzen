import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import {
  canAccess,
  canOpenAdministration,
  canOpenWebsiteAdministration,
} from '../../domain/permissions/index.ts'
import type { ModuleName, PermissionLevel } from '../../domain/types/index.ts'
import { useCurrentUser } from '../session/use-current-user.ts'
import { AccessDenied } from '../pages/access-denied.tsx'
import { LoadingState } from '../pages/loading-state.tsx'

/*
 * Route guards (ARCHITECTURE.md §5.1, gates 1–3).
 *
 * Two distinct outcomes, deliberately:
 *   - NOT SIGNED IN     -> redirect to /login, remembering where they were
 *   - SIGNED IN, DENIED -> render Access Denied
 *
 * A denied route must never render blank; the user has to be told what
 * happened. Guards decide only after AppState has loaded, otherwise a slow
 * load would look like a permission failure.
 */

export interface RequireAccessProps {
  children: ReactNode
  module: ModuleName
  level?: PermissionLevel
}

/** Requires an active session with at least `level` on `module`. */
export function RequireAccess({ children, module, level = 'read' }: RequireAccessProps) {
  const { user, context, ready } = useCurrentUser()
  const location = useLocation()

  if (!ready) return <LoadingState />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!canAccess(context, module, level)) return <AccessDenied />

  return <>{children}</>
}

/** Requires an active session, without any module requirement. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { user, ready } = useCurrentUser()
  const location = useLocation()

  if (!ready) return <LoadingState />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return <>{children}</>
}

/** Risk Administration — Administrator and Super Administrator only. */
export function RequireAdministration({ children }: { children: ReactNode }) {
  const { user, context, ready } = useCurrentUser()
  const location = useLocation()

  if (!ready) return <LoadingState />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!canOpenAdministration(context)) return <AccessDenied />

  return <>{children}</>
}

/**
 * Website Administration — Super Administrator only.
 *
 * Guarded separately because it sits outside the module permission matrix
 * (ARCHITECTURE.md §5.2).
 */
export function RequireSuperAdministrator({ children }: { children: ReactNode }) {
  const { user, context, ready } = useCurrentUser()
  const location = useLocation()

  if (!ready) return <LoadingState />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!canOpenWebsiteAdministration(context)) return <AccessDenied />

  return <>{children}</>
}
