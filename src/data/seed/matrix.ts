import type { RatingMatrix } from '../../domain/types/index.ts'
import {
  createDefaultMatrix,
  DEFAULT_RATING_COLORS,
} from '../../domain/risk-engine/default-matrix.ts'

/*
 * Seed rating matrix. The 2026 rating table, palette, scale names, criteria
 * and probability bands are domain knowledge (the engine uses them as its
 * fallback and "Restore defaults" reproduces them), so they are imported
 * rather than duplicated here — the dependency points inward.
 */

export { DEFAULT_RATING_COLORS }

/**
 * The tenant's starting configuration (CR-003).
 *
 * Every name, description and probability band here is an editable default:
 * the administration screen writes back into this same structure, and every
 * screen reads it rather than hard-coding a label.
 */
export function createSeedMatrix(): RatingMatrix {
  return createDefaultMatrix()
}
