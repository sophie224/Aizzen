import { describe, expect, it } from 'vitest'
import type { BusinessUnit } from '../types/index.ts'
import {
  ancestorIds,
  canReparent,
  depthOf,
  descendantIds,
  effectiveScope,
  findTreeProblems,
  flattenTree,
  hierarchyPath,
  inheritedScopeIds,
  isWithinScope,
} from './index.ts'

/*
 * Fixture mirrors the seeded tree, which is the shape the scope rules are
 * specified against (ARCHITECTURE.md §5.4):
 *
 *   Enterprise
 *   ├── Technology Division
 *   │   ├── IT Operations Department
 *   │   └── Information Security
 *   ├── Finance
 *   └── Legal, Risk & Compliance
 */
function unit(id: string, code: string, nameEn: string, parentId: string | null, nameKa = ''): BusinessUnit {
  return { id, code, nameEn, nameKa, parentId, active: true }
}

function makeTree(): BusinessUnit[] {
  return [
    unit('bu_enterprise', 'ENT', 'Enterprise', null, 'საწარმო'),
    unit('bu_technology', 'TECH', 'Technology Division', 'bu_enterprise', 'ტექნოლოგიები'),
    unit('bu_operations', 'OPS', 'IT Operations Department', 'bu_technology'),
    unit('bu_security', 'SEC', 'Information Security', 'bu_technology'),
    unit('bu_finance', 'FIN', 'Finance', 'bu_enterprise'),
    unit('bu_legal', 'LRC', 'Legal, Risk & Compliance', 'bu_enterprise'),
  ]
}

describe('descendantIds', () => {
  it('includes the unit and everything beneath it', () => {
    expect(descendantIds(makeTree(), 'bu_technology').sort()).toEqual(
      ['bu_operations', 'bu_security', 'bu_technology'].sort(),
    )
  })

  it('can exclude the unit itself', () => {
    expect(descendantIds(makeTree(), 'bu_technology', false).sort()).toEqual(
      ['bu_operations', 'bu_security'].sort(),
    )
  })

  it('returns just the leaf for a leaf node', () => {
    expect(descendantIds(makeTree(), 'bu_security')).toEqual(['bu_security'])
  })

  it('returns nothing for an unknown unit', () => {
    expect(descendantIds(makeTree(), 'bu_missing')).toEqual([])
  })

  it('terminates on a cyclic tree', () => {
    const tree = makeTree()
    tree[0].parentId = 'bu_technology' // Enterprise <-> Technology
    expect(() => descendantIds(tree, 'bu_technology')).not.toThrow()
  })
})

describe('ancestorIds and depth', () => {
  it('walks from the immediate parent to the root', () => {
    expect(ancestorIds(makeTree(), 'bu_security')).toEqual(['bu_technology', 'bu_enterprise'])
  })

  it('returns nothing for a root', () => {
    expect(ancestorIds(makeTree(), 'bu_enterprise')).toEqual([])
  })

  it('measures depth from the root', () => {
    const tree = makeTree()
    expect(depthOf(tree, 'bu_enterprise')).toBe(0)
    expect(depthOf(tree, 'bu_technology')).toBe(1)
    expect(depthOf(tree, 'bu_security')).toBe(2)
  })

  it('terminates on a cycle', () => {
    const tree = makeTree()
    tree[0].parentId = 'bu_technology'
    expect(() => ancestorIds(tree, 'bu_security')).not.toThrow()
  })
})

describe('hierarchyPath', () => {
  it('builds the full path root-first', () => {
    expect(hierarchyPath(makeTree(), 'bu_security')).toBe(
      'Enterprise / Technology Division / Information Security',
    )
  })

  it('uses Georgian names where present and falls back to English', () => {
    expect(hierarchyPath(makeTree(), 'bu_security', 'ka')).toBe(
      'საწარმო / ტექნოლოგიები / Information Security',
    )
  })
})

describe('flattenTree', () => {
  it('returns a depth-first list with depths, siblings sorted by name', () => {
    const flattened = flattenTree(makeTree())

    // Siblings use localeCompare, matching the legacy build: collation
    // compares letters case-insensitively, so "Information" precedes "IT".
    expect(flattened.map((entry) => entry.unit.nameEn)).toEqual([
      'Enterprise',
      'Finance',
      'Legal, Risk & Compliance',
      'Technology Division',
      'Information Security',
      'IT Operations Department',
    ])
    expect(flattened[0].depth).toBe(0)
    expect(flattened[1].depth).toBe(1)
    expect(flattened[5].depth).toBe(2)
  })

  it('can exclude inactive units', () => {
    const tree = makeTree()
    tree[4].active = false

    const names = flattenTree(tree, { includeInactive: false }).map((entry) => entry.unit.nameEn)
    expect(names).not.toContain('Finance')
  })

  it('appends orphans rather than hiding them', () => {
    const tree = makeTree()
    tree[5].parentId = 'bu_deleted'

    const names = flattenTree(tree).map((entry) => entry.unit.nameEn)
    expect(names).toContain('Legal, Risk & Compliance')
    expect(names).toHaveLength(6)
  })
})

describe('effective scope inheritance', () => {
  it('a parent grant covers the parent and all descendants', () => {
    expect(effectiveScope(makeTree(), ['bu_technology']).sort()).toEqual(
      ['bu_operations', 'bu_security', 'bu_technology'].sort(),
    )
  })

  it('a child grant covers the child only — no parent, no siblings', () => {
    const scope = effectiveScope(makeTree(), ['bu_security'])

    expect(scope).toEqual(['bu_security'])
    expect(scope).not.toContain('bu_technology') // no upward inheritance
    expect(scope).not.toContain('bu_operations') // no sibling inheritance
  })

  it('a root grant covers the whole tree', () => {
    expect(effectiveScope(makeTree(), ['bu_enterprise'])).toHaveLength(6)
  })

  it('includes a future child added under a granted parent automatically', () => {
    const tree = makeTree()
    const before = effectiveScope(tree, ['bu_technology'])
    expect(before).not.toContain('bu_platform')

    tree.push(unit('bu_platform', 'PLT', 'Platform Engineering', 'bu_technology'))

    const after = effectiveScope(tree, ['bu_technology'])
    expect(after).toContain('bu_platform')
    expect(after).toHaveLength(before.length + 1)
  })

  it('unions multiple direct grants without duplication', () => {
    const scope = effectiveScope(makeTree(), ['bu_finance', 'bu_security', 'bu_finance'])
    expect(scope.sort()).toEqual(['bu_finance', 'bu_security'].sort())
  })

  it('reports membership through isWithinScope', () => {
    const tree = makeTree()
    expect(isWithinScope(tree, ['bu_technology'], 'bu_security')).toBe(true)
    expect(isWithinScope(tree, ['bu_security'], 'bu_technology')).toBe(false)
    expect(isWithinScope(tree, ['bu_security'], 'bu_operations')).toBe(false)
  })

  it('separates inherited units from direct grants', () => {
    expect(inheritedScopeIds(makeTree(), ['bu_technology']).sort()).toEqual(
      ['bu_operations', 'bu_security'].sort(),
    )
    expect(inheritedScopeIds(makeTree(), ['bu_security'])).toEqual([])
  })
})

describe('findTreeProblems', () => {
  it('reports nothing for a healthy tree', () => {
    expect(findTreeProblems(makeTree())).toEqual([])
  })

  it('detects a self-parent', () => {
    const tree = makeTree()
    tree[2].parentId = tree[2].id

    expect(findTreeProblems(tree)).toContainEqual({ unitId: 'bu_operations', kind: 'selfParent' })
  })

  it('detects a parent that does not exist', () => {
    const tree = makeTree()
    tree[3].parentId = 'bu_gone'

    expect(findTreeProblems(tree)).toContainEqual({ unitId: 'bu_security', kind: 'missingParent' })
  })

  it('detects a cycle', () => {
    const tree = makeTree()
    tree[0].parentId = 'bu_technology'

    expect(findTreeProblems(tree).some((problem) => problem.kind === 'cycle')).toBe(true)
  })
})

describe('canReparent', () => {
  const tree = makeTree()

  it('allows promotion to root', () => {
    expect(canReparent(tree, 'bu_security', null)).toBe(true)
  })

  it('allows a valid move to another branch', () => {
    expect(canReparent(tree, 'bu_security', 'bu_finance')).toBe(true)
  })

  it('rejects self-parenting', () => {
    expect(canReparent(tree, 'bu_security', 'bu_security')).toBe(false)
  })

  it('rejects a descendant as parent, which would create a cycle', () => {
    expect(canReparent(tree, 'bu_technology', 'bu_security')).toBe(false)
    expect(canReparent(tree, 'bu_enterprise', 'bu_operations')).toBe(false)
  })

  it('rejects a parent that does not exist', () => {
    expect(canReparent(tree, 'bu_security', 'bu_gone')).toBe(false)
  })
})
