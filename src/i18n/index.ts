import { useCallback } from 'react'
import { pickLabel, pickLanguage, pickNamed } from '../domain/localisation/index.ts'
import type { Language } from '../domain/types/index.ts'
import { useSessionStore } from '../app/session/session-store.ts'
import { dictionary, type TranslationKey } from './dictionary.ts'

/*
 * Runtime English ⇄ ქართული switching (ARCHITECTURE.md §9).
 *
 * The active language is UI state, held in the session store — it is not
 * business data and is never persisted into AppState.
 */

export type { TranslationKey } from './dictionary.ts'
export { dictionary } from './dictionary.ts'
export { pickLabel, pickLanguage, pickNamed } from '../domain/localisation/index.ts'

/** Resolves a chrome string, falling back to English when Georgian is blank. */
export function translate(key: TranslationKey, language: Language): string {
  const phrase = dictionary[key]
  return pickLabel(phrase, language)
}

export interface Translator {
  t: (key: TranslationKey) => string
  language: Language
  setLanguage: (language: Language) => void
  toggleLanguage: () => void
  /** Resolves an `<field>En` / `<field>Ka` pair on a master-data record. */
  named: (record: Record<string, unknown>, base: string) => string
  /** Resolves a loose `{ en, ka }` pair. */
  label: (label: { en: string; ka: string }) => string
}

/** Access to the active language and the resolvers bound to it. */
export function useTranslation(): Translator {
  const language = useSessionStore((state) => state.language)
  const setLanguage = useSessionStore((state) => state.setLanguage)
  const toggleLanguage = useSessionStore((state) => state.toggleLanguage)

  const t = useCallback((key: TranslationKey) => translate(key, language), [language])
  const named = useCallback(
    (record: Record<string, unknown>, base: string) => pickNamed(record, base, language),
    [language],
  )
  const label = useCallback(
    (value: { en: string; ka: string }) => pickLanguage(value.en, value.ka, language),
    [language],
  )

  return { t, language, setLanguage, toggleLanguage, named, label }
}
