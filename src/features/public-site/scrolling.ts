/*
 * Scroll helpers for the public site's in-page anchors.
 *
 * Two things every caller would otherwise repeat: honour
 * `prefers-reduced-motion` (ARCHITECTURE.md §9), and treat `scrollTo` as a
 * progressive enhancement — jsdom does not implement it, so a missing method
 * must be a no-op rather than a thrown error inside a test.
 */

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Jumps to the top of the page, smoothly unless motion is reduced. */
export function scrollToTop(smooth = true): void {
  if (typeof window.scrollTo !== 'function') return
  window.scrollTo({ top: 0, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' })
}

/** Scrolls a section into view by id; silently ignores an unknown id. */
export function scrollToSection(sectionId: string): void {
  const target = document.getElementById(sectionId)
  if (!target || typeof target.scrollIntoView !== 'function') return
  target.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  })
}
