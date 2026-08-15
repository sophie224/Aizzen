import type { Category } from '../../domain/types/index.ts'

/**
 * Risk Category Library 2026 — 5 Level-1 groups, 38 Level-2 categories.
 *
 * IDs are `cat_01`–`cat_38` in this exact order, matching the legacy v7 build,
 * so risks imported from a v7 backup keep resolving their category reference
 * (ARCHITECTURE.md §4.1).
 */
const CATEGORY_ROWS: readonly (readonly [level1: string, level2: string])[] = [
  ['Strategic', 'Business Model'],
  ['Strategic', 'Competition'],
  ['Strategic', 'External Environment'],
  ['Strategic', 'Geopolitical'],
  ['Strategic', 'Merger and Acquisition'],
  ['Strategic', 'Transformation'],
  ['Strategic', 'Product Innovation'],
  ['Strategic', 'AI'],
  ['Reputational', 'Stakeholder'],
  ['Reputational', 'Social Licence/Public relations & Crisis'],
  ['Reputational', 'Responsible Gaming'],
  ['Operational', 'Property'],
  ['Operational', 'Third Party & Vendor Management'],
  ['Operational', 'Change Management'],
  ['Operational', 'Cyber Security'],
  ['Operational', 'Data Governance'],
  ['Operational', 'Payments'],
  ['Operational', 'People & Talent'],
  ['Operational', 'Product Development'],
  ['Operational', 'Service Delivery & Operations'],
  ['Operational', 'Technology Infrastructure & Platforms'],
  ['Operational', 'Business Continuity & Resilience'],
  ['Operational', 'Sports Trading Operations'],
  ['Operational', 'Business Process Failures'],
  ['Operational', 'Fraud (Internal/External)'],
  ['Operational', 'Customer Operations'],
  ['Operational', 'Governance & Oversight'],
  ['Legal and Compliance', 'Ethics, Conduct & Integrity'],
  ['Legal and Compliance', 'Claims & Litigation'],
  ['Legal and Compliance', 'Regulatory (incl. reporting)'],
  ['Legal and Compliance', 'Data Privacy & Protection'],
  ['Legal and Compliance', 'Financial Crime'],
  ['Legal and Compliance', 'ESG'],
  ['Financial', 'Credit'],
  ['Financial', 'Liquidity & Funding (Treasury)'],
  ['Financial', 'Market'],
  ['Financial', 'Tax'],
  ['Financial', 'Financial Reporting & Accounting'],
]

/** Georgian labels for the five Level-1 groups. */
const LEVEL_1_KA: Record<string, string> = {
  Strategic: 'სტრატეგიული',
  Reputational: 'რეპუტაციული',
  Operational: 'ოპერაციული',
  'Legal and Compliance': 'იურიდიული და შესაბამისობა',
  Financial: 'ფინანსური',
}

export function createSeedCategories(): Category[] {
  return CATEGORY_ROWS.map(([level1En, level2En], index) => ({
    id: `cat_${String(index + 1).padStart(2, '0')}`,
    level1En,
    level1Ka: LEVEL_1_KA[level1En] ?? '',
    level2En,
    // Level-2 Georgian labels are not yet supplied; the UI falls back to
    // English when a Georgian label is empty (ARCHITECTURE.md §9).
    level2Ka: '',
    active: true,
  }))
}

/** Distinct Level-1 group names, in seed order. */
export const LEVEL_1_GROUPS: readonly string[] = [...new Set(CATEGORY_ROWS.map(([level1]) => level1))]
