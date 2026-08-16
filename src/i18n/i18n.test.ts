import { describe, expect, it, vi } from 'vitest'
import { dictionary, translate, type TranslationKey } from './index.ts'

/*
 * The bilingual fallback rule (ARCHITECTURE.md §9) plus the missing-key
 * guard — several call sites build a key from stored data, so an unknown key
 * is reachable and must never throw during render.
 */

describe('translate', () => {
  it('returns the English phrase', () => {
    expect(translate('register.column.ref', 'en')).toBe('Reference')
  })

  it('returns the Georgian phrase', () => {
    expect(translate('register.column.ref', 'ka')).toBe('ნომერი')
  })

  it('falls back to English when the Georgian value is blank', () => {
    const key = Object.keys(dictionary).find(
      (candidate) => dictionary[candidate as TranslationKey].ka.trim() === '',
    ) as TranslationKey | undefined

    if (key) expect(translate(key, 'ka')).toBe(dictionary[key].en)
  })

  it('returns the key instead of throwing when the phrase is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const missing = 'register.column.trend_removed' as TranslationKey

    expect(() => translate(missing, 'en')).not.toThrow()
    expect(translate(missing, 'ka')).toBe(missing)

    warn.mockRestore()
  })
})
