/*
 * The public site's navigation targets.
 *
 * ONE registry, read by the header's links, by the highlighted item and by the
 * scroll spy — so a section can never be navigable without also being
 * addressable and trackable.
 *
 * Home / Solutions / Product demo are sections of the home page, reached by
 * URL fragment (`/#solutions`); About Us is a route of its own.
 */

export type PublicNavKey = 'home' | 'solutions' | 'demo' | 'about'

export interface PublicNavTarget {
  key: PublicNavKey
  /** Route the target lives on. */
  path: string
  /** Element id on `path`; absent when the target is a page rather than a section. */
  sectionId?: string
}

/** In document order — the spy relies on that when two sections share the band. */
export const PUBLIC_NAV_TARGETS: readonly PublicNavTarget[] = [
  { key: 'home', path: '/', sectionId: 'home' },
  { key: 'solutions', path: '/', sectionId: 'solutions' },
  { key: 'demo', path: '/', sectionId: 'demo' },
  { key: 'about', path: '/about' },
]

/** Home-page section ids, in document order. */
export const HOME_SECTION_IDS: readonly string[] = PUBLIC_NAV_TARGETS.filter(
  (target) => target.path === '/' && target.sectionId !== undefined,
).map((target) => target.sectionId as string)

/**
 * The URL fragment a section owns.
 *
 * The hero is the top of the page and carries none, so a visitor who has not
 * moved yet keeps a clean `/` — the same thing a browser does with a bare
 * anchor link.
 */
export function hashForSection(sectionId: string): string {
  return sectionId === HOME_SECTION_IDS[0] ? '' : `#${sectionId}`
}

/** The `href` a nav target points at, fragment included. */
export function hrefForTarget(target: PublicNavTarget): string {
  return target.sectionId ? `${target.path}${hashForSection(target.sectionId)}` : target.path
}

/**
 * Which navigation item the current URL belongs to.
 *
 * Derived, never stored: the header reads the router rather than being told by
 * whichever page rendered it, so the URL and the highlighted item cannot drift.
 */
export function activeNavKey(pathname: string, hash: string): PublicNavKey {
  const page = PUBLIC_NAV_TARGETS.find(
    (target) => target.sectionId === undefined && target.path === pathname,
  )
  if (page) return page.key

  const sectionId = hash.replace(/^#/, '')
  const section = PUBLIC_NAV_TARGETS.find(
    (target) => target.path === pathname && target.sectionId === sectionId,
  )

  return section?.key ?? 'home'
}
