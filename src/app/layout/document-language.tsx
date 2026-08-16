import { useEffect } from 'react'
import { useTranslation } from '../../i18n/index.ts'

/*
 * Keeps `<html lang>` in step with the active language.
 *
 * Two reasons this is required rather than cosmetic:
 *
 *   1. WCAG 2.2 SC 3.1.1 — a screen reader picks its voice and pronunciation
 *      rules from this attribute. Georgian content announced as English is
 *      unintelligible.
 *   2. Every `:lang(en)` rule in the stylesheets depends on it. Georgian
 *      (Mkhedruli) is unicameral, so uppercase and positive letter-spacing are
 *      scoped to English; without a correct `lang` those rules would still
 *      apply to Georgian text (Design Uplift §11.1, §11.2).
 *
 * Renders nothing. Mounted once at the application root so it covers the
 * public site as well as the signed-in shell.
 */
export function DocumentLanguage() {
  const { language } = useTranslation()

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  return null
}
