/**
 * Resolves a CSS colour value to a literal hex.
 *
 * Colours reach the chart layer either as a hex (a configured rating colour)
 * or as `var(--chart-n)` (a palette default). Anything that needs to reason
 * about the colour — computing a readable label over it, or filling a native
 * colour input — needs the literal, so the token is read off the document.
 */
export function resolveCssColor(value: string, fallback = '#1a2151'): string {
  if (!value.startsWith('var(')) return value || fallback
  const name = value.slice(4, -1).split(',')[0].trim()
  if (typeof document === 'undefined') return fallback
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return resolved || fallback
}
