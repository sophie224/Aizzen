import type { BusinessUnit, Language } from '../types/index.ts'
import { pickLanguage } from '../localisation/index.ts'

/*
 * OU-style Business Unit tree (ARCHITECTURE.md §5.4).
 *
 *   Direct grant on a parent → parent + ALL descendants, including future ones
 *   Direct grant on a child  → child + its descendants only
 *   No upward inheritance. No sibling inheritance.
 *
 * Every walk here is cycle-safe: repair runs at load, but these helpers must
 * not hang on a hand-edited or partially-repaired tree.
 */

function indexById(units: readonly BusinessUnit[]): Map<string, BusinessUnit> {
  return new Map(units.map((unit) => [unit.id, unit]))
}

/**
 * The unit and everything beneath it.
 *
 * `includeSelf: false` returns descendants only — used where a node's own
 * risks should be excluded from a subtree roll-up.
 */
export function descendantIds(
  units: readonly BusinessUnit[],
  unitId: string,
  includeSelf = true,
): string[] {
  const childrenOf = new Map<string | null, BusinessUnit[]>()
  for (const unit of units) {
    const siblings = childrenOf.get(unit.parentId) ?? []
    siblings.push(unit)
    childrenOf.set(unit.parentId, siblings)
  }

  const result: string[] = []
  const visited = new Set<string>()

  const walk = (id: string): void => {
    if (visited.has(id)) return
    visited.add(id)
    result.push(id)
    for (const child of childrenOf.get(id) ?? []) walk(child.id)
  }

  if (includeSelf) {
    if (units.some((unit) => unit.id === unitId)) walk(unitId)
  } else {
    visited.add(unitId)
    for (const child of childrenOf.get(unitId) ?? []) walk(child.id)
  }

  return result
}

/** Ancestors from the immediate parent upward to the root. */
export function ancestorIds(units: readonly BusinessUnit[], unitId: string): string[] {
  const byId = indexById(units)
  const result: string[] = []
  const visited = new Set<string>([unitId])

  let current = byId.get(unitId)
  while (current?.parentId) {
    if (visited.has(current.parentId)) break
    visited.add(current.parentId)
    result.push(current.parentId)
    current = byId.get(current.parentId)
  }
  return result
}

/** Distance from the root. A root node has depth 0. */
export function depthOf(units: readonly BusinessUnit[], unitId: string): number {
  return ancestorIds(units, unitId).length
}

/** Full hierarchy path, e.g. `Enterprise / Technology Division / Information Security`. */
export function hierarchyPath(
  units: readonly BusinessUnit[],
  unitId: string,
  language: Language = 'en',
): string {
  const byId = indexById(units)
  const parts: string[] = []
  const visited = new Set<string>()

  let current = byId.get(unitId)
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    parts.unshift(pickLanguage(current.nameEn, current.nameKa, language))
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return parts.join(' / ')
}

export interface FlattenedUnit {
  readonly unit: BusinessUnit
  readonly depth: number
}

/**
 * Depth-first flattening for tree pickers, siblings sorted by name.
 *
 * Any unit orphaned by a broken parent link is appended at the end rather than
 * dropped, so a damaged tree never hides a unit from an administrator.
 */
export function flattenTree(
  units: readonly BusinessUnit[],
  options: { includeInactive?: boolean } = {},
): FlattenedUnit[] {
  const includeInactive = options.includeInactive ?? true
  const eligible = units.filter((unit) => includeInactive || unit.active)
  const result: FlattenedUnit[] = []
  const visited = new Set<string>()

  const walk = (parentId: string | null, depth: number): void => {
    eligible
      .filter((unit) => unit.parentId === parentId)
      .sort((a, b) => a.nameEn.localeCompare(b.nameEn))
      .forEach((unit) => {
        if (visited.has(unit.id)) return
        visited.add(unit.id)
        result.push({ unit, depth })
        walk(unit.id, depth + 1)
      })
  }

  walk(null, 0)

  eligible
    .filter((unit) => !visited.has(unit.id))
    .sort((a, b) => a.nameEn.localeCompare(b.nameEn))
    .forEach((unit) => result.push({ unit, depth: 0 }))

  return result
}

/**
 * Effective scope for a set of direct grants: each granted unit plus all of
 * its descendants. Never includes parents or siblings.
 */
export function effectiveScope(
  units: readonly BusinessUnit[],
  directUnitIds: readonly string[],
): string[] {
  const scope = new Set<string>()
  for (const unitId of directUnitIds) {
    for (const id of descendantIds(units, unitId)) scope.add(id)
  }
  return [...scope]
}

/** True when `unitId` falls inside the effective scope of the direct grants. */
export function isWithinScope(
  units: readonly BusinessUnit[],
  directUnitIds: readonly string[],
  unitId: string,
): boolean {
  return effectiveScope(units, directUnitIds).includes(unitId)
}

/** Units inherited through a parent grant — shown as `Inherited` and not individually removable. */
export function inheritedScopeIds(
  units: readonly BusinessUnit[],
  directUnitIds: readonly string[],
): string[] {
  const direct = new Set(directUnitIds)
  return effectiveScope(units, directUnitIds).filter((id) => !direct.has(id))
}

export interface TreeProblem {
  readonly unitId: string
  readonly kind: 'selfParent' | 'missingParent' | 'cycle'
}

/**
 * Reports structural problems without mutating anything.
 *
 * The repair pass in `src/data/migration` fixes these at load; this is the
 * read-only counterpart used to validate an administrator's edit before save
 * (ARCHITECTURE.md §8.5).
 */
export function findTreeProblems(units: readonly BusinessUnit[]): TreeProblem[] {
  const byId = indexById(units)
  const problems: TreeProblem[] = []

  for (const unit of units) {
    if (unit.parentId === null) continue

    if (unit.parentId === unit.id) {
      problems.push({ unitId: unit.id, kind: 'selfParent' })
      continue
    }
    if (!byId.has(unit.parentId)) {
      problems.push({ unitId: unit.id, kind: 'missingParent' })
      continue
    }

    const seen = new Set<string>([unit.id])
    let cursor = byId.get(unit.parentId)
    while (cursor) {
      if (seen.has(cursor.id)) {
        problems.push({ unitId: unit.id, kind: 'cycle' })
        break
      }
      seen.add(cursor.id)
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    }
  }

  return problems
}

/**
 * Whether `candidateParentId` may be assigned as the parent of `unitId`.
 *
 * Blocks self-parenting and any choice that would create a cycle — the two
 * validation rules the Business Unit editor must enforce on save.
 */
export function canReparent(
  units: readonly BusinessUnit[],
  unitId: string,
  candidateParentId: string | null,
): boolean {
  if (candidateParentId === null) return true
  if (candidateParentId === unitId) return false
  if (!units.some((unit) => unit.id === candidateParentId)) return false
  // A descendant cannot become the parent of its own ancestor.
  return !descendantIds(units, unitId).includes(candidateParentId)
}
