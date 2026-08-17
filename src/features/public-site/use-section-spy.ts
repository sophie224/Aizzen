import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HOME_SECTION_IDS, hashForSection } from './sections.ts'

/*
 * Keeps the URL fragment in step with the section actually on screen.
 *
 * Without it the header would only know where a visitor clicked, not where
 * they are: scrolling past Solutions by hand, or following a call to action
 * into the demo, would leave Home highlighted and the URL stale.
 *
 * The fragment is REPLACED, never pushed — scrolling a page must not fill the
 * back button, and `useHashScroll` treats REPLACE as "do not scroll", so the
 * two hooks cannot chase each other.
 */

/**
 * A section becomes current once it crosses the middle band of the viewport,
 * which is where a reader's attention sits — not when its first pixel appears.
 */
const VIEWPORT_BAND = '-45% 0px -50% 0px'

export function useSectionSpy(enabled: boolean): void {
  const navigate = useNavigate()
  const { hash } = useLocation()

  // Mirrors the live fragment so the observer callback can compare against the
  // current URL without re-subscribing on every scroll.
  const currentHash = useRef(hash)
  useEffect(() => {
    currentHash.current = hash
  }, [hash])

  useEffect(() => {
    // Progressive enhancement: where there is no IntersectionObserver (jsdom,
    // older browsers) the fragment simply stays as navigated.
    if (!enabled || typeof IntersectionObserver !== 'function') return

    const sections = HOME_SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (element): element is HTMLElement => element !== null,
    )
    if (sections.length === 0) return

    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }

        // Two sections can share the band mid-scroll; the earlier one wins.
        const current = HOME_SECTION_IDS.find((id) => visible.has(id))
        if (current === undefined) return

        const next = hashForSection(current)
        if (next === currentHash.current) return

        currentHash.current = next
        navigate({ pathname: '/', hash: next }, { replace: true })
      },
      { rootMargin: VIEWPORT_BAND, threshold: 0 },
    )

    for (const section of sections) observer.observe(section)
    return () => {
      observer.disconnect()
    }
  }, [enabled, navigate])
}
