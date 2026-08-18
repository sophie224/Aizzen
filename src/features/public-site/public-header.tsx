import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAppData } from '../../data/app-data-context.ts'
import { canAccess, canOpenWebsiteAdministration } from '../../domain/permissions/index.ts'
import { pickLanguage, useTranslation } from '../../i18n/index.ts'
import { useAuth } from '../../app/session/use-auth.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { activeNavKey, hrefForTarget, PUBLIC_NAV_TARGETS } from './sections.ts'
import { siteAssets } from './site-assets.ts'
import { SiteIcon } from './site-icons.tsx'
import { useSectionSpy } from './use-section-spy.ts'

/*
 * Public website header (PRD public site; ARCHITECTURE.md §8.5).
 *
 * Navigation is Home / Solutions / Product demo / About us, exactly as the v7
 * build shipped it. Solutions and Product demo are sections of the home page,
 * addressed by URL fragment — `/#solutions`, `/#demo`.
 *
 * They are ANCHORS, not buttons: a destination the visitor can open in a new
 * tab, copy, bookmark and reach with the back button is a link, and the
 * browser gives that behaviour for free. `useHashScroll` on the page performs
 * the jump; `useSectionSpy` writes the fragment back as the visitor scrolls.
 * The highlighted item is derived from the router — pathname plus fragment —
 * never passed in by whichever page rendered the header, so the URL and the
 * highlight cannot drift apart.
 *
 * The header shows what the visitor can actually reach: signed out, one
 * "Sign in" button; signed in, a route into the platform, plus Website
 * Administration for a Super Administrator only. The links are a convenience —
 * the route guards remain the enforcement point.
 */

export type { PublicNavKey } from './sections.ts'

/** AIZEN cotton-flower mark, top-left on every public page. */
export function BrandLockup({ brandName, descriptor }: { brandName: string; descriptor: string }) {
  return (
    <>
      <span className="aizen-brand-mark">
        <img src={siteAssets.cottonFlower} alt="" aria-hidden="true" />
      </span>
      <span>
        <strong>{brandName}</strong>
        <small>{descriptor}</small>
      </span>
    </>
  )
}

export function PublicHeader() {
  const { t, language, setLanguage } = useTranslation()
  const { state } = useAppData()
  const { user, context } = useCurrentUser()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const content = state?.siteContent
  const brandName = content?.brandName ?? 'AIZEN'
  const descriptor = pickLanguage(
    content?.brandDescriptor ?? '',
    content?.brandDescriptorKa ?? '',
    language,
  )

  const canOpenPlatform = user !== null && canAccess(context, 'dashboard', 'read')
  const openPlatform = () => {
    navigate(canOpenPlatform ? '/dashboard' : '/login')
  }

  const active = activeNavKey(location.pathname, location.hash)

  // Only the home page carries sections, and only once its content is on screen.
  useSectionSpy(location.pathname === '/' && content !== undefined)

  const navLabels: Record<string, string> = {
    home: t('public.nav.home'),
    solutions: t('public.nav.solutions'),
    demo: t('public.nav.demo'),
    about: t('public.nav.about'),
  }

  /*
   * `withRequestDemo` is the mobile menu only: the action buttons collapse at
   * phone widths, so without this the demo request would be unreachable from
   * the header on the devices most likely to be reading a marketing page.
   */
  const renderNav = (className: string, withRequestDemo = false) => (
    <nav className={className} aria-label={t('public.nav.aria')}>
      {PUBLIC_NAV_TARGETS.map((target) => (
        <Link
          key={target.key}
          to={hrefForTarget(target)}
          className={active === target.key ? 'active' : ''}
          /*
           * `page` for a route, `location` for a section within the page the
           * visitor is already on — the distinction a screen reader needs.
           */
          aria-current={
            active === target.key ? (target.sectionId ? 'location' : 'page') : undefined
          }
          onClick={() => {
            setMenuOpen(false)
          }}
        >
          {navLabels[target.key]}
        </Link>
      ))}

      {withRequestDemo && !user ? (
        <Link
          to="/request-demo"
          className={location.pathname === '/request-demo' ? 'active' : ''}
          aria-current={location.pathname === '/request-demo' ? 'page' : undefined}
          onClick={() => {
            setMenuOpen(false)
          }}
        >
          {t('public.requestDemo')}
        </Link>
      ) : null}
    </nav>
  )

  return (
    <header className="aizen-public-header">
      {/* The brand is a link home, like every site header on the web. */}
      <Link to="/" className="aizen-public-brand" aria-label={brandName}>
        <BrandLockup brandName={brandName} descriptor={descriptor} />
      </Link>

      {renderNav('aizen-public-nav')}

      <div className="aizen-public-actions">
        <div className="aizen-language-switch">
          <button
            type="button"
            className={language === 'en' ? 'active' : ''}
            aria-pressed={language === 'en'}
            onClick={() => {
              setLanguage('en')
            }}
          >
            EN
          </button>
          <button
            type="button"
            className={language === 'ka' ? 'active' : ''}
            aria-pressed={language === 'ka'}
            onClick={() => {
              setLanguage('ka')
            }}
          >
            KA
          </button>
        </div>

        {user ? (
          <>
            {canOpenWebsiteAdministration(context) ? (
              <button
                type="button"
                className="aizen-btn aizen-btn--secondary aizen-btn--sm"
                onClick={() => {
                  navigate('/admin/site')
                }}
              >
                <SiteIcon name="settings" size={15} />
                {t('public.siteManagement')}
              </button>
            ) : null}
            <button
              type="button"
              className="aizen-btn aizen-btn--primary aizen-btn--sm"
              onClick={openPlatform}
            >
              {t('public.openRiskManagement')}
            </button>
            <button
              type="button"
              className="aizen-signout"
              title={t('session.signOut')}
              aria-label={t('session.signOut')}
              onClick={() => {
                void signOut()
              }}
            >
              <SiteIcon name="logout" size={17} />
            </button>
          </>
        ) : (
          <>
            {/*
             * A link, not a button: the demo request is a page a visitor can
             * open in a new tab, bookmark and share — the same reasoning as the
             * navigation above. It is offered to visitors only; someone who is
             * already signed in has the product itself.
             */}
            <Link
              to="/request-demo"
              className="aizen-btn aizen-btn--secondary aizen-btn--sm"
              aria-current={location.pathname === '/request-demo' ? 'page' : undefined}
            >
              {t('public.requestDemo')}
            </Link>
            <button
              type="button"
              className="aizen-btn aizen-btn--primary aizen-btn--sm"
              onClick={() => {
                navigate('/login')
              }}
            >
              {t('public.signInToPlatform')}
            </button>
          </>
        )}

        <button
          type="button"
          className={`aizen-mobile-menu ${menuOpen ? 'active' : ''}`}
          aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen((open) => !open)
          }}
        >
          <SiteIcon name={menuOpen ? 'close' : 'menu'} size={20} />
        </button>
      </div>

      {menuOpen ? renderNav('aizen-mobile-nav', true) : null}
    </header>
  )
}
