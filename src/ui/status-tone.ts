import type { ActionStatus, RiskStatus } from '../domain/types/index.ts'

/*
 * Pill tones for the two status vocabularies.
 *
 * The status WORD is always rendered by the pill — the tone only reinforces
 * it, so colour never carries meaning alone (ARCHITECTURE.md §9). Risk and
 * action statuses overlap deliberately; mapping both here keeps the Register,
 * the risk detail and the editor from drifting apart.
 */

export type PillTone = 'neutral' | 'info' | 'warn' | 'danger' | 'success'

const TONES: Record<string, PillTone> = {
  Draft: 'neutral',
  'Not Started': 'neutral',
  Monitoring: 'neutral',
  'In Progress': 'info',
  Rescheduled: 'info',
  Blocked: 'warn',
  Overdue: 'danger',
  Completed: 'success',
  Accepted: 'success',
}

export function statusTone(status: RiskStatus | ActionStatus): PillTone {
  return TONES[status] ?? 'neutral'
}
