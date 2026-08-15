import { describe, expect, it } from 'vitest'
import { createDefaultMatrix } from '../risk-engine/default-matrix.ts'
import {
  impactLabel,
  impactOptionLabel,
  likelihoodBand,
  likelihoodOptionLabel,
  ratingLevels,
  ratingName,
  restoreDefaultMatrix,
  riskRating,
  riskScore,
  scaleName,
} from '../risk-engine/index.ts'
import type { RatingMatrix } from '../types/index.ts'
import {
  diffMatrixConfiguration,
  setImpactLevel,
  setLikelihoodLevel,
  setMatrixCell,
  setRatingColor,
  setRatingLevelName,
  setScaleName,
  validateMatrixConfiguration,
} from './index.ts'

/*
 * Rating-matrix configuration (CR-003).
 *
 * The rules that decide what an administrator may save, and the guarantee that
 * no label change can move a score.
 */

const fields = (issues: readonly { field: string }[]) => issues.map((issue) => issue.field)

describe('validation — names', () => {
  it('accepts the 2026 defaults', () => {
    const review = validateMatrixConfiguration(createDefaultMatrix())
    expect(review.errors).toEqual([])
    expect(review.warnings).toEqual([])
  })

  it('requires a scale name and caps it at 40 characters', () => {
    expect(fields(validateMatrixConfiguration(setScaleName(createDefaultMatrix(), 'en', '  ')).errors))
      .toContain('scaleName')
    expect(
      fields(validateMatrixConfiguration(setScaleName(createDefaultMatrix(), 'en', 'x'.repeat(41))).errors),
    ).toContain('scaleName')
  })

  it('requires each rating level name and rejects duplicates', () => {
    const blank = setRatingLevelName(createDefaultMatrix(), 'High', 'en', '')
    expect(fields(validateMatrixConfiguration(blank).errors)).toContain('level.High.name')

    const clash = setRatingLevelName(createDefaultMatrix(), 'High', 'en', 'low')
    const clashed = fields(validateMatrixConfiguration(clash).errors)
    expect(clashed).toContain('level.High.name')
    expect(clashed).toContain('level.Low.name')
  })

  it('caps a Georgian name at 40 characters too', () => {
    const long = setRatingLevelName(createDefaultMatrix(), 'Low', 'ka', 'ა'.repeat(41))
    expect(fields(validateMatrixConfiguration(long).errors)).toContain('level.Low.name')
  })

  it('requires impact names, rejects duplicates and caps descriptions', () => {
    const blank = setImpactLevel(createDefaultMatrix(), 3, { en: '' })
    expect(fields(validateMatrixConfiguration(blank).errors)).toContain('impact.3.name')

    const clash = setImpactLevel(createDefaultMatrix(), 3, { en: 'Minor' })
    expect(fields(validateMatrixConfiguration(clash).errors)).toContain('impact.3.name')

    const long = setImpactLevel(createDefaultMatrix(), 3, { descriptionEn: 'x'.repeat(501) })
    expect(fields(validateMatrixConfiguration(long).errors)).toContain('impact.3.description')
  })
})

describe('validation — likelihood bands', () => {
  it('rejects a percentage outside 0–100', () => {
    const over = setLikelihoodLevel(createDefaultMatrix(), 2, { percentTo: 140 })
    expect(fields(validateMatrixConfiguration(over).errors)).toContain('likelihood.2.percentTo')
  })

  it('rejects a band whose start is after its end', () => {
    const inverted = setLikelihoodLevel(createDefaultMatrix(), 2, { percentFrom: 40, percentTo: 10 })
    expect(fields(validateMatrixConfiguration(inverted).errors)).toContain('likelihood.2.percent')
  })

  it('rejects overlapping bands', () => {
    // 2 runs 6–35 by default; stretching 1 to 20 overlaps it.
    const overlap = setLikelihoodLevel(createDefaultMatrix(), 1, { percentTo: 20 })
    expect(fields(validateMatrixConfiguration(overlap).errors)).toContain('likelihood.2.percent')
  })

  it('rejects half a band', () => {
    const half = setLikelihoodLevel(createDefaultMatrix(), 3, { percentTo: null })
    expect(fields(validateMatrixConfiguration(half).errors)).toContain('likelihood.3.percent')
  })

  it('accepts a text-only level with no percentage at all', () => {
    const textOnly = setLikelihoodLevel(createDefaultMatrix(), 1, {
      percentFrom: null,
      percentTo: null,
      textEn: 'Once in 10 years',
    })
    const review = validateMatrixConfiguration(textOnly)

    expect(fields(review.errors)).not.toContain('likelihood.1.percent')
    // The remaining bands no longer reach 0, which is a warning, not an error.
    expect(fields(review.warnings)).toContain('likelihood.coverage')
  })

  it('rejects a level with neither a band nor a text value', () => {
    const empty = setLikelihoodLevel(createDefaultMatrix(), 1, { percentFrom: null, percentTo: null })
    expect(fields(validateMatrixConfiguration(empty).errors)).toContain('likelihood.1.percent')
  })

  it('warns — but does not block — when the bands leave a gap', () => {
    const gap = setLikelihoodLevel(createDefaultMatrix(), 2, { percentFrom: 20 })
    const review = validateMatrixConfiguration(gap)

    expect(review.errors).toEqual([])
    expect(fields(review.warnings)).toContain('likelihood.coverage')
  })
})

describe('configured labels', () => {
  it('reads the scale name, with an English fallback', () => {
    const renamed = setScaleName(createDefaultMatrix(), 'en', 'Severity')
    expect(scaleName(renamed, 'en')).toBe('Severity')
    expect(scaleName(setScaleName(renamed, 'ka', ''), 'ka')).toBe('Severity')
  })

  it('reads a renamed level without touching its key', () => {
    const renamed = setRatingLevelName(createDefaultMatrix(), 'Significant', 'en', 'Extreme')

    expect(ratingName(renamed, 'Significant', 'en')).toBe('Extreme')
    // The stored key — what cells, filters and exports are keyed by — is intact.
    expect(renamed.cells.some((cell) => cell.rating === 'Significant')).toBe(true)
    expect(ratingLevels(renamed).map((level) => level.key)).toEqual([
      'Low', 'Medium', 'High', 'Significant',
    ])
  })

  it('falls back to English when a Georgian level name is blank', () => {
    const blank = setRatingLevelName(createDefaultMatrix(), 'Low', 'ka', '   ')
    expect(ratingName(blank, 'Low', 'ka')).toBe('Low')
  })

  it('renders a band as a percentage, as text, or as both', () => {
    const matrix = createDefaultMatrix()
    expect(likelihoodBand(2, matrix, 'en')).toBe('6%-35%')

    const textOnly = setLikelihoodLevel(matrix, 2, {
      percentFrom: null, percentTo: null, textEn: 'Once in 10 years',
    })
    expect(likelihoodBand(2, textOnly, 'en')).toBe('Once in 10 years')

    const both = setLikelihoodLevel(matrix, 2, { textEn: 'Once in 10 years' })
    expect(likelihoodBand(2, both, 'en')).toBe('6%-35% · Once in 10 years')
  })

  it('builds the dropdown option labels from the configuration', () => {
    const matrix = setImpactLevel(createDefaultMatrix(), 5, { en: 'Catastrophic' })

    expect(impactOptionLabel(5, matrix, 'en')).toBe('5 — Catastrophic')
    expect(likelihoodOptionLabel(2, matrix, 'en')).toBe('2 — Unlikely (6%-35%)')
  })
})

describe('score is never affected by configuration', () => {
  it('keeps Impact × Likelihood after every kind of rename', () => {
    let matrix: RatingMatrix = createDefaultMatrix()
    matrix = setScaleName(matrix, 'en', 'Severity')
    matrix = setRatingLevelName(matrix, 'Significant', 'en', 'Extreme')
    matrix = setImpactLevel(matrix, 5, { en: 'Catastrophic' })
    matrix = setLikelihoodLevel(matrix, 5, { en: 'Certain', percentFrom: 90, percentTo: 100 })

    expect(riskScore({ impact: 5, likelihood: 5 })).toBe(25)
    expect(riskScore({ impact: 2, likelihood: 3 })).toBe(6)
    // The cell still resolves to the same stable key it always did.
    expect(riskRating({ impact: 5, likelihood: 5 }, matrix)).toBe('Significant')
  })

  it('leaves the other 24 cells alone when one is re-rated', () => {
    const matrix = setMatrixCell(createDefaultMatrix(), 1, 1, 'Significant')

    expect(riskRating({ impact: 1, likelihood: 1 }, matrix)).toBe('Significant')
    expect(riskRating({ impact: 1, likelihood: 2 }, matrix)).toBe('Low')
    expect(matrix.cells).toHaveLength(25)
  })
})

describe('restore defaults', () => {
  it('resets names, descriptions, bands, colours and cells', () => {
    let matrix: RatingMatrix = createDefaultMatrix()
    matrix = setScaleName(matrix, 'en', 'Severity')
    matrix = setRatingLevelName(matrix, 'Low', 'en', 'Negligible')
    matrix = setRatingColor(matrix, 'Low', '#123456')
    matrix = setImpactLevel(matrix, 1, { en: 'Trivial', descriptionEn: 'Anything at all.' })
    matrix = setLikelihoodLevel(matrix, 1, { percentFrom: 0, percentTo: 2, textEn: 'Rare' })
    matrix = setMatrixCell(matrix, 1, 1, 'Significant')
    matrix = { ...matrix, version: 7 }

    const restored = restoreDefaultMatrix(matrix)

    expect(restored.scaleNameEn).toBe('Rating')
    expect(ratingName(restored, 'Low', 'en')).toBe('Low')
    expect(restored.colors.Low).toBe('#00B050')
    expect(impactLabel(1, restored, 'en')).toBe('Minor')
    expect(likelihoodBand(1, restored, 'en')).toBe('0%-5%')
    expect(riskRating({ impact: 1, likelihood: 1 }, restored)).toBe('Low')
    // Version keeps counting: restoring is itself a new configuration.
    expect(restored.version).toBe(7)
  })
})

describe('audit summary', () => {
  it('names each area that changed', () => {
    const before = createDefaultMatrix()
    let after = setScaleName(before, 'en', 'Severity')
    after = setImpactLevel(after, 2, { descriptionEn: 'Reworded.' })
    after = setMatrixCell(after, 1, 1, 'Medium')

    const changes = diffMatrixConfiguration(before, after)

    expect(changes).toContain('Scale name: Rating → Severity')
    expect(changes).toContain('Impact criteria: changed')
    expect(changes).toContain('Cell ratings: 1 changed')
    expect(changes).not.toContain('Rating colours: changed')
  })

  it('never returns an empty list', () => {
    expect(diffMatrixConfiguration(createDefaultMatrix(), createDefaultMatrix())).toEqual([
      'Configuration saved',
    ])
  })
})
