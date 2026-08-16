/*
 * Compatibility mapping for the retired `/app` URL prefix.
 *
 * The platform pages used to sit under `/app/*`; they now live at the top
 * level. Links persisted before the change — bookmarks, shared URLs, anything
 * copied out of the browser bar — are redirected rather than broken, so the
 * prefix survives only as this translation (see `routes.tsx`).
 */

/** `/app/register?x=1` → `/register?x=1`; bare `/app` → the dashboard. */
export function legacyAppTarget(pathname: string, search = '', hash = ''): string {
  const rest = pathname.slice('/app'.length).replace(/\/+$/, '')

  return `${rest || '/dashboard'}${search}${hash}`
}
