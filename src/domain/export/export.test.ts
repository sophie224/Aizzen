import { describe, expect, it } from 'vitest'
import { DEFAULT_RATING_COLORS, defaultRatingFor } from '../risk-engine/default-matrix.ts'
import { SCALE_VALUES } from '../types/enums.ts'
import type {
  AssessmentHistoryItem,
  BusinessUnit,
  Category,
  CustomAttribute,
  MatrixCell,
  RatingMatrix,
  Risk,
  Score,
  User,
} from '../types/index.ts'
import {
  availableCompactColumns,
  buildExportRows,
  csvCell,
  escapeXml,
  toCsv,
  toggleCompactColumn,
  toSpreadsheetXml,
  type ExportContext,
} from './index.ts'

// --- fixtures ---------------------------------------------------------------

const UNITS: BusinessUnit[] = [
  { id: 'bu_ent', code: 'ENT', nameEn: 'Enterprise', nameKa: '', parentId: null, active: true },
  { id: 'bu_tech', code: 'TECH', nameEn: 'Technology', nameKa: 'ტექნოლოგია', parentId: 'bu_ent', active: true },
]

const CATEGORIES: Category[] = [
  { id: 'cat_cyber', level1En: 'Operational', level1Ka: 'ოპერაციული', level2En: 'Cyber Security', level2Ka: '', active: true },
]

const USERS: User[] = [
  { id: 'usr_a', name: 'Nino Kapanadze', title: '', email: 'n@erm.local', password: 'x', status: 'Active', roleIds: [], businessUnitIds: [] },
]

const ATTRIBUTES: CustomAttribute[] = [
  { id: 'attr_appetite', labelEn: 'Appetite status', labelKa: '', type: 'select', options: [], active: true, showInRegister: true },
  { id: 'attr_off', labelEn: 'Retired field', labelKa: '', type: 'text', options: [], active: false, showInRegister: true },
]

function makeMatrix(): RatingMatrix {
  const cells: MatrixCell[] = []
  for (const impact of SCALE_VALUES) {
    for (const likelihood of SCALE_VALUES) {
      cells.push({ impact, likelihood, rating: defaultRatingFor(impact, likelihood) })
    }
  }
  return {
    cells,
    colors: { ...DEFAULT_RATING_COLORS },
    impactLabels: { 1: { en: 'Minor', ka: '' }, 2: { en: 'Moderate', ka: '' }, 3: { en: 'Major', ka: '' }, 4: { en: 'Severe', ka: '' }, 5: { en: 'Critical', ka: '' } },
    likelihoodLabels: {
      1: { en: 'Remote', ka: '', probability: '' }, 2: { en: 'Unlikely', ka: '', probability: '' },
      3: { en: 'Possible', ka: '', probability: '' }, 4: { en: 'Likely', ka: '', probability: '' },
      5: { en: 'Almost Certain', ka: '', probability: '' },
    },
  }
}

function snapshot(residual: Score, date: string): AssessmentHistoryItem {
  return {
    id: `h_${date}`, date, inherent: { impact: 4, likelihood: 4 }, residual,
    target: { impact: 2, likelihood: 2 }, note: '', actorId: 'usr_a',
  }
}

function risk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'risk_1', ref: 'TECH-001', title: 'Legacy fragility', type: 'Current',
    categoryId: 'cat_cyber', businessUnitId: 'bu_tech', riskOwnerId: 'usr_a',
    originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2026-07-01',
    status: 'In Progress', responseType: 'Mitigate', outlook: 'Stable',
    cause: 'A cause', event: 'An event', consequence: 'A consequence', statusNarrative: '',
    inherent: { impact: 4, likelihood: 4 },
    residual: { impact: 3, likelihood: 3 },
    target: { impact: 2, likelihood: 2 },
    controls: [], actions: [],
    acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
    custom: { attr_appetite: 'Watch Trigger' }, history: [], audit: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const context: ExportContext = {
  categories: CATEGORIES, businessUnits: UNITS, users: USERS,
  customAttributes: ATTRIBUTES, matrix: makeMatrix(),
}

// --- rows -------------------------------------------------------------------

describe('export rows', () => {
  it('carries the documented columns in order', () => {
    const [row] = buildExportRows([risk()], context)

    expect(Object.keys(row).slice(0, 10)).toEqual([
      'Risk ID', 'Risk Name', 'Category L1', 'Category L2', 'Business Unit',
      'Business Unit Path', 'Risk Owner', 'Cause', 'Event', 'Consequence',
    ])
  })

  it('computes score and rating from the matrix rather than reading a stored value', () => {
    const [row] = buildExportRows([risk()], context)

    expect(row['Residual Score']).toBe(9)
    expect(row['Residual Rating']).toBe('Medium')
    expect(row['Inherent Score']).toBe(16)
    expect(row['Target Score']).toBe(4)
  })

  it('follows a reconfigured matrix', () => {
    const edited = makeMatrix()
    const cell = edited.cells.find((c) => c.impact === 3 && c.likelihood === 3)
    if (cell) cell.rating = 'Significant'

    const [row] = buildExportRows([risk()], { ...context, matrix: edited })
    expect(row['Residual Rating']).toBe('Significant')
    // The arithmetic score is unaffected by a rating change.
    expect(row['Residual Score']).toBe(9)
  })

  it('includes the full business unit hierarchy path', () => {
    const [row] = buildExportRows([risk()], context)
    expect(row['Business Unit Path']).toBe('Enterprise / Technology')
  })

  it('joins controls and actions into single cells', () => {
    const withChildren = risk({
      controls: [
        { id: 'c1', title: 'Patch cycle', ownerId: 'usr_a', performer: '', description: '', frequency: '', intendedOutcome: '', evidenceLocation: '', keyControl: false, type: 'Preventative', automation: 'Manual', status: 'Effective' },
        { id: 'c2', title: 'Scanning', ownerId: 'usr_a', performer: '', description: '', frequency: '', intendedOutcome: '', evidenceLocation: '', keyControl: false, type: 'Detective', automation: 'Automated', status: 'Effective' },
      ],
      actions: [
        { id: 'a1', title: 'Rollout', description: '', deliverable: '', ownerId: 'usr_a', dueDate: '2026-06-01', status: 'In Progress', priority: 'High', progress: 40, notes: '' },
      ],
    })

    const [row] = buildExportRows([withChildren], context)
    expect(row.Controls).toBe('Patch cycle; Scanning')
    expect(row['Action Plans']).toBe('Rollout (In Progress, 2026-06-01)')
  })

  it('includes the computed historical trend', () => {
    const trended = risk({
      history: [snapshot({ impact: 4, likelihood: 4 }, '2026-01-01'), snapshot({ impact: 2, likelihood: 2 }, '2026-06-01')],
    })
    expect(buildExportRows([trended], context)[0]['Historical Trend']).toBe('Improving')
  })

  it('appends ACTIVE custom attributes only', () => {
    const [row] = buildExportRows([risk()], context)

    expect(row['Appetite status']).toBe('Watch Trigger')
    expect(row).not.toHaveProperty('Retired field')
  })

  it('writes an empty string for a custom attribute with no value', () => {
    const [row] = buildExportRows([risk({ custom: {} })], context)
    expect(row['Appetite status']).toBe('')
  })

  it('returns one row per risk and nothing for an empty set', () => {
    expect(buildExportRows([risk(), risk({ id: 'r2' })], context)).toHaveLength(2)
    expect(buildExportRows([], context)).toEqual([])
  })
})

// --- CSV --------------------------------------------------------------------

describe('CSV escaping', () => {
  it('quotes every value', () => {
    expect(csvCell('plain')).toBe('"plain"')
    expect(csvCell(42)).toBe('"42"')
  })

  it('escapes embedded quotes by doubling them', () => {
    expect(csvCell('He said "stop"')).toBe('"He said ""stop"""')
  })

  it('keeps commas and newlines safe inside the quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"')
  })

  it('treats null and undefined as empty', () => {
    expect(csvCell(undefined)).toBe('""')
  })
})

describe('toCsv', () => {
  it('emits a header row followed by one row per risk', () => {
    const csv = toCsv(buildExportRows([risk()], context))
    const lines = csv.split('\n')

    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('"Risk ID"')
    expect(lines[1]).toContain('"TECH-001"')
  })

  it('starts with a UTF-8 BOM so Excel reads Georgian correctly', () => {
    expect(toCsv(buildExportRows([risk()], context)).charCodeAt(0)).toBe(0xfeff)
  })

  it('survives a value containing a comma, a quote and a newline', () => {
    const messy = risk({ title: 'Comma, "quoted"\nand a newline' })
    const csv = toCsv(buildExportRows([messy], context))

    expect(csv).toContain('"Comma, ""quoted""\nand a newline"')
    // Header plus the two physical lines of the embedded newline.
    expect(csv.split('\n')).toHaveLength(3)
  })

  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('')
  })
})

// --- SpreadsheetML ----------------------------------------------------------

describe('escapeXml', () => {
  it('escapes all five entities', () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;')
  })
})

describe('toSpreadsheetXml', () => {
  const xml = toSpreadsheetXml(buildExportRows([risk()], context))

  it('emits a SpreadsheetML 2003 workbook', () => {
    expect(xml.startsWith('<?xml version="1.0"?>')).toBe(true)
    expect(xml).toContain('urn:schemas-microsoft-com:office:spreadsheet')
    expect(xml).toContain('<Worksheet ss:Name="Risk Register">')
  })

  it('emits a header row plus one row per risk', () => {
    expect(xml.match(/<Row>/g)).toHaveLength(2)
  })

  it('types numeric cells as Number so Excel can aggregate them', () => {
    expect(xml).toContain('<Data ss:Type="Number">9</Data>')
    expect(xml).toContain('<Data ss:Type="String">TECH-001</Data>')
  })

  it('escapes XML-significant characters in values', () => {
    const messy = toSpreadsheetXml(buildExportRows([risk({ title: 'A & B <tag>' })], context))
    expect(messy).toContain('A &amp; B &lt;tag&gt;')
  })

  it('includes active custom attributes as columns', () => {
    expect(xml).toContain('Appetite status')
    expect(xml).not.toContain('Retired field')
  })

  it('returns an empty string for no rows', () => {
    expect(toSpreadsheetXml([])).toBe('')
  })
})

// --- compact register columns -----------------------------------------------

describe('compact register columns', () => {
  it('adds a column that is not selected', () => {
    expect(toggleCompactColumn(['ref'], 'title')).toEqual(['ref', 'title'])
  })

  it('removes a selected column', () => {
    expect(toggleCompactColumn(['ref', 'title'], 'title')).toEqual(['ref'])
  })

  it('refuses to drop the last remaining column', () => {
    expect(toggleCompactColumn(['ref'], 'ref')).toEqual(['ref'])
  })

  it('offers base columns plus active custom attributes', () => {
    const available = availableCompactColumns(ATTRIBUTES).map((column) => column.id)

    expect(available).toContain('ref')
    expect(available).toContain('residual')
    expect(available).toContain('attr_appetite')
    expect(available).not.toContain('attr_off')
  })
})
