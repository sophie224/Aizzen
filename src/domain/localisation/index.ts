import type { Language } from '../types/index.ts'

/*
 * The bilingual fallback rule (ARCHITECTURE.md §9).
 *
 * "When the Georgian translation is empty the UI falls back to the English
 * value." This is a business rule, not a presentation detail — master data,
 * scale labels, chrome strings and hierarchy paths all obey it — so it lives
 * in the domain and everything else calls through here.
 */

/** Returns the requested language, falling back to English when it is blank. */
export function pickLanguage(en: string, ka: string, language: Language): string {
  if (language !== 'ka') return en
  return ka.trim().length > 0 ? ka : en
}

/** Convenience for the `{ en, ka }` label pairs used across master data. */
export function pickLabel(label: { en: string; ka: string }, language: Language): string {
  return pickLanguage(label.en, label.ka, language)
}

/**
 * Convenience for records using the `<field>En` / `<field>Ka` convention,
 * e.g. `pickNamed(unit, 'name', 'ka')` reads `nameKa` then falls back to
 * `nameEn`.
 *
 * Takes `object` rather than `Record<string, unknown>` so plain interfaces —
 * which carry no index signature — satisfy it.
 */
export function pickNamed(record: object, base: string, language: Language): string {
  const source = record as Record<string, unknown>
  const en = source[`${base}En`]
  const ka = source[`${base}Ka`]
  return pickLanguage(typeof en === 'string' ? en : '', typeof ka === 'string' ? ka : '', language)
}
