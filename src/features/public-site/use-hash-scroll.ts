import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { scrollToSection, scrollToTop } from './scrolling.ts'

/*
 * Moves the page to whatever section the URL names.
 *
 * The header's items are real anchors, but React Router owns the address bar
 * and deliberately does not jump for a fragment — so the jump happens here, in
 * ONE place, which covers every way a fragment can arrive: a click in the
 * header, a pasted link, a reload, or the back button.
 *
 * The exception is REPLACE, which is how `useSectionSpy` records the section a
 * visitor scrolled to. Scrolling in response to that would fight them for
 * control of the page.
 *
 * `location.key` is in the dependencies so that clicking the item you are
 * already on scrolls back to the top of that section, exactly as a browser
 * re-follows an anchor.
 */

export function useHashScroll(ready: boolean): void {
  const { hash, key } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    // The sections only exist once the page has rendered its content.
    if (!ready || navigationType === 'REPLACE') return

    const sectionId = hash.replace(/^#/, '')
    if (sectionId) scrollToSection(sectionId)
    else scrollToTop(false)
  }, [hash, key, navigationType, ready])
}
