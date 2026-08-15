import type { BusinessUnit, Risk } from '../types/index.ts'

/*
 * Risk reference generation (ARCHITECTURE.md §7.2).
 *
 *   prefix = uppercase(businessUnit.code)      // fallback 'ERM' when blank
 *   next   = max(existing suffixes for that prefix) + 1
 *   ref    = prefix-<3 digits>                 // TECH-001, SEC-004
 */

/** Used when the selected Business Unit has no code, or none is selected. */
export const FALLBACK_REFERENCE_PREFIX = 'ERM'

export function referencePrefix(unit: BusinessUnit | undefined): string {
  const code = unit?.code.trim() ?? ''
  return (code.length > 0 ? code : FALLBACK_REFERENCE_PREFIX).toUpperCase()
}

/**
 * Next available reference for a Business Unit.
 *
 * Sequence numbers are never reused: the next value is derived from the
 * highest existing suffix, not from the count, so deleting or archiving a risk
 * cannot cause a collision.
 */
export function nextRiskReference(
  businessUnitId: string,
  businessUnits: readonly BusinessUnit[],
  risks: readonly Pick<Risk, 'ref'>[],
): string {
  const unit = businessUnits.find((candidate) => candidate.id === businessUnitId) ?? businessUnits[0]
  const prefix = referencePrefix(unit)

  const highest = risks.reduce((max, risk) => {
    if (!risk.ref.startsWith(`${prefix}-`)) return max
    const suffix = Number(risk.ref.slice(prefix.length + 1))
    return Number.isFinite(suffix) ? Math.max(max, suffix) : max
  }, 0)

  return `${prefix}-${String(highest + 1).padStart(3, '0')}`
}
