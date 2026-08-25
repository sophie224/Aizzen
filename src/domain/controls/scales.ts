import type { ControlConfig, ControlScaleLevel, Language } from '../types/index.ts'
import { pickLanguage } from '../localisation/index.ts'

/*
 * Configurable control scales (FR-CR-09).
 *
 * Every surface — both registers, the risk-side panel, the editors, the
 * exports and administration — resolves a level's name and colour through
 * these functions. No component may hold its own copy of a label or a colour,
 * the rule CLAUDE.md sets for the rating matrix.
 */

// --- configurable scales -----------------------------------------------------

/** Which scale a value belongs to. */
export type ControlScaleName = 'effectiveness' | 'maturity' | 'assurance' | 'classifications'

export function scaleLevels(config: ControlConfig, scale: ControlScaleName): ControlScaleLevel[] {
  return config[scale]
}

/**
 * The level a stored key resolves to, or `null` when the key is unknown.
 *
 * Unknown keys are expected: a level may be removed in administration while
 * historical records still carry it. Callers render the raw key rather than a
 * blank, so a record never loses its meaning.
 */
export function scaleLevel(
  config: ControlConfig,
  scale: ControlScaleName,
  key: string,
): ControlScaleLevel | null {
  return config[scale].find((level) => level.key === key) ?? null
}

/** Display label for a stored scale key, falling back to the key itself. */
export function scaleLabel(
  config: ControlConfig,
  scale: ControlScaleName,
  key: string,
  language: Language,
): string {
  const level = scaleLevel(config, scale, key)
  if (!level) return key
  return pickLanguage(level.labelEn, level.labelKa, language)
}

/** Chip colour for a stored scale key; empty when the level no longer exists. */
export function scaleColor(config: ControlConfig, scale: ControlScaleName, key: string): string {
  return scaleLevel(config, scale, key)?.color ?? ''
}

/** First level of a scale — the value a new record starts on. */
export function defaultScaleKey(config: ControlConfig, scale: ControlScaleName): string {
  return config[scale][0]?.key ?? ''
}
