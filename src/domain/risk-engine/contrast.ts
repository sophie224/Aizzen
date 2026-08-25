/*
 * Contrast and tint maths for the configured risk colours (CR-005 §3.1).
 *
 * Pure and framework-free: the same functions serve the CSS variable injection
 * and any component that needs a readable foreground over a configured fill.
 *
 * The rule this file exists to enforce: white text on the configured yellow is
 * unreadable, so the foreground is COMPUTED from the fill, never assumed.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** Parses `#rgb` or `#rrggbb`. Returns null for anything else. */
export function parseHex(value: string): Rgb | null {
  const hex = value.trim().replace('#', '')

  if (hex.length === 3) {
    const [r, g, b] = [...hex].map((digit) => Number.parseInt(digit + digit, 16))
    return Number.isNaN(r + g + b) ? null : { r, g, b }
  }
  if (hex.length !== 6) return null

  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  return Number.isNaN(r + g + b) ? null : { r, g, b }
}

export function toHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

/** WCAG relative luminance. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const scaled = value / 255
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two colours, 1–21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const light = Math.max(luminance(a), luminance(b))
  const dark = Math.min(luminance(a), luminance(b))
  return (light + 0.05) / (dark + 0.05)
}

/*
 * Candidate foregrounds in preference order. White leads: a saturated fill
 * reads as a "dark" surface and carries light text, so white is used whenever
 * it actually meets the contrast requirement, and a dark ink takes over on the
 * pale fills where it does not.
 */
const FOREGROUNDS = ['#ffffff', '#0d1128', '#000000'] as const

/** WCAG AA for body text. */
export const CONTRAST_TARGET = 4.5

/**
 * WCAG AA for large text. Applies to a label set in bold at a display size —
 * the score badge, where the whole label is bold and set well above body size.
 */
export const LARGE_TEXT_TARGET = 3

/**
 * The most readable foreground for an arbitrary administrator-chosen fill.
 *
 * Returns the first candidate that clears `target`; if none does — which a very
 * mid-tone fill can cause — it returns the highest-contrast candidate rather
 * than a fixed colour, so the result is always the best available.
 */
export function readableOn(fill: string, target: number = CONTRAST_TARGET): string {
  const background = parseHex(fill)
  if (!background) return '#0d1128'

  const scored = FOREGROUNDS.map((candidate) => ({
    candidate,
    ratio: contrastRatio(background, parseHex(candidate) as Rgb),
  }))

  const passing = scored.find((entry) => entry.ratio >= target)
  if (passing) return passing.candidate

  return scored.reduce((best, entry) => (entry.ratio > best.ratio ? entry : best)).candidate
}

/** Mixes a colour with white; `amount` is the share of the colour kept. */
export function tint(fill: string, amount: number): string {
  const colour = parseHex(fill)
  if (!colour) return fill

  return toHex({
    r: 255 + (colour.r - 255) * amount,
    g: 255 + (colour.g - 255) * amount,
    b: 255 + (colour.b - 255) * amount,
  })
}

/**
 * Badge colours for an administrator-configured level (Design Uplift v2 §6.2).
 *
 * Small text is NEVER placed on a raw configured fill: for a mid-luminance
 * amber neither black nor white reaches 4.5:1, so any "pick the readable
 * foreground" approach fails silently. Instead:
 *
 *   surface   — a heavy tint of the fill, light enough that the standard text
 *               token clears 4.5:1 for ANY hue;
 *   indicator — the fill itself, darkened only as far as it must be to clear
 *               3:1 against the lightest adjacent surface, so it stays
 *               recognisably the configured colour while meeting the
 *               non-text contrast rule (WCAG 1.4.11).
 *
 * Computed here rather than with `color-mix()` in CSS so the same numbers can
 * be asserted in a test against the live configuration (§6.3).
 */
export interface LevelBadgeColors {
  surface: string
  indicator: string
}

/** Share of the configured fill kept in the badge surface. */
const BADGE_TINT = 0.14

/** Non-text contrast floor for the indicator (WCAG 1.4.11). */
export const INDICATOR_TARGET = 3

export function levelBadgeColors(
  fill: string,
  pageSurface = '#ffffff',
): LevelBadgeColors {
  const surface = tint(fill, BADGE_TINT)
  const colour = parseHex(fill)
  const page = parseHex(pageSurface)
  if (!colour || !page) return { surface, indicator: fill }

  /*
   * Darken in small steps until the indicator clears 3:1 against BOTH surfaces
   * it touches — the page behind the badge and the badge's own tint, which is
   * slightly darker and therefore the harder of the two. A configured pale
   * yellow ends up a deeper gold: still the same hue, now actually visible.
   */
  const tinted = parseHex(surface) ?? page
  let candidate = colour
  for (let step = 0; step < 100; step += 1) {
    const worst = Math.min(contrastRatio(candidate, page), contrastRatio(candidate, tinted))
    if (worst >= INDICATOR_TARGET) break
    candidate = { r: candidate.r * 0.94, g: candidate.g * 0.94, b: candidate.b * 0.94 }
  }

  return { surface, indicator: toHex(candidate) }
}

/** The four variables every rating level exposes (CR-005 §3.1). */
export interface RiskColorSet {
  fill: string
  on: string
  soft: string
  border: string
}

export function riskColorSet(fill: string): RiskColorSet {
  return {
    fill,
    on: readableOn(fill),
    soft: tint(fill, 0.12),
    border: tint(fill, 0.4),
  }
}

/**
 * The full `--risk-N-*` variable set for a configured palette.
 *
 * Pure so it can be unit-tested and reused; the caller decides where to write
 * the result. `RATING_LABELS` order fixes the numbering: 1 Low … 4 Significant.
 */
export function riskColorVariables(colors: Record<string, string>, keys: readonly string[]) {
  const variables: Record<string, string> = {}

  keys.forEach((key, index) => {
    const fill = colors[key]
    if (!fill) return

    const set = riskColorSet(fill)
    const slot = index + 1
    variables[`--risk-${String(slot)}`] = set.fill
    variables[`--risk-${String(slot)}-on`] = set.on
    variables[`--risk-${String(slot)}-soft`] = set.soft
    variables[`--risk-${String(slot)}-border`] = set.border
  })

  return variables
}
