import { describe, expect, it } from 'vitest'
import type { AssessmentHistoryItem, Score } from '../types/index.ts'
import { directionToTarget, historicalTrend, riskOutlook } from './index.ts'
import { isActionOverdue, displayActionStatus, normaliseProgress, summariseActions } from '../actions/index.ts'
import { addMonths, isBefore, toIsoDate } from '../dates/index.ts'
import { nextRiskReference, referencePrefix } from '../reference/index.ts'
import type { BusinessUnit } from '../types/index.ts'

function snapshot(residual: Score, date = '2026-01-01'): AssessmentHistoryItem {
  return {
    id: `hist_${date}`,
    date,
    inherent: { impact: 4, likelihood: 4 },
    residual,
    target: { impact: 2, likelihood: 2 },
    note: '',
    actorId: 'usr_owner',
  }
}

describe('historicalTrend', () => {
  it('reports New with fewer than two snapshots', () => {
    expect(historicalTrend([])).toBe('New')
    expect(historicalTrend([snapshot({ impact: 3, likelihood: 3 })])).toBe('New')
  })

  it('reports Improving when the residual score falls', () => {
    expect(
      historicalTrend([
        snapshot({ impact: 4, likelihood: 4 }, '2026-01-01'),
        snapshot({ impact: 2, likelihood: 3 }, '2026-06-01'),
      ]),
    ).toBe('Improving')
  })

  it('reports Worsening when the residual score rises', () => {
    expect(
      historicalTrend([
        snapshot({ impact: 2, likelihood: 2 }, '2026-01-01'),
        snapshot({ impact: 4, likelihood: 4 }, '2026-06-01'),
      ]),
    ).toBe('Worsening')
  })

  it('reports Stable when the residual score is unchanged', () => {
    expect(
      historicalTrend([
        snapshot({ impact: 3, likelihood: 3 }, '2026-01-01'),
        snapshot({ impact: 3, likelihood: 3 }, '2026-06-01'),
      ]),
    ).toBe('Stable')
  })

  it('compares the last two snapshots, ignoring earlier ones', () => {
    expect(
      historicalTrend([
        snapshot({ impact: 1, likelihood: 1 }, '2025-01-01'),
        snapshot({ impact: 5, likelihood: 5 }, '2026-01-01'),
        snapshot({ impact: 4, likelihood: 4 }, '2026-06-01'),
      ]),
    ).toBe('Improving')
  })

  it('compares by score, not by impact alone', () => {
    // 2x5 = 10 then 5x2 = 10 — different shape, same exposure.
    expect(
      historicalTrend([
        snapshot({ impact: 2, likelihood: 5 }, '2026-01-01'),
        snapshot({ impact: 5, likelihood: 2 }, '2026-06-01'),
      ]),
    ).toBe('Stable')
  })
})

describe('directionToTarget', () => {
  it('reports decreasingToTarget when the target sits below residual', () => {
    expect(directionToTarget({ impact: 4, likelihood: 4 }, { impact: 2, likelihood: 2 })).toBe(
      'decreasingToTarget',
    )
  })

  it('reports atTarget when the scores match', () => {
    expect(directionToTarget({ impact: 3, likelihood: 3 }, { impact: 3, likelihood: 3 })).toBe(
      'atTarget',
    )
  })

  it('reports atTarget for different shapes with the same score', () => {
    expect(directionToTarget({ impact: 2, likelihood: 5 }, { impact: 5, likelihood: 2 })).toBe(
      'atTarget',
    )
  })

  it('reports increasing when the target sits above residual', () => {
    expect(directionToTarget({ impact: 2, likelihood: 2 }, { impact: 4, likelihood: 4 })).toBe(
      'increasing',
    )
  })
})

describe('riskOutlook', () => {
  it('returns the stored value untouched, whatever the trend says', () => {
    // Outlook is management judgement and must never be overwritten by the
    // computed trend (ARCHITECTURE.md §7.1).
    const worsening = [
      snapshot({ impact: 2, likelihood: 2 }, '2026-01-01'),
      snapshot({ impact: 5, likelihood: 5 }, '2026-06-01'),
    ]
    expect(historicalTrend(worsening)).toBe('Worsening')
    expect(riskOutlook('Decreasing')).toBe('Decreasing')
  })
})

describe('date helpers', () => {
  it('adds calendar months', () => {
    expect(addMonths('2026-01-15', 12)).toBe('2027-01-15')
    expect(addMonths('2026-01-15', 6)).toBe('2026-07-15')
    expect(addMonths('2026-01-15', 3)).toBe('2026-04-15')
  })

  it('clamps end-of-month overflow instead of spilling into the next month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28')
  })

  it('crosses year boundaries', () => {
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28')
  })

  it('returns the input unchanged for an unparseable date', () => {
    expect(addMonths('not-a-date', 6)).toBe('not-a-date')
  })

  it('compares dates and treats blanks as not-before', () => {
    expect(isBefore('2026-01-01', '2026-06-01')).toBe(true)
    expect(isBefore('2026-06-01', '2026-01-01')).toBe(false)
    expect(isBefore('2026-01-01', '2026-01-01')).toBe(false)
    expect(isBefore('', '2026-01-01')).toBe(false)
  })

  it('formats a Date as an ISO date', () => {
    expect(toIsoDate(new Date('2026-03-09T23:45:00Z'))).toBe('2026-03-09')
  })
})

describe('overdue rule', () => {
  const TODAY = '2026-06-01'

  it('is overdue when the due date has passed and the status is not Completed', () => {
    expect(isActionOverdue({ dueDate: '2026-05-01', status: 'In Progress' }, TODAY)).toBe(true)
  })

  it('is not overdue when Completed, however late', () => {
    expect(isActionOverdue({ dueDate: '2020-01-01', status: 'Completed' }, TODAY)).toBe(false)
  })

  it('is not overdue on the due date itself', () => {
    expect(isActionOverdue({ dueDate: TODAY, status: 'In Progress' }, TODAY)).toBe(false)
  })

  it('is not overdue for a future due date', () => {
    expect(isActionOverdue({ dueDate: '2026-12-01', status: 'Not Started' }, TODAY)).toBe(false)
  })

  it('displays Overdue over another stored open status', () => {
    expect(displayActionStatus({ dueDate: '2026-01-01', status: 'Rescheduled' }, TODAY)).toBe('Overdue')
    expect(displayActionStatus({ dueDate: '2026-12-01', status: 'Rescheduled' }, TODAY)).toBe('Rescheduled')
  })
})

describe('progress normalisation', () => {
  it('snaps to 5-point steps', () => {
    expect(normaliseProgress(52)).toBe(50)
    expect(normaliseProgress(53)).toBe(55)
    expect(normaliseProgress(0)).toBe(0)
    expect(normaliseProgress(100)).toBe(100)
  })

  it('clamps out-of-range values', () => {
    expect(normaliseProgress(-20)).toBe(0)
    expect(normaliseProgress(150)).toBe(100)
    expect(normaliseProgress(Number.NaN)).toBe(0)
  })
})

describe('summariseActions', () => {
  const TODAY = '2026-06-01'

  it('handles an empty plan', () => {
    expect(summariseActions([], TODAY)).toEqual({ total: 0, completed: 0, overdue: 0, averageProgress: 0 })
  })

  it('counts completed and overdue actions and averages progress', () => {
    const summary = summariseActions(
      [
        { id: 'a', title: 'a', description: '', deliverable: '', ownerId: 'u', dueDate: '2026-01-01', status: 'In Progress', priority: 'High', progress: 40, notes: '' },
        { id: 'b', title: 'b', description: '', deliverable: '', ownerId: 'u', dueDate: '2026-01-01', status: 'Completed', priority: 'High', progress: 100, notes: '' },
      ],
      TODAY,
    )

    expect(summary).toEqual({ total: 2, completed: 1, overdue: 1, averageProgress: 70 })
  })
})

describe('risk reference generation', () => {
  const units: BusinessUnit[] = [
    { id: 'bu_tech', code: 'TECH', nameEn: 'Technology', nameKa: '', parentId: null, active: true },
    { id: 'bu_sec', code: 'sec', nameEn: 'Security', nameKa: '', parentId: 'bu_tech', active: true },
    { id: 'bu_blank', code: '  ', nameEn: 'Unnamed', nameKa: '', parentId: null, active: true },
  ]

  it('starts at 001 and increments', () => {
    expect(nextRiskReference('bu_tech', units, [])).toBe('TECH-001')
    expect(nextRiskReference('bu_tech', units, [{ ref: 'TECH-001' }])).toBe('TECH-002')
  })

  it('uppercases the business unit code', () => {
    expect(nextRiskReference('bu_sec', units, [])).toBe('SEC-001')
  })

  it('falls back to ERM when the code is blank', () => {
    expect(nextRiskReference('bu_blank', units, [])).toBe('ERM-001')
    expect(referencePrefix(undefined)).toBe('ERM')
  })

  it('counts only references sharing the prefix', () => {
    const risks = [{ ref: 'TECH-001' }, { ref: 'SEC-009' }, { ref: 'TECH-004' }]
    expect(nextRiskReference('bu_tech', units, risks)).toBe('TECH-005')
    expect(nextRiskReference('bu_sec', units, risks)).toBe('SEC-010')
  })

  it('never reuses a number after a deletion', () => {
    // TECH-002 removed; the next reference must still be 004, not 002.
    const risks = [{ ref: 'TECH-001' }, { ref: 'TECH-003' }]
    expect(nextRiskReference('bu_tech', units, risks)).toBe('TECH-004')
  })

  it('pads to three digits and grows beyond them', () => {
    expect(nextRiskReference('bu_tech', units, [{ ref: 'TECH-008' }])).toBe('TECH-009')
    expect(nextRiskReference('bu_tech', units, [{ ref: 'TECH-999' }])).toBe('TECH-1000')
  })

  it('ignores malformed references', () => {
    const risks = [{ ref: 'TECH-abc' }, { ref: 'TECH-002' }, { ref: '' }]
    expect(nextRiskReference('bu_tech', units, risks)).toBe('TECH-003')
  })

  it('falls back to the first unit when the id does not resolve', () => {
    expect(nextRiskReference('bu_missing', units, [])).toBe('TECH-001')
  })
})
