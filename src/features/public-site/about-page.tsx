import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../../data/app-data-context.ts'
import { canAccess } from '../../domain/permissions/index.ts'
import { pickLanguage, useTranslation } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { PublicHeader } from './public-header.tsx'
import { PublicFooter } from './public-footer.tsx'
import { scrollToTop } from './scrolling.ts'
import { siteAssets } from './site-assets.ts'
import { SiteIcon, type SiteIconName } from './site-icons.tsx'
import './public-site.css'

/*
 * Public About Us page (ARCHITECTURE.md §8.5).
 *
 * The four pillars and every team profile come from `AppState.siteContent`,
 * edited in Website Administration. A team member with no uploaded portrait
 * falls back to their initials rather than an empty frame.
 */

/** First letter of the first two words — the portrait placeholder. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function PublicAboutPage() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const { user, context } = useCurrentUser()
  const navigate = useNavigate()

  useEffect(() => {
    scrollToTop(false)
  }, [])

  // Same element order as the loaded page, so the header survives the swap.
  const content = state?.siteContent
  if (!content) {
    return (
      <div className="aizen-public-site aizen-about-page">
        <a className="skip-link" href="#public-main">
          {t('nav.skipToContent')}
        </a>
        <PublicHeader active="about" />
        <main id="public-main">
          <p className="aizen-public-loading">{t('state.loading')}</p>
        </main>
        <PublicFooter />
      </div>
    )
  }

  const text = (en: string, ka: string) => pickLanguage(en, ka, language)
  const canOpenPlatform = user !== null && canAccess(context, 'dashboard', 'read')
  const openPlatform = () => {
    navigate(canOpenPlatform ? '/app/dashboard' : '/login')
  }

  const team = [...content.team].sort((a, b) => a.order - b.order)
  const pillars: Array<{ id: string; icon: SiteIconName; title: string; body: string }> = [
    {
      id: 'reach',
      icon: 'globe',
      title: text(content.aboutReachTitle, content.aboutReachTitleKa),
      body: text(content.aboutReachDescription, content.aboutReachDescriptionKa),
    },
    {
      id: 'people',
      icon: 'user',
      title: text(content.aboutPeopleTitle, content.aboutPeopleTitleKa),
      body: text(content.aboutPeopleDescription, content.aboutPeopleDescriptionKa),
    },
    {
      id: 'clients',
      icon: 'layers',
      title: text(content.aboutClientsTitle, content.aboutClientsTitleKa),
      body: text(content.aboutClientsDescription, content.aboutClientsDescriptionKa),
    },
    {
      id: 'vision',
      icon: 'trendUp',
      title: text(content.aboutVisionTitle, content.aboutVisionTitleKa),
      body: text(content.aboutVisionDescription, content.aboutVisionDescriptionKa),
    },
  ]

  const brandName = content.brandName
  const descriptor = text(content.brandDescriptor, content.brandDescriptorKa)

  return (
    <div className="aizen-public-site aizen-about-page">
      <a className="skip-link" href="#public-main">
        {t('nav.skipToContent')}
      </a>

      <PublicHeader active="about" />

      <main id="public-main">
        <section className="aizen-about-hero">
          <div className="aizen-about-hero-copy">
            <span className="aizen-section-label">{t('public.nav.about')}</span>
            <h1>{text(content.aboutTitle, content.aboutTitleKa)}</h1>
            <p>{text(content.aboutDescription, content.aboutDescriptionKa)}</p>
          </div>
          <div className="aizen-about-hero-mark" aria-hidden="true">
            <span className="aizen-brand-mark large">
              <img src={siteAssets.cottonFlower} alt="" />
            </span>
            <strong>{brandName}</strong>
            <small>{descriptor}</small>
          </div>
        </section>

        <section className="aizen-about-pillars">
          {pillars.map((pillar, index) => (
            <article key={pillar.id} className={`pillar-${pillar.id}`}>
              <div className="aizen-about-pillar-icon">
                <SiteIcon name={pillar.icon} size={24} />
              </div>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h2>{pillar.title}</h2>
              <p>{pillar.body}</p>
            </article>
          ))}
        </section>

        <section className="aizen-about-team-section">
          <div className="aizen-team-heading">
            <div>
              <span className="aizen-section-label">{t('public.ourTeam')}</span>
              <h2>{text(content.teamTitle, content.teamTitleKa)}</h2>
            </div>
            <p>{text(content.teamDescription, content.teamDescriptionKa)}</p>
          </div>

          {team.length > 0 ? (
            <div className="aizen-team-grid">
              {team.map((member) => {
                const name = text(member.name, member.nameKa)
                return (
                  <article key={member.id} className="aizen-team-card">
                    <div className="aizen-team-photo">
                      {member.photo ? (
                        <img
                          src={member.photo}
                          alt={name}
                          style={{ objectPosition: member.photoFocus || 'center' }}
                        />
                      ) : (
                        <span>{initials(name)}</span>
                      )}
                    </div>
                    <div className="aizen-team-card-body">
                      <h3>{name}</h3>
                      <strong>{text(member.role, member.roleKa)}</strong>
                      <p>{text(member.bio, member.bioKa)}</p>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="aizen-team-placeholder">
              <span className="aizen-brand-mark">
                <img src={siteAssets.cottonFlower} alt="" aria-hidden="true" />
              </span>
              <p>{t('public.teamEmpty')}</p>
            </div>
          )}
        </section>

        <section className="aizen-cta-section aizen-about-cta">
          <div>
            <span>{t('public.readyToStart')}</span>
            <h2>{t('public.cta.about')}</h2>
          </div>
          <div className="aizen-cta-actions">
            <button
              type="button"
              className="aizen-btn aizen-btn--primary aizen-btn--lg"
              onClick={openPlatform}
            >
              {t('public.openRiskManagement')}
            </button>
            <button
              type="button"
              className="aizen-btn aizen-btn--secondary aizen-btn--lg"
              onClick={() => {
                navigate('/')
              }}
            >
              {t('public.nav.home')}
            </button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
