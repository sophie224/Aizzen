import type { ActionStatus, IsoDate, RemediationAction } from '../types/index.ts'
import { isBefore } from '../dates/index.ts'

/*
 * Remediation action rules (ARCHITECTURE.md §3.4).
 *
 * Overdue is DERIVED, never stored: the UI may show an Overdue badge over a
 * different stored open status.
 */

export function isActionOverdue(action: Pick<RemediationAction, 'dueDate' | 'status'>, today: IsoDate): boolean {
  return action.status !== 'Completed' && isBefore(action.dueDate, today)
}

/** The status to display, which may differ from the stored status. */
export function displayActionStatus(
  action: Pick<RemediationAction, 'dueDate' | 'status'>,
  today: IsoDate,
): ActionStatus {
  return isActionOverdue(action, today) ? 'Overdue' : action.status
}

/** Progress is 0–100 in steps of 5; out-of-range input is clamped. */
export const PROGRESS_STEP = 5

export function normaliseProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  const clamped = Math.min(100, Math.max(0, value))
  return Math.round(clamped / PROGRESS_STEP) * PROGRESS_STEP
}

export interface ActionPlanSummary {
  readonly total: number
  readonly completed: number
  readonly overdue: number
  readonly averageProgress: number
}

/** Aggregate used by the Action Plan Progress widget and the risk overview. */
export function summariseActions(
  actions: readonly RemediationAction[],
  today: IsoDate,
): ActionPlanSummary {
  const total = actions.length
  if (total === 0) return { total: 0, completed: 0, overdue: 0, averageProgress: 0 }

  const completed = actions.filter((action) => action.status === 'Completed').length
  const overdue = actions.filter((action) => isActionOverdue(action, today)).length
  const averageProgress =
    actions.reduce((sum, action) => sum + normaliseProgress(action.progress), 0) / total

  return { total, completed, overdue, averageProgress }
}
