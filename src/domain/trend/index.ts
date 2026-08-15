import type { AssessmentHistoryItem, Score, Trend } from '../types/index.ts'
import { riskScore } from '../risk-engine/index.ts'

/*
 * Trend, direction and outlook are THREE DISTINCT indicators
 * (ARCHITECTURE.md §7.1). They are routinely confused; keeping them in one
 * module makes the difference explicit.
 *
 *   Historical Trend   — computed, from the last two history snapshots
 *   Direction to Target — computed, target vs residual
 *   Risk Outlook        — MANUAL management judgement, never computed
 */

/**
 * Compares the residual score of the two most recent history snapshots.
 *
 * History is stored oldest-first, so the comparison uses the final two items.
 */
export function historicalTrend(history: readonly AssessmentHistoryItem[]): Trend {
  if (history.length < 2) return 'New'

  const current = riskScore(history[history.length - 1].residual)
  const previous = riskScore(history[history.length - 2].residual)

  if (current < previous) return 'Improving'
  if (current > previous) return 'Worsening'
  return 'Stable'
}

export const DIRECTIONS_TO_TARGET = ['decreasingToTarget', 'atTarget', 'increasing'] as const
export type DirectionToTarget = (typeof DIRECTIONS_TO_TARGET)[number]

/**
 * Compares the target score against the current residual score.
 *
 * `decreasingToTarget` means the target sits below residual — the risk is
 * expected to come down. `increasing` means the target sits above residual,
 * which usually signals a target that needs revisiting.
 */
export function directionToTarget(residual: Score, target: Score): DirectionToTarget {
  const targetScore = riskScore(target)
  const residualScore = riskScore(residual)

  if (targetScore < residualScore) return 'decreasingToTarget'
  if (targetScore > residualScore) return 'increasing'
  return 'atTarget'
}

/**
 * Returns the stored outlook unchanged.
 *
 * Exists to make the rule enforceable and greppable: outlook reflects
 * management judgement and must never be overwritten by `historicalTrend`.
 */
export function riskOutlook<T>(storedOutlook: T): T {
  return storedOutlook
}
