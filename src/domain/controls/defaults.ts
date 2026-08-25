import type { ControlConfig, ControlScaleLevel } from '../types/index.ts'

/*
 * Default control scales (CR-2026 §5.2, §5.4, FR-CR-09).
 *
 * Levels carry a STABLE `key` and a display label. An administrator may rename
 * a level or recolour it; the key is what controls store, so renaming never
 * rewrites a record, a filter or an export — the same contract the rating
 * matrix holds for its four rating keys (CLAUDE.md, CR-003).
 *
 * Colours are seeded from the platform's rating palette so the two surfaces
 * read as one product on day one; they are configuration from then on.
 */

/*
 * A four-step ramp whose hues stay distinguishable AFTER the badge indicator
 * is darkened for contrast (Design Uplift v2 §6.2).
 *
 * The rating palette's amber and yellow both converge on a dark gold once
 * darkened, which left two adjacent effectiveness levels reading the same at
 * dot size. Orange and yellow-green stay apart at every step of that process.
 * These are seeded defaults only — an administrator may set any colour, and
 * the contrast contract holds whatever they choose.
 */
const RED = '#F32121'
const ORANGE = '#E8710A'
const LIME = '#8DB600'
const GREEN = '#00B050'
const GREY = '#98A0B3'
const NAVY = '#1A2151'

/** Starting colour for a level an administrator adds in Administration. */
export const DEFAULT_LEVEL_COLOR = GREY

/** Default scale from the change request: four effectiveness levels. */
export const DEFAULT_EFFECTIVENESS: ControlScaleLevel[] = [
  { key: 'not_assessed', labelEn: 'Not Assessed', labelKa: 'არ არის შეფასებული', color: GREY },
  { key: 'ineffective', labelEn: 'Ineffective', labelKa: 'არაეფექტური', color: RED },
  {
    key: 'partially_effective',
    labelEn: 'Partially Effective',
    labelKa: 'ნაწილობრივ ეფექტური',
    color: ORANGE,
  },
  {
    key: 'substantially_effective',
    labelEn: 'Substantially Effective',
    labelKa: 'მნიშვნელოვნად ეფექტური',
    color: LIME,
  },
  { key: 'effective', labelEn: 'Effective', labelKa: 'ეფექტური', color: GREEN },
]

/** Maturity levels are configurable; these are the seeded defaults. */
export const DEFAULT_MATURITY: ControlScaleLevel[] = [
  { key: 'not_assessed', labelEn: 'Not Assessed', labelKa: 'არ არის შეფასებული', color: GREY },
  { key: 'initial', labelEn: 'Initial', labelKa: 'საწყისი', color: RED },
  { key: 'developing', labelEn: 'Developing', labelKa: 'განვითარებადი', color: ORANGE },
  { key: 'defined', labelEn: 'Defined', labelKa: 'განსაზღვრული', color: LIME },
  { key: 'managed', labelEn: 'Managed', labelKa: 'მართვადი', color: GREEN },
  { key: 'optimised', labelEn: 'Optimised', labelKa: 'ოპტიმიზირებული', color: NAVY },
]

/** "e.g. Low / Medium / High each with an assigned colour" (§5.2). */
export const DEFAULT_ASSURANCE: ControlScaleLevel[] = [
  { key: 'none', labelEn: 'Not Assured', labelKa: 'არ არის დადასტურებული', color: GREY },
  { key: 'low', labelEn: 'Low', labelKa: 'დაბალი', color: RED },
  { key: 'medium', labelEn: 'Medium', labelKa: 'საშუალო', color: ORANGE },
  { key: 'high', labelEn: 'High', labelKa: 'მაღალი', color: GREEN },
]

/** Finding Classification list (§5.4), administrator-configurable. */
export const DEFAULT_CLASSIFICATIONS: ControlScaleLevel[] = [
  { key: 'observation', labelEn: 'Observation', labelKa: 'შენიშვნა', color: GREY },
  { key: 'low', labelEn: 'Low', labelKa: 'დაბალი', color: GREEN },
  { key: 'medium', labelEn: 'Medium', labelKa: 'საშუალო', color: LIME },
  { key: 'high', labelEn: 'High', labelKa: 'მაღალი', color: ORANGE },
  { key: 'critical', labelEn: 'Critical', labelKa: 'კრიტიკული', color: RED },
]

/** The configuration a fresh tenant starts from. */
export function createDefaultControlConfig(): ControlConfig {
  return {
    version: 1,
    effectiveness: DEFAULT_EFFECTIVENESS.map((level) => ({ ...level })),
    maturity: DEFAULT_MATURITY.map((level) => ({ ...level })),
    assurance: DEFAULT_ASSURANCE.map((level) => ({ ...level })),
    classifications: DEFAULT_CLASSIFICATIONS.map((level) => ({ ...level })),
    customColumns: [],
  }
}
