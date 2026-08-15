import type { IsoDate } from '../types/index.ts'

/*
 * Date helpers.
 *
 * Nothing here reads the clock. `today` is always passed in, which is what
 * keeps the default-date and overdue rules deterministic under test
 * (see src/domain/README.md).
 */

/** Formats a Date as `YYYY-MM-DD`. The only place a Date object is used. */
export function toIsoDate(value: Date): IsoDate {
  return value.toISOString().slice(0, 10)
}

/**
 * Adds calendar months to an ISO date.
 *
 * Anchored at midday to avoid the timezone rollover that makes naive date
 * arithmetic land on the previous day west of UTC.
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const anchored = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(anchored.getTime())) return date

  const targetMonth = anchored.getUTCMonth() + months
  const candidate = new Date(anchored)
  candidate.setUTCMonth(targetMonth)

  // Clamp end-of-month overflow: 31 Jan + 1 month is 28/29 Feb, not 2/3 Mar.
  if (candidate.getUTCDate() !== anchored.getUTCDate()) {
    candidate.setUTCDate(0)
  }
  return toIsoDate(candidate)
}

/** True when `date` falls strictly before `reference`. Empty dates are never before. */
export function isBefore(date: IsoDate, reference: IsoDate): boolean {
  if (!date || !reference) return false
  return date < reference
}
