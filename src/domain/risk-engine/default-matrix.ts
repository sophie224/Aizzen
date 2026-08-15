import { RATING_LABELS, SCALE_VALUES, type RatingLabel, type ScaleValue } from '../types/enums.ts'
import type {
  ImpactLabel,
  LikelihoodLabel,
  MatrixCell,
  RatingLevel,
  RatingMatrix,
} from '../types/master-data.ts'

/*
 * Risk Rating Matrix 2026 defaults (ARCHITECTURE.md §7).
 *
 * This lives in the domain, not in the seed, because it is a standard the
 * engine reasons about — it supplies the fallback rating when a configured
 * cell is missing, and "Restore defaults" must reproduce it exactly. The data
 * layer imports it to build seed state; the dependency points inward.
 */

/** Ratings indexed by impact, then likelihood 1→5. */
export const DEFAULT_RATING_TABLE: Record<ScaleValue, readonly RatingLabel[]> = {
  5: ['Medium', 'High', 'High', 'Significant', 'Significant'],
  4: ['Low', 'Medium', 'High', 'High', 'Significant'],
  3: ['Low', 'Medium', 'Medium', 'High', 'High'],
  2: ['Low', 'Low', 'Medium', 'Medium', 'High'],
  1: ['Low', 'Low', 'Low', 'Low', 'Medium'],
}

export const DEFAULT_RATING_COLORS: Record<RatingLabel, string> = {
  Low: '#00B050',
  Medium: '#FFF200',
  High: '#FFB900',
  Significant: '#F32121',
}

/**
 * The 2026 rating for one intersection, used when configuration is incomplete.
 *
 * Total by design: a migrated record can carry a score outside 1–5, and the
 * engine must rate it rather than throw halfway through a dashboard.
 */
export function defaultRatingFor(impact: ScaleValue, likelihood: ScaleValue): RatingLabel {
  return DEFAULT_RATING_TABLE[impact]?.[likelihood - 1] ?? 'Low'
}

/*
 * The rest of the 2026 configuration (CR-003).
 *
 * Names, descriptions and probability bands are DEFAULTS, not constants: an
 * administrator may rename or re-describe any of them, and every screen reads
 * the saved configuration rather than these values. They live here so that
 * "Restore 2026 defaults" and the seed reproduce the standard exactly.
 */

/**
 * The complete 2026 configuration.
 *
 * One builder for the seed, for "Restore defaults" and for tests, so there is
 * never a second definition of what the standard matrix is.
 */
export function createDefaultMatrix(): RatingMatrix {
  const cells: MatrixCell[] = []
  for (const impact of SCALE_VALUES) {
    for (const likelihood of SCALE_VALUES) {
      cells.push({ impact, likelihood, rating: defaultRatingFor(impact, likelihood) })
    }
  }

  return {
    version: 1,
    scaleNameEn: DEFAULT_SCALE_NAME_EN,
    scaleNameKa: DEFAULT_SCALE_NAME_KA,
    cells,
    levels: defaultRatingLevels(),
    colors: { ...DEFAULT_RATING_COLORS },
    impactLabels: defaultImpactLabels(),
    likelihoodLabels: defaultLikelihoodLabels(),
  }
}

export const DEFAULT_SCALE_NAME_EN = 'Rating'
export const DEFAULT_SCALE_NAME_KA = 'რეიტინგი'

const DEFAULT_LEVEL_NAMES_KA: Record<RatingLabel, string> = {
  Low: 'დაბალი',
  Medium: 'საშუალო',
  High: 'მაღალი',
  Significant: 'მნიშვნელოვანი',
}

/** Display names for the four levels, in ascending severity. */
export function defaultRatingLevels(): RatingLevel[] {
  return RATING_LABELS.map((key, index) => ({
    key,
    nameEn: key,
    nameKa: DEFAULT_LEVEL_NAMES_KA[key],
    order: index + 1,
  }))
}

export function defaultImpactLabels(): Record<ScaleValue, ImpactLabel> {
  return {
    1: {
      en: 'Minor', ka: 'მცირე',
      descriptionEn: 'Negligible financial, reputational or operational effect; absorbed in normal business.',
      descriptionKa: 'უმნიშვნელო ფინანსური, რეპუტაციული ან ოპერაციული ეფექტი.',
    },
    2: {
      en: 'Moderate', ka: 'საშუალო',
      descriptionEn: 'Contained effect handled within one function, with limited external visibility.',
      descriptionKa: 'შეზღუდული ეფექტი, რომელიც იმართება ერთი ფუნქციის ფარგლებში.',
    },
    3: {
      en: 'Major', ka: 'დიდი',
      descriptionEn: 'Material effect requiring management attention and cross-functional response.',
      descriptionKa: 'არსებითი ეფექტი, რომელიც მოითხოვს მენეჯმენტის ჩართულობას.',
    },
    4: {
      en: 'Severe', ka: 'მწვავე',
      descriptionEn: 'Serious effect on results, customers or compliance standing; board is informed.',
      descriptionKa: 'სერიოზული ეფექტი შედეგებზე, კლიენტებზე ან შესაბამისობაზე.',
    },
    5: {
      en: 'Critical', ka: 'კრიტიკული',
      descriptionEn: 'Threatens licence, solvency or continuity of the business.',
      descriptionKa: 'საფრთხეს უქმნის ლიცენზიას, გადახდისუნარიანობას ან უწყვეტობას.',
    },
  }
}

/** Likelihood bands use the 2026 twelve-month horizon. */
export function defaultLikelihoodLabels(): Record<ScaleValue, LikelihoodLabel> {
  return {
    1: {
      en: 'Remote', ka: 'არასავარაუდო', percentFrom: 0, percentTo: 5,
      textEn: '', textKa: '',
      descriptionEn: 'Not expected to occur in the next 12 months.',
      descriptionKa: 'მომდევნო 12 თვეში არ არის მოსალოდნელი.',
    },
    2: {
      en: 'Unlikely', ka: 'ნაკლებად სავარაუდო', percentFrom: 6, percentTo: 35,
      textEn: '', textKa: '',
      descriptionEn: 'Could occur, but no current indication that it will.',
      descriptionKa: 'შესაძლოა მოხდეს, თუმცა ამის ნიშნები არ არის.',
    },
    3: {
      en: 'Possible', ka: 'შესაძლო', percentFrom: 36, percentTo: 65,
      textEn: '', textKa: '',
      descriptionEn: 'As likely to occur as not within the next 12 months.',
      descriptionKa: 'თანაბრად სავარაუდოა მოხდეს თუ არა მომდევნო 12 თვეში.',
    },
    4: {
      en: 'Likely', ka: 'სავარაუდო', percentFrom: 66, percentTo: 95,
      textEn: '', textKa: '',
      descriptionEn: 'Expected to occur at least once in the next 12 months.',
      descriptionKa: 'მოსალოდნელია მოხდეს მინიმუმ ერთხელ მომდევნო 12 თვეში.',
    },
    5: {
      en: 'Almost Certain', ka: 'თითქმის უდავო', percentFrom: 96, percentTo: 100,
      textEn: '', textKa: '',
      descriptionEn: 'Occurs routinely, or is already materialising.',
      descriptionKa: 'ხდება რეგულარულად ან უკვე ვლინდება.',
    },
  }
}
