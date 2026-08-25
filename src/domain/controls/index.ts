import type {
  AppState,
  ControlColumnPreference,
  ControlDeficiency,
  ControlRegisterName,
  ControlRiskLink,
  RegisterControl,
} from '../types/index.ts'
import {
  canAccess,
  hasBusinessUnitAccess,
  isAdministrator,
  type AccessContext,
} from '../permissions/index.ts'

/*
 * Control Register domain logic (CR-2026, FR-CR-01…11 / FR-CD-01…07).
 *
 * Pure: no React, no I/O, no clock and no randomness — every value that
 * depends on those is passed in. The registers, the risk-side panel, the
 * exports and the administration screens all read scale labels and colours
 * from here, so a renamed level or a recoloured chip moves everywhere at once
 * (the rule CLAUDE.md sets for the rating matrix, applied to control scales).
 */

// --- identifiers -------------------------------------------------------------

/**
 * Next business identifier, sequential from `0001` (FR-CR-03, FR-CD-03).
 *
 * Only numeric references take part in the sequence: framework-imported
 * controls keep their own UID (`A.5.1`, `GV.OC-01`), which must never consume
 * or reset a system number. Sequence numbers are never reused.
 */
export function nextSequentialRef(existing: readonly string[]): string {
  let highest = 0
  for (const ref of existing) {
    if (!/^\d+$/.test(ref)) continue
    const value = Number.parseInt(ref, 10)
    if (value > highest) highest = value
  }
  return String(highest + 1).padStart(4, '0')
}

export function nextControlRef(controls: readonly RegisterControl[]): string {
  return nextSequentialRef(controls.map((control) => control.ref))
}

export function nextDeficiencyRef(deficiencies: readonly ControlDeficiency[]): string {
  return nextSequentialRef(deficiencies.map((deficiency) => deficiency.ref))
}

// --- visibility (FR-CR-08, FR-CD-07) ----------------------------------------

/**
 * Gate 4 for a control: the OU it is mapped to must be inside the user's
 * effective scope, which already includes descendants of a granted parent.
 *
 * Deliberately reuses `hasBusinessUnitAccess` rather than reimplementing the
 * hierarchy walk — the CR requires the new modules to consume the existing OU
 * service, not duplicate it.
 */
export function canSeeControl(context: AccessContext, control: RegisterControl): boolean {
  if (!canAccess(context, 'controls', 'read')) return false
  return hasBusinessUnitAccess(context, control.businessUnitId)
}

export function visibleControls(
  context: AccessContext,
  controls: readonly RegisterControl[],
): RegisterControl[] {
  return controls.filter((control) => canSeeControl(context, control))
}

export function canSeeDeficiency(context: AccessContext, deficiency: ControlDeficiency): boolean {
  if (!canAccess(context, 'controls', 'read')) return false
  return hasBusinessUnitAccess(context, deficiency.businessUnitId)
}

export function visibleDeficiencies(
  context: AccessContext,
  deficiencies: readonly ControlDeficiency[],
): ControlDeficiency[] {
  return deficiencies.filter((deficiency) => canSeeDeficiency(context, deficiency))
}

/** Edit rights on the register: `controls: edit` plus OU scope. */
export function canEditControlRecord(context: AccessContext, control: RegisterControl): boolean {
  if (!canAccess(context, 'controls', 'edit')) return false
  return hasBusinessUnitAccess(context, control.businessUnitId)
}

/** Creation needs `controls: edit` and at least one OU to create into. */
export function canCreateControl(context: AccessContext): boolean {
  if (!canAccess(context, 'controls', 'edit')) return false
  if (isAdministrator(context.user)) return true
  return context.user !== null && context.user.businessUnitIds.length > 0
}

// --- risk ⇄ control links (FR-CR-04, FR-CR-05) -------------------------------

/** Register controls linked to a risk, filtered to what the user may see. */
export function linkedControls(
  context: AccessContext,
  state: Pick<AppState, 'controls' | 'controlRiskLinks'>,
  riskId: string,
): RegisterControl[] {
  const linkedIds = new Set(
    state.controlRiskLinks.filter((link) => link.riskId === riskId).map((link) => link.controlId),
  )

  return visibleControls(
    context,
    state.controls.filter((control) => linkedIds.has(control.id)),
  )
}

/** Every control id linked to a risk, unfiltered — for editing the link set. */
export function linkedControlIds(
  links: readonly ControlRiskLink[],
  riskId: string,
): string[] {
  return links.filter((link) => link.riskId === riskId).map((link) => link.controlId)
}

/** Risks a control is linked to. Used when a control is deleted. */
export function linkedRiskIds(links: readonly ControlRiskLink[], controlId: string): string[] {
  return links.filter((link) => link.controlId === controlId).map((link) => link.riskId)
}

/** Findings raised against a control. */
export function deficienciesForControl(
  deficiencies: readonly ControlDeficiency[],
  controlId: string,
): ControlDeficiency[] {
  return deficiencies.filter((deficiency) => deficiency.controlId === controlId)
}

// --- column order (FR-CR-07, FR-CD-05) ---------------------------------------

/**
 * The saved order for a user, reconciled against the columns that exist now.
 *
 * Unknown ids are dropped and new columns appended, so a stale preference can
 * never hide a column or blank the grid — the CR requires that losing this
 * preference never blocks rendering.
 */
export function orderedColumns(
  preferences: readonly ControlColumnPreference[],
  userId: string,
  register: ControlRegisterName,
  available: readonly string[],
): string[] {
  const saved = preferences.find(
    (preference) => preference.userId === userId && preference.register === register,
  )
  if (!saved) return [...available]

  const known = new Set(available)
  const ordered = saved.columnIds.filter((id) => known.has(id))
  const missing = available.filter((id) => !ordered.includes(id))

  return [...ordered, ...missing]
}

/** Moves `columnId` to the position of `targetId`, returning a new order. */
export function moveColumn(order: readonly string[], columnId: string, targetId: string): string[] {
  if (columnId === targetId) return [...order]

  const from = order.indexOf(columnId)
  const to = order.indexOf(targetId)
  if (from < 0 || to < 0) return [...order]

  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, columnId)
  return next
}

// --- search and sort ---------------------------------------------------------

/** Case-insensitive match across the fields a user would search by. */
export function matchesControlSearch(control: RegisterControl, term: string): boolean {
  const needle = term.trim().toLowerCase()
  if (needle.length === 0) return true

  return [control.ref, control.name, control.objective].some((field) =>
    field.toLowerCase().includes(needle),
  )
}

/**
 * Type-ahead lookup for the deficiency form and the risk linker (FR-CD-04).
 * Ranks a reference or name prefix above a mid-string hit so typing a control
 * ID lands on it first.
 */
export function searchControls(
  controls: readonly RegisterControl[],
  term: string,
  limit = 20,
): RegisterControl[] {
  const needle = term.trim().toLowerCase()
  if (needle.length === 0) return controls.slice(0, limit)

  const scored: Array<{ control: RegisterControl; score: number }> = []
  for (const control of controls) {
    const ref = control.ref.toLowerCase()
    const name = control.name.toLowerCase()
    if (ref.startsWith(needle) || name.startsWith(needle)) scored.push({ control, score: 0 })
    else if (ref.includes(needle) || name.includes(needle)) scored.push({ control, score: 1 })
    else if (control.objective.toLowerCase().includes(needle)) scored.push({ control, score: 2 })
  }

  return scored
    .sort((a, b) => a.score - b.score || a.control.ref.localeCompare(b.control.ref))
    .slice(0, limit)
    .map((entry) => entry.control)
}

/** Overdue is DERIVED, never stored: a target date in the past (§5.4). */
export function isDeficiencyOverdue(deficiency: ControlDeficiency, today: string): boolean {
  return deficiency.targetDate !== '' && deficiency.targetDate < today
}

export * from './scales.ts'
export * from './defaults.ts'
export * from './columns.ts'
export * from './frameworks.ts'
export * from './import.ts'
