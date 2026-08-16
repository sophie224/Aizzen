import { describe, expect, it } from 'vitest'
import {
  CONTRAST_TARGET,
  LARGE_TEXT_TARGET,
  contrastRatio,
  parseHex,
  readableOn,
  riskColorSet,
  riskColorVariables,
  tint,
  toHex,
} from './contrast.ts'
import { RATING_LABELS } from '../types/enums.ts'

/** The 2026 default palette — the exact values shipped in the seed matrix. */
const DEFAULT_PALETTE = {
  Low: '#00B050',
  Medium: '#FFF200',
  High: '#FFB900',
  Significant: '#F32121',
}

describe('parseHex', () => {
  it('reads six-digit hex', () => {
    expect(parseHex('#00B050')).toEqual({ r: 0, g: 176, b: 80 })
  })

  it('expands three-digit hex', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('rejects anything else', () => {
    expect(parseHex('rebeccapurple')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
    expect(parseHex('#gggggg')).toBeNull()
  })
})

describe('contrastRatio', () => {
  it('is 21:1 for black on white', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 5)
  })

  it('is symmetric', () => {
    const a = parseHex('#F32121')!
    const b = parseHex('#ffffff')!
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10)
  })
})

describe('readableOn', () => {
  /*
   * The defect this replaces: white text was used on every fill darker than a
   * fixed luminance threshold, which put white on the configured red at
   * 4.19:1 — below the 4.5:1 minimum.
   */
  it('clears 4.5:1 on every colour of the default palette', () => {
    for (const fill of Object.values(DEFAULT_PALETTE)) {
      const foreground = readableOn(fill)
      const ratio = contrastRatio(parseHex(fill)!, parseHex(foreground)!)
      expect(ratio, `${fill} on ${foreground}`).toBeGreaterThanOrEqual(CONTRAST_TARGET)
    }
  })

  it('uses dark ink on the yellow and orange fills', () => {
    expect(readableOn(DEFAULT_PALETTE.Medium)).toBe('#0d1128')
    expect(readableOn(DEFAULT_PALETTE.High)).toBe('#0d1128')
  })

  it('uses white on a genuinely dark fill', () => {
    expect(readableOn('#1a2151')).toBe('#ffffff')
  })

  /*
   * The configured red is the case that exposed the old threshold: white
   * reaches only 4.19:1 and brand ink 4.28:1, so neither may be used.
   */
  it('rejects both white and brand ink on the configured red', () => {
    expect(readableOn('#F32121')).toBe('#000000')
  })

  it('clears 4.5:1 across the whole colour space, including mid tones', () => {
    // A coarse sweep of the cube — mid-greys are the hard case for a fixed
    // luminance threshold, which is what this replaced.
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          const fill = toHex({ r, g, b })
          const ratio = contrastRatio(parseHex(fill)!, parseHex(readableOn(fill))!)
          expect(ratio, fill).toBeGreaterThanOrEqual(CONTRAST_TARGET)
        }
      }
    }
  })

  /*
   * The score badge sets its label in bold at display size, so it is judged
   * against the large-text threshold. White reaches 4.19:1 on the configured
   * red — short of 4.5:1 but comfortably past 3:1 — so the badge gets white
   * there while the pale fills still get dark ink.
   */
  it('prefers white at the large-text threshold where white qualifies', () => {
    expect(readableOn(DEFAULT_PALETTE.Significant, LARGE_TEXT_TARGET)).toBe('#ffffff')
  })

  it('keeps dark ink on the pale fills even at the large-text threshold', () => {
    expect(readableOn(DEFAULT_PALETTE.Medium, LARGE_TEXT_TARGET)).toBe('#0d1128')
    expect(readableOn(DEFAULT_PALETTE.High, LARGE_TEXT_TARGET)).toBe('#0d1128')
    // Green: white reaches only 2.9:1, so it is rejected even here.
    expect(readableOn(DEFAULT_PALETTE.Low, LARGE_TEXT_TARGET)).toBe('#0d1128')
  })

  it('clears the large-text threshold on every colour of the default palette', () => {
    for (const fill of Object.values(DEFAULT_PALETTE)) {
      const foreground = readableOn(fill, LARGE_TEXT_TARGET)
      const ratio = contrastRatio(parseHex(fill)!, parseHex(foreground)!)
      expect(ratio, `${fill} on ${foreground}`).toBeGreaterThanOrEqual(LARGE_TEXT_TARGET)
    }
  })

  it('returns ink for an unparseable value rather than throwing', () => {
    expect(readableOn('not a colour')).toBe('#0d1128')
  })
})

describe('tint', () => {
  it('returns white at 0 and the colour itself at 1', () => {
    expect(tint('#00B050', 0)).toBe('#ffffff')
    expect(tint('#00B050', 1)).toBe('#00b050')
  })

  it('mixes towards white', () => {
    // 12% of #000000 over white is 224,224,224.
    expect(tint('#000000', 0.12)).toBe('#e0e0e0')
  })

  it('leaves an unparseable value untouched', () => {
    expect(tint('inherit', 0.12)).toBe('inherit')
  })
})

describe('toHex', () => {
  it('clamps out-of-range channels', () => {
    expect(toHex({ r: -20, g: 300, b: 128 })).toBe('#00ff80')
  })
})

describe('riskColorSet', () => {
  it('derives all four values from one fill', () => {
    const set = riskColorSet('#F32121')
    expect(set.fill).toBe('#F32121')
    expect(set.on).toBe('#000000')
    // soft is much lighter than border, which is lighter than the fill.
    expect(set.soft).not.toBe(set.border)
    expect(set.border).not.toBe(set.fill)
  })
})

describe('riskColorVariables', () => {
  it('numbers the slots in rating order', () => {
    const variables = riskColorVariables(DEFAULT_PALETTE, RATING_LABELS)
    expect(variables['--risk-1']).toBe(DEFAULT_PALETTE.Low)
    expect(variables['--risk-4']).toBe(DEFAULT_PALETTE.Significant)
    expect(variables['--risk-2-on']).toBe('#0d1128')
  })

  it('emits four variables per level', () => {
    const variables = riskColorVariables(DEFAULT_PALETTE, RATING_LABELS)
    expect(Object.keys(variables)).toHaveLength(RATING_LABELS.length * 4)
  })

  it('skips a level the palette does not define instead of emitting undefined', () => {
    const variables = riskColorVariables({ Low: '#00B050' }, RATING_LABELS)
    expect(variables['--risk-1']).toBe('#00B050')
    expect(variables['--risk-2']).toBeUndefined()
  })

  it('follows a reconfigured palette', () => {
    const variables = riskColorVariables({ ...DEFAULT_PALETTE, Low: '#0b3d91' }, RATING_LABELS)
    expect(variables['--risk-1']).toBe('#0b3d91')
    expect(variables['--risk-1-on']).toBe('#ffffff')
  })
})
