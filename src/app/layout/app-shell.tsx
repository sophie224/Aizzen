import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAppData } from '../../data/app-data-context.ts'
import { canAccess, canOpenAdministration, canOpenWebsiteAdministration } from '../../domain/permissions/index.ts'
import { useTranslation } from '../../i18n/index.ts'
import { useAuth } from '../session/use-auth.ts'
import { useCurrentUser } from '../session/use-current-user.ts'
import './app-shell.css'

/*
 * Application shell (ARCHITECTURE.md §9).
 *
 * Layout requirements fixed by the PRD:
 *   - AIZEN cotton-flower logo, TOP-LEFT
 *   - uploadable client company logo, TOP-RIGHT
 *   - ADMINISTRATION entry point, BOTTOM-LEFT
 */

/** Placeholder cotton-flower mark; the final asset lands with the brand pass. */
function BrandMark() {
  const { t } = useTranslation()
  return (
    <svg
      className="shell__brand-mark"
      viewBox="0 0 32 32"
      role="img"
      aria-label={t('app.brandAlt')}
      focusable="false"
    >
      <g fill="currentColor">
        <circle cx="16" cy="9" r="5.2" />
        <circle cx="9" cy="18" r="5.2" />
        <circle cx="23" cy="18" r="5.2" />
        <circle cx="16" cy="24" r="4.4" />
        <circle cx="16" cy="17" r="3" fill="var(--color-primary)" />
      </g>
    </svg>
  )
}

/** Top-right client logo, uploaded in Risk Administration → Branding (M12). */
function ClientLogo() {
  const { t } = useTranslation()
  const { state } = useAppData()
  const logo = state?.branding.clientLogo ?? null

  if (!logo) {
    return <span className="shell__client-logo-placeholder">{t('app.clientLogoAlt')}</span>
  }
  return <img className="shell__client-logo" src={logo} alt={t('app.clientLogoAlt')} />
}

function LanguageToggle() {
  const { t, language, toggleLanguage } = useTranslation()

  return (
    <button
      type="button"
      className="shell__language"
      onClick={toggleLanguage}
      aria-label={t(language === 'en' ? 'language.switchToGeorgian' : 'language.switchToEnglish')}
    >
      {language === 'en' ? t('language.georgian') : t('language.english')}
    </button>
  )
}

/**
 * Smooth enter transition plus scroll-to-top on navigation.
 *
 * The animation itself is CSS, so `prefers-reduced-motion` disables it through
 * the global rule in index.css. Scrolling is matched to the same preference.
 */
function useRouteTransition(pathname: string) {
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const main = mainRef.current
    // `scrollTo` is absent in some test environments; the guard keeps the
    // transition a progressive enhancement rather than a hard dependency.
    if (!main || typeof main.scrollTo !== 'function') return

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    main.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
  }, [pathname])

  return mainRef
}

export function AppShell() {
  const { t } = useTranslation()
  const location = useLocation()
  const mainRef = useRouteTransition(location.pathname)
  const { user, context } = useCurrentUser()
  const { signOut } = useAuth()

  const showAdministration = canOpenAdministration(context)
  const showWebsiteAdministration = canOpenWebsiteAdministration(context)

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        {t('nav.skipToContent')}
      </a>

      <header className="shell__header">
        {/* Top-left: AIZEN brand */}
        <Link to="/app/dashboard" className="shell__brand">
          <BrandMark />
          <span>{t('app.name')}</span>
        </Link>

        <div className="shell__header-actions">
          <LanguageToggle />
          {user ? (
            <>
              <span className="shell__user">
                <span className="visually-hidden">{t('session.signedInAs')} </span>
                {user.name}
              </span>
              <button
                type="button"
                className="shell__language"
                onClick={() => {
                  void signOut()
                }}
              >
                {t('session.signOut')}
              </button>
            </>
          ) : null}
          {/* Top-right: client company logo */}
          <ClientLogo />
        </div>
      </header>

      <div className="shell__body">
        <nav className="shell__sidebar" aria-label={t('nav.primary')}>
          <div className="shell__nav">
            {canAccess(context, 'dashboard', 'read') ? (
              <NavLink to="/app/dashboard" className="shell__nav-link">
                {t('nav.dashboard')}
              </NavLink>
            ) : null}
            {canAccess(context, 'register', 'read') ? (
              <NavLink to="/app/register" className="shell__nav-link">
                {t('nav.register')}
              </NavLink>
            ) : null}
            {canAccess(context, 'reports', 'read') ? (
              <NavLink to="/app/reports" className="shell__nav-link">
                {t('nav.reports')}
              </NavLink>
            ) : null}
          </div>

          {/*
           * Bottom-left ADMINISTRATION entry point. Hidden entirely from roles
           * that cannot open it — the guard still enforces the rule on direct
           * navigation (ARCHITECTURE.md §5.1).
           */}
          {showAdministration || showWebsiteAdministration ? (
            <div className="shell__admin-entry">
              {showAdministration ? (
                <NavLink to="/app/administration" className="shell__admin-link">
                  {t('nav.administration')}
                </NavLink>
              ) : null}
              {showWebsiteAdministration ? (
                <NavLink to="/admin/site" className="shell__admin-link">
                  {t('nav.websiteAdministration')}
                </NavLink>
              ) : null}
            </div>
          ) : null}
        </nav>

        <main id="main-content" className="shell__main" ref={mainRef} tabIndex={-1}>
          <div key={location.pathname} className="route-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
