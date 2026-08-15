import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppData } from '../../data/app-data-context.ts'
import { canAccess, canOpenWebsiteAdministration } from '../../domain/permissions/index.ts'
import { pickLanguage, useTranslation } from '../../i18n/index.ts'
import { useAuth } from '../../app/session/use-auth.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { scrollToSection, scrollToTop } from './scrolling.ts'
import { siteAssets } from './site-assets.ts'
import { SiteIcon } from './site-icons.tsx'

/*
 * Public website header (PRD public site; ARCHITECTURE.md §8.5).
 *
 * Navigation is Home / Solutions / Product demo / About us, exactly as the v7
 * build shipped it. Solutions and Product demo are anchors inside the home
 * page, so they scroll when already there and navigate-then-scroll otherwise.
 *
 * The header shows what the visitor can actually reach: signed out, one
 * "Sign in" button; signed in, a route into the platform, plus Website
 * Administration for a Super Administrator only. The links are a convenience —
 * the route guards remain the enforcement point.
 */

export type PublicNavKey = 'home' | 'solutions' | 'demo' | 'about'

interface PublicHeaderProps {
  active?: PublicNavKey
}

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

export function PublicHeader({ active = 'home' }: PublicHeaderProps) {
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
    navigate(canOpenPlatform ? '/app/dashboard' : '/login')
  }

  const go = (path: string, sectionId = '') => {
    setMenuOpen(false)

    if (path === location.pathname) {
      if (sectionId) scrollToSection(sectionId)
      else scrollToTop()
      return
    }

    navigate(path)
    // The target section only exists once the destination page has mounted.
    if (sectionId) {
      window.setTimeout(() => {
        scrollToSection(sectionId)
      }, 180)
    }
  }

  const navItems: Array<{ key: PublicNavKey; label: string; go: () => void }> = [
    { key: 'home', label: t('public.nav.home'), go: () => go('/') },
    { key: 'solutions', label: t('public.nav.solutions'), go: () => go('/', 'solutions') },
    { key: 'demo', label: t('public.nav.demo'), go: () => go('/', 'demo') },
    { key: 'about', label: t('public.nav.about'), go: () => go('/about') },
  ]

  const renderNav = (className: string) => (
    <nav className={className} aria-label={t('public.nav.aria')}>
      {navItems.map((item) => (
        <button
          key={item.key}
          type="button"
          className={active === item.key ? 'active' : ''}
          aria-current={active === item.key ? 'page' : undefined}
          onClick={item.go}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )

  return (
    <header className="aizen-public-header">
      <button
        type="button"
        className="aizen-public-brand"
        onClick={() => go('/')}
        aria-label={brandName}
      >
        <BrandLockup brandName={brandName} descriptor={descriptor} />
      </button>

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
          <button
            type="button"
            className="aizen-btn aizen-btn--primary aizen-btn--sm"
            onClick={() => {
              navigate('/login')
            }}
          >
            {t('public.signInToPlatform')}
          </button>
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

      {menuOpen ? renderNav('aizen-mobile-nav') : null}
    </header>
  )
}
