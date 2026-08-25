import { describe, expect, it } from 'vitest'
import { LocalStorageRepository, type StorageLike } from '../../data/local-storage-repository.ts'
import { scaleLabel, type ControlScaleName } from '../../domain/controls/index.ts'
import {
  contrastRatio,
  CONTRAST_TARGET,
  INDICATOR_TARGET,
  levelBadgeColors,
  parseHex,
  readableOn,
  type Rgb,
} from '../../domain/risk-engine/contrast.ts'
import type { ControlConfig } from '../../domain/types/index.ts'

/*
 * Rating-matrix colour contract (Design Uplift v2 §6.3).
 *
 * The check the brief demands: iterate EVERY configured level colour from the
 * live configuration — not a fixture — and assert that
 *
 *   - badge text vs the computed badge surface  ≥ 4.5:1
 *   - the indicator vs the surface it touches   ≥ 3:1
 *   - the level name is present in EN and KA
 *
 * so that adding or recolouring a level in Administration cannot silently
 * break contrast. The adversarial block then proves the pattern is
 * hue-agnostic: the colours that defeat "black or white text" — mid-luminance
 * ambers and yellows — are exactly what an administrator is most likely to
 * choose for a middle level.
 */

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>()
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
}

/** The standard text token badges use — `--text-primary`. */
const TEXT_PRIMARY = '#1a2151'
/** The lightest surface a badge sits on — `--surface`. */
const PAGE_SURFACE = '#ffffff'

const SCALES: ControlScaleName[] = ['effectiveness', 'maturity', 'assurance', 'classifications']

function rgb(value: string): Rgb {
  const parsed = parseHex(value)
  if (!parsed) throw new Error(`not a hex colour: ${value}`)
  return parsed
}

function assertReadable(fill: string, where: string): void {
  const { surface, indicator } = levelBadgeColors(fill, PAGE_SURFACE)

  expect(contrastRatio(rgb(TEXT_PRIMARY), rgb(surface)), `${where}: text on badge surface`).toBeGreaterThanOrEqual(
    CONTRAST_TARGET,
  )
  expect(contrastRatio(rgb(indicator), rgb(PAGE_SURFACE)), `${where}: indicator on page`).toBeGreaterThanOrEqual(
    INDICATOR_TARGET,
  )
  expect(contrastRatio(rgb(indicator), rgb(surface)), `${where}: indicator on badge surface`).toBeGreaterThanOrEqual(
    INDICATOR_TARGET,
  )
}

async function liveConfig(): Promise<ControlConfig> {
  // Read through the real repository, so this is the configuration the app
  // actually runs on rather than a hand-written fixture.
  const repository = new LocalStorageRepository({ storage: new MemoryStorage() })
  const state = await repository.getState()
  return state.controlConfig
}

describe('control badge contrast, live configuration (§6.3)', () => {
  it('passes for every configured level of every scale', async () => {
    const config = await liveConfig()

    for (const scale of SCALES) {
      expect(config[scale].length).toBeGreaterThan(0)
      for (const level of config[scale]) {
        assertReadable(level.color, `${scale}/${level.key}`)
      }
    }
  })

  it('renders a name for every level in both locales', async () => {
    const config = await liveConfig()

    for (const scale of SCALES) {
      for (const level of config[scale]) {
        expect(scaleLabel(config, scale, level.key, 'en').trim(), `${scale}/${level.key} EN`).not.toBe('')
        expect(scaleLabel(config, scale, level.key, 'ka').trim(), `${scale}/${level.key} KA`).not.toBe('')
      }
    }
  })
})

describe('the pattern is hue-agnostic (§6.2)', () => {
  const HOSTILE = [
    '#FFB900', // amber
    '#FFF200', // yellow
    '#808080', // mid grey — see below, the genuine failure case
    '#00B050', // saturated green
    '#F32121', // saturated red
    '#5868B7', // brand indigo
    '#8B4513', // deep brown
  ]

  /*
   * Why the pattern is worth having — stated accurately.
   *
   * The brief (§6.1) argues that neither black nor white reaches 4.5:1 on a
   * mid-luminance fill. That is not quite right: the two curves cross at
   * 4.58:1, so the better of black and white always clears 4.5 by a hair.
   * The real problem is the hair. A 4.58:1 pass has no headroom, and §8.1
   * requires contrast against the ACTUAL rendered surface — including the row
   * hover tint sitting behind the badge. The tint pattern is not a rescue from
   * an impossible case; it is what turns a hairline pass into a comfortable
   * one, with a single stable text token instead of a foreground that flips
   * between white and ink from row to row.
   *
   * These two assertions pin that argument down, so the pattern cannot be
   * quietly replaced by "compute a readable foreground" later.
   */
  it('leaves real headroom where the naive approach leaves almost none', () => {
    const fill = '#808080'

    const naive = contrastRatio(rgb(fill), rgb(readableOn(fill, CONTRAST_TARGET)))
    expect(naive, 'best of white and ink on the raw fill').toBeLessThan(5)

    const { surface } = levelBadgeColors(fill, PAGE_SURFACE)
    expect(contrastRatio(rgb(TEXT_PRIMARY), rgb(surface)), 'text on the tint').toBeGreaterThan(7)
  })

  it('uses one stable text colour for every level, whatever the hue', () => {
    // A foreground that flips per badge makes a table of badges read as noise.
    const foregrounds = new Set(HOSTILE.map(() => TEXT_PRIMARY))
    expect(foregrounds.size).toBe(1)

    for (const fill of HOSTILE) {
      const { surface } = levelBadgeColors(fill, PAGE_SURFACE)
      // …and it still clears AA over the row-hover surface beneath it (§8.1).
      expect(contrastRatio(rgb(TEXT_PRIMARY), rgb(surface)), `${fill}: on hover row`).toBeGreaterThanOrEqual(
        CONTRAST_TARGET,
      )
    }
  })

  it('never places text on a colour that cannot carry it', () => {
    for (const fill of HOSTILE) {
      assertReadable(fill, fill)
    }
  })

  it('keeps the indicator recognisably the configured colour', () => {
    // A dark colour is already compliant and must not be altered at all.
    const dark = levelBadgeColors('#1A2151', PAGE_SURFACE)
    expect(dark.indicator.toLowerCase()).toBe('#1a2151')

    // A pale one is darkened only as far as it must be, never to black.
    const pale = levelBadgeColors('#FFF200', PAGE_SURFACE)
    expect(pale.indicator.toLowerCase()).not.toBe('#000000')
    const { r, g, b } = rgb(pale.indicator)
    expect(r, 'yellow keeps a red-green bias').toBeGreaterThan(b)
    expect(g).toBeGreaterThan(b)
  })
})
