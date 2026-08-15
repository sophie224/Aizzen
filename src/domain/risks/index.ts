import { isBefore } from '../dates/index.ts'
import type { IsoDate, Risk } from '../types/index.ts'

/*
 * Risk-level derived rules (ARCHITECTURE.md §3.4).
 *
 * Overdue is DERIVED and never stored, exactly as for a remediation action:
 * the Register may show an Overdue badge over a different stored open status.
 */

export function isRiskOverdue(
  risk: Pick<Risk, 'targetDate' | 'status'>,
  today: IsoDate,
): boolean {
  return risk.status !== 'Completed' && isBefore(risk.targetDate, today)
}
