import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAppData } from '../../data/app-data-context.ts'
import { canAccess, canOpenAdministration, canOpenWebsiteAdministration } from '../../domain/permissions/index.ts'
import { useTranslation } from '../../i18n/index.ts'
import { BrandMark } from '../../ui/brand-mark.tsx'
import { IconChart, IconGauge, IconGlobe, IconList, IconSettings, IconSignOut } from '../../ui/icons.tsx'
import { initialsOf } from '../../ui/initials.ts'
import { RiskPalette } from './risk-palette.tsx'
import { useAuth } from '../session/use-auth.ts'
import { useCurrentUser } from '../session/use-current-user.ts'
import './app-shell.css'

/*
 * Application shell (ARCHITECTURE.md §9).
 *
 * Layout requirements fixed by the PRD and the AIZEN Risk & Compliance target
 * design:
 *   - AIZEN cotton-flower logo, TOP-LEFT (head of the dark navy rail)
 *   - light top bar carrying the product name, EN/KA toggle and CLIENT slot
 *   - uploadable client company logo, TOP-RIGHT
 *   - ADMINISTRATION entry point, BOTTOM-LEFT
 */

/**
 * Top-right client slot: the uploaded company logo, or the CLIENT placeholder
 * button shown in the target design until one is set (Risk Administration →
 * Branding, M12).
 */
function ClientLogo() {
  const { t } = useTranslation()
  const { state } = useAppData()
  const logo = state?.branding.clientLogo ?? null

  if (!logo) {
    return (
      <span className="topbar__client" aria-label={t('app.clientLogoAlt')} title={t('app.clientLogoAlt')}>
        {t('app.clientShort')}
      </span>
    )
  }
  return <img className="topbar__client-logo" src={logo} alt={t('app.clientLogoAlt')} />
}

/**
 * EN / KA segmented toggle.
 *
 * One control, not two: the accessible name always states the action it will
 * perform, while the segments show which language is live.
 */
function LanguageToggle() {
  const { t, language, toggleLanguage } = useTranslation()

  return (
    <button
      type="button"
      className="topbar__language"
      onClick={toggleLanguage}
      aria-label={t(language === 'en' ? 'language.switchToGeorgian' : 'language.switchToEnglish')}
    >
      <span className={language === 'en' ? 'topbar__language-seg is-active' : 'topbar__language-seg'}>
        EN
      </span>
      <span className={language === 'ka' ? 'topbar__language-seg is-active' : 'topbar__language-seg'}>
        KA
      </span>
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
      {/* Publishes the configured rating palette as CSS variables. */}
      <RiskPalette />
      <a className="skip-link" href="#main-content">
        {t('nav.skipToContent')}
      </a>

      {/* Top-left: the AIZEN brand heads the dark navigation rail. */}
      <nav className="rail" aria-label={t('nav.primary')}>
        <Link to="/dashboard" className="rail__brand">
          <BrandMark label={t('app.brandAlt')} className="rail__mark" />
          <span className="rail__brand-text">
            <span className="rail__brand-name">AIZEN</span>
            <span className="rail__brand-line">{t('app.brandLine')}</span>
          </span>
        </Link>

        <div className="rail__nav">
          {canAccess(context, 'dashboard', 'read') ? (
            <NavLink to="/dashboard" className="rail__link">
              <IconGauge />
              {t('nav.dashboard')}
            </NavLink>
          ) : null}
          {canAccess(context, 'register', 'read') ? (
            <NavLink to="/register" className="rail__link">
              <IconList />
              {t('nav.register')}
            </NavLink>
          ) : null}
          {canAccess(context, 'reports', 'read') ? (
            <NavLink to="/reports" className="rail__link">
              <IconChart />
              {t('nav.reports')}
            </NavLink>
          ) : null}
        </div>

        {/*
         * Bottom-left ADMINISTRATION entry point. Hidden entirely from roles
         * that cannot open it — the guard still enforces the rule on direct
         * navigation (ARCHITECTURE.md §5.1).
         */}
        <div className="rail__foot">
          {showWebsiteAdministration ? (
            <NavLink to="/admin/site" className="rail__admin-link">
              <IconGlobe />
              {t('nav.websiteAdministration')}
            </NavLink>
          ) : null}
          {showAdministration ? (
            <NavLink to="/administration" className="rail__admin-link">
              <IconSettings />
              {t('nav.administration')}
            </NavLink>
          ) : null}

          {user ? (
            <div className="rail__user">
              <span className="avatar avatar--rail" aria-hidden="true">
                {initialsOf(user.name)}
              </span>
              <span className="rail__user-text">
                <span className="rail__user-name">
                  <span className="visually-hidden">{t('session.signedInAs')} </span>
                  {user.name}
                </span>
                <span className="rail__user-title">{user.title}</span>
              </span>
              <button
                type="button"
                className="rail__signout"
                aria-label={t('session.signOut')}
                title={t('session.signOut')}
                onClick={() => {
                  void signOut()
                }}
              >
                <IconSignOut />
              </button>
            </div>
          ) : null}
        </div>
      </nav>

      <header className="topbar">
        <div className="topbar__identity">
          <p className="topbar__product">{t('app.name')}</p>
          <p className="topbar__module">{t('app.moduleSubtitle')}</p>
        </div>

        <div className="topbar__actions">
          <LanguageToggle />
          {/* Top-right: client company logo. */}
          <ClientLogo />
        </div>
      </header>

      <main id="main-content" className="shell__main" ref={mainRef} tabIndex={-1}>
        <div key={location.pathname} className="route-enter">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
