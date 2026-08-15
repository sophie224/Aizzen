import { describe, expect, it } from 'vitest'
import { SCALE_VALUES } from '../types/enums.ts'
import type { RatingLabel, RatingMatrix, ScaleValue } from '../types/index.ts'
import { createDefaultMatrix, DEFAULT_RATING_COLORS, DEFAULT_RATING_TABLE } from './default-matrix.ts'
import {
  assess,
  buildRatingLookup,
  impactLabel,
  likelihoodLabel,
  ratingColor,
  riskRating,
  riskScore,
} from './index.ts'

/** The complete 2026 default configuration, with optional overrides. */
function makeMatrix(overrides: Partial<RatingMatrix> = {}): RatingMatrix {
  return { ...createDefaultMatrix(), ...overrides }
}

describe('riskScore', () => {
  it('multiplies impact by likelihood', () => {
    expect(riskScore({ impact: 2, likelihood: 3 })).toBe(6)
    expect(riskScore({ impact: 5, likelihood: 4 })).toBe(20)
    expect(riskScore({ impact: 1, likelihood: 1 })).toBe(1)
    expect(riskScore({ impact: 5, likelihood: 5 })).toBe(25)
  })

  it('covers the full 1-25 range across the scale', () => {
    const scores = new Set<number>()
    for (const impact of SCALE_VALUES) {
      for (const likelihood of SCALE_VALUES) scores.add(riskScore({ impact, likelihood }))
    }
    expect(Math.min(...scores)).toBe(1)
    expect(Math.max(...scores)).toBe(25)
  })
})

describe('riskRating — exact cell resolution', () => {
  const matrix = makeMatrix()

  it('resolves all 25 cells to the configured rating', () => {
    for (const impact of SCALE_VALUES) {
      for (const likelihood of SCALE_VALUES) {
        expect(
          riskRating({ impact, likelihood }, matrix),
          `impact ${String(impact)} x likelihood ${String(likelihood)}`,
        ).toBe(DEFAULT_RATING_TABLE[impact][likelihood - 1])
      }
    }
  })

  it('matches the documented worked examples', () => {
    // 2 x 3 = 6 -> Medium; 5 x 4 = 20 -> Significant (ARCHITECTURE.md §7).
    expect(riskRating({ impact: 2, likelihood: 3 }, matrix)).toBe('Medium')
    expect(riskScore({ impact: 2, likelihood: 3 })).toBe(6)

    expect(riskRating({ impact: 5, likelihood: 4 }, matrix)).toBe('Significant')
    expect(riskScore({ impact: 5, likelihood: 4 })).toBe(20)
  })

  it('resolves by cell, not by score band', () => {
    // Score 4 occurs at 1x4, 4x1 and 2x2 — the 2026 matrix rates them
    // differently, proving the lookup is not banding on the numeric score.
    const byCell = [
      { score: { impact: 1, likelihood: 4 } as const, rating: 'Low' },
      { score: { impact: 4, likelihood: 1 } as const, rating: 'Low' },
      { score: { impact: 2, likelihood: 2 } as const, rating: 'Low' },
    ]
    for (const entry of byCell) {
      expect(riskScore(entry.score)).toBe(4)
      expect(riskRating(entry.score, matrix)).toBe(entry.rating)
    }

    // 5x1 and 1x5 both score 5 but rate differently — the decisive case.
    expect(riskScore({ impact: 5, likelihood: 1 })).toBe(5)
    expect(riskScore({ impact: 1, likelihood: 5 })).toBe(5)
    expect(riskRating({ impact: 5, likelihood: 1 }, matrix)).toBe('Medium')
    expect(riskRating({ impact: 1, likelihood: 5 }, matrix)).toBe('Medium')
  })

  it('changing one cell affects only that cell', () => {
    const edited = makeMatrix()
    const target = edited.cells.find((cell) => cell.impact === 3 && cell.likelihood === 3)
    if (target) target.rating = 'Significant'

    expect(riskRating({ impact: 3, likelihood: 3 }, edited)).toBe('Significant')

    for (const impact of SCALE_VALUES) {
      for (const likelihood of SCALE_VALUES) {
        if (impact === 3 && likelihood === 3) continue
        expect(riskRating({ impact, likelihood }, edited)).toBe(
          DEFAULT_RATING_TABLE[impact][likelihood - 1],
        )
      }
    }
  })

  it('falls back to the 2026 default when a cell is missing', () => {
    const incomplete = makeMatrix()
    incomplete.cells = incomplete.cells.filter(
      (cell) => !(cell.impact === 4 && cell.likelihood === 5),
    )

    expect(riskRating({ impact: 4, likelihood: 5 }, incomplete)).toBe('Significant')
  })

  it('gives identical results with and without a prebuilt lookup', () => {
    const lookup = buildRatingLookup(matrix)
    for (const impact of SCALE_VALUES) {
      for (const likelihood of SCALE_VALUES) {
        expect(riskRating({ impact, likelihood }, matrix, lookup)).toBe(
          riskRating({ impact, likelihood }, matrix),
        )
      }
    }
  })
})

describe('ratingColor', () => {
  it('uses the configured palette', () => {
    const matrix = makeMatrix()
    expect(ratingColor('Low', matrix)).toBe('#00B050')
    expect(ratingColor('Significant', matrix)).toBe('#F32121')
  })

  it('reflects an administrator recolouring immediately', () => {
    const matrix = makeMatrix()
    matrix.colors.High = '#123456'
    expect(ratingColor('High', matrix)).toBe('#123456')
  })

  it('falls back to the default palette when a colour is blank', () => {
    const matrix = makeMatrix()
    matrix.colors.Medium = '   '
    expect(ratingColor('Medium', matrix)).toBe('#FFF200')
  })
})

describe('assess', () => {
  it('returns score, rating and colour together', () => {
    expect(assess({ impact: 5, likelihood: 4 }, makeMatrix())).toEqual({
      impact: 5,
      likelihood: 4,
      score: 20,
      rating: 'Significant',
      color: '#F32121',
    })
  })

  it('recomputes when the matrix changes, with no stored value to invalidate', () => {
    const matrix = makeMatrix()
    const before = assess({ impact: 3, likelihood: 3 }, matrix)

    const cell = matrix.cells.find((c) => c.impact === 3 && c.likelihood === 3)
    if (cell) cell.rating = 'Significant'
    matrix.colors.Significant = '#000000'

    const after = assess({ impact: 3, likelihood: 3 }, matrix)
    expect(before.rating).toBe('Medium')
    expect(after.rating).toBe('Significant')
    expect(after.color).toBe('#000000')
    expect(after.score).toBe(before.score)
  })
})

describe('bilingual scale labels', () => {
  const matrix = makeMatrix()

  it('returns the requested language', () => {
    expect(impactLabel(1, matrix, 'en')).toBe('Minor')
    expect(impactLabel(1, matrix, 'ka')).toBe('მცირე')
    expect(likelihoodLabel(5, matrix, 'ka')).toBe('თითქმის უდავო')
  })

  it('falls back to English when the Georgian label is empty', () => {
    const blank = makeMatrix()
    blank.impactLabels[4] = { ...blank.impactLabels[4], ka: '' }
    blank.likelihoodLabels[2] = { ...blank.likelihoodLabels[2], ka: '   ' }

    expect(impactLabel(4, blank, 'ka')).toBe('Severe')
    expect(likelihoodLabel(2, blank, 'ka')).toBe('Unlikely')
  })
})

describe('default matrix table', () => {
  it('reproduces the documented 2026 grid', () => {
    const expected: Record<ScaleValue, readonly RatingLabel[]> = {
      5: ['Medium', 'High', 'High', 'Significant', 'Significant'],
      4: ['Low', 'Medium', 'High', 'High', 'Significant'],
      3: ['Low', 'Medium', 'Medium', 'High', 'High'],
      2: ['Low', 'Low', 'Medium', 'Medium', 'High'],
      1: ['Low', 'Low', 'Low', 'Low', 'Medium'],
    }
    expect(DEFAULT_RATING_TABLE).toEqual(expected)
  })

  it('uses the documented default colours', () => {
    expect(DEFAULT_RATING_COLORS).toEqual({
      Low: '#00B050',
      Medium: '#FFF200',
      High: '#FFB900',
      Significant: '#F32121',
    })
  })
})
