import type { MatrixCell, RatingMatrix } from '../../domain/types/index.ts'
import { SCALE_VALUES } from '../../domain/types/index.ts'
import { DEFAULT_RATING_COLORS, defaultRatingFor } from '../../domain/risk-engine/default-matrix.ts'

/*
 * Seed rating matrix. The 2026 rating table and palette are domain knowledge
 * (the engine uses them as its fallback), so they are imported rather than
 * duplicated here — the dependency points inward.
 */

export { DEFAULT_RATING_COLORS }

/** Builds all 25 cells. Rating is resolved by exact cell, never by score band. */
function createDefaultCells(): MatrixCell[] {
  const cells: MatrixCell[] = []
  for (const impact of SCALE_VALUES) {
    for (const likelihood of SCALE_VALUES) {
      cells.push({ impact, likelihood, rating: defaultRatingFor(impact, likelihood) })
    }
  }
  return cells
}

/**
 * Impact and likelihood labels are part of the matrix model even though the
 * Phase 1 UI does not expose them for editing (ARCHITECTURE.md §7).
 * Likelihood probabilities use the 2026 twelve-month horizon.
 */
export function createSeedMatrix(): RatingMatrix {
  return {
    cells: createDefaultCells(),
    colors: { ...DEFAULT_RATING_COLORS },
    impactLabels: {
      1: { en: 'Minor', ka: 'მცირე' },
      2: { en: 'Moderate', ka: 'საშუალო' },
      3: { en: 'Major', ka: 'დიდი' },
      4: { en: 'Severe', ka: 'მწვავე' },
      5: { en: 'Critical', ka: 'კრიტიკული' },
    },
    likelihoodLabels: {
      1: { en: 'Remote', ka: 'არასავარაუდო', probability: '0%-5%' },
      2: { en: 'Unlikely', ka: 'ნაკლებად სავარაუდო', probability: '6%-35%' },
      3: { en: 'Possible', ka: 'შესაძლო', probability: '36%-65%' },
      4: { en: 'Likely', ka: 'სავარაუდო', probability: '66%-95%' },
      5: { en: 'Almost Certain', ka: 'თითქმის უდავო', probability: '96%-100%' },
    },
  }
}
