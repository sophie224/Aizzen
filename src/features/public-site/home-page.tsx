import { useEffect, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../../data/app-data-context.ts'
import { canAccess } from '../../domain/permissions/index.ts'
import type { SiteSolution } from '../../domain/types/index.ts'
import { pickLanguage, useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { HeroCarousel } from './hero-carousel.tsx'
import { PublicFooter } from './public-footer.tsx'
import { PublicHeader } from './public-header.tsx'
import { scrollToSection, scrollToTop } from './scrolling.ts'
import { SiteIcon, type SiteIconName } from './site-icons.tsx'
import { SiteVideo } from './site-video.tsx'
import './public-site.css'

/*
 * Public home page (ARCHITECTURE.md §8.5).
 *
 * Every headline, description, solution card and call to action is read from
 * `AppState.siteContent` — the same record Website Administration edits — so
 * nothing here is hard-coded marketing copy. Only chrome (navigation labels,
 * the lifecycle strip, status pills) comes from the dictionary.
 */

const lifecycle: Array<{ step: string; title: TranslationKey; body: TranslationKey }> = [
  { step: '01', title: 'public.lifecycle.identify.title', body: 'public.lifecycle.identify.body' },
  { step: '02', title: 'public.lifecycle.assess.title', body: 'public.lifecycle.assess.body' },
  { step: '03', title: 'public.lifecycle.respond.title', body: 'public.lifecycle.respond.body' },
  { step: '04', title: 'public.lifecycle.monitor.title', body: 'public.lifecycle.monitor.body' },
]

/** Solution cards are keyed by id, matching the seeded catalogue. */
function solutionIcon(solution: SiteSolution): SiteIconName {
  if (solution.id === 'solution_risk') return 'shield'
  if (solution.id === 'solution_compliance') return 'check'
  return 'report'
}

export function PublicHomePage() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const { user, context } = useCurrentUser()
  const navigate = useNavigate()

  useEffect(() => {
    scrollToTop(false)
  }, [])

  /*
   * The loading branch keeps the same element order as the loaded page —
   * skip link, header, main, footer — so React reconciles rather than
   * unmounting and remounting the header when AppState arrives.
   */
  const content = state?.siteContent
  if (!content) {
    return (
      <div className="aizen-public-site">
        <a className="skip-link" href="#public-main">
          {t('nav.skipToContent')}
        </a>
        <PublicHeader active="home" />
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
    navigate(canOpenPlatform ? '/dashboard' : '/login')
  }

  const solutions = [...content.solutions].sort((a, b) => a.order - b.order)
  const videoHighlights =
    language === 'ka' && content.videoHighlightsKa.length > 0
      ? content.videoHighlightsKa
      : content.videoHighlights

  return (
    <div className="aizen-public-site">
      <a className="skip-link" href="#public-main">
        {t('nav.skipToContent')}
      </a>

      <PublicHeader active="home" />

      <main id="public-main">
        <section className="aizen-hero" id="home">
          <div className="aizen-hero-copy">
            <div className="aizen-availability">
              <span aria-hidden="true" />
              <b>{t('public.availableNow')}</b>
              <em>Risk Management</em>
            </div>
            <p className="aizen-kicker">{text(content.heroEyebrow, content.heroEyebrowKa)}</p>
            <h1>{text(content.heroTitle, content.heroTitleKa)}</h1>
            <p className="aizen-hero-description">
              {text(content.heroDescription, content.heroDescriptionKa)}
            </p>

            <div className="aizen-hero-actions">
              <button
                type="button"
                className="aizen-btn aizen-btn--primary aizen-btn--lg"
                onClick={openPlatform}
              >
                {text(content.heroPrimaryCta, content.heroPrimaryCtaKa)}
              </button>
              <button
                type="button"
                className="aizen-btn aizen-btn--secondary aizen-btn--lg"
                onClick={() => {
                  scrollToSection('demo')
                }}
              >
                <SiteIcon name="play" size={16} />
                {text(content.heroSecondaryCta, content.heroSecondaryCtaKa)}
              </button>
            </div>

            <div className="aizen-proof-row">
              <span>
                <SiteIcon name="shield" size={17} />
                {t('public.proof.ownership')}
              </span>
              <span>
                <SiteIcon name="check" size={17} />
                {t('public.proof.matrix')}
              </span>
              <span>
                <SiteIcon name="report" size={17} />
                {t('public.proof.reporting')}
              </span>
            </div>
          </div>

          <HeroCarousel />
        </section>

        <section className="aizen-lifecycle" aria-label={t('public.lifecycle.aria')}>
          {lifecycle.map((item) => (
            <article key={item.step}>
              <b>{item.step}</b>
              <div>
                <strong>{t(item.title)}</strong>
                <p>{t(item.body)}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="aizen-section aizen-solutions-section" id="solutions">
          <div className="aizen-section-heading">
            <span>{t('public.nav.solutions')}</span>
            <h2>{text(content.solutionsTitle, content.solutionsTitleKa)}</h2>
            <p>{text(content.solutionsDescription, content.solutionsDescriptionKa)}</p>
          </div>

          <div className="aizen-solution-grid">
            {solutions.map((solution, index) => {
              const available = solution.status === 'available'
              const features =
                language === 'ka' && solution.featuresKa.length > 0
                  ? solution.featuresKa
                  : solution.features

              return (
                <article
                  key={solution.id}
                  className={`aizen-solution-card ${available ? 'available' : 'coming'}`}
                  style={{ '--solution-accent': solution.accentColor } as CSSProperties}
                >
                  <div className="aizen-solution-top">
                    <span className="aizen-solution-number">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className={`aizen-solution-status ${available ? 'available' : ''}`}>
                      {available ? t('public.availableNow') : t('public.comingSoon')}
                    </span>
                  </div>

                  <span className="aizen-solution-icon">
                    <SiteIcon name={solutionIcon(solution)} size={26} />
                  </span>
                  <h3>{text(solution.name, solution.nameKa)}</h3>
                  <p>{text(solution.description, solution.descriptionKa)}</p>

                  <ul>
                    {features.map((feature) => (
                      <li key={feature}>
                        <SiteIcon name="check" size={15} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {available ? (
                    <button type="button" className="aizen-solution-link" onClick={openPlatform}>
                      {user ? t('public.openRiskManagement') : t('public.signInToPlatform')}
                      <SiteIcon name="chevron" size={16} />
                    </button>
                  ) : (
                    <div className="aizen-coming-line">
                      <span aria-hidden="true" />
                      {t('public.comingSoon')}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </section>

        <section className="aizen-section aizen-demo-section" id="demo">
          <div className="aizen-demo-copy">
            <span className="aizen-section-label">{t('public.nav.demo')}</span>
            <h2>{text(content.videoTitle, content.videoTitleKa)}</h2>
            <p>{text(content.videoDescription, content.videoDescriptionKa)}</p>

            <div className="aizen-demo-list">
              {videoHighlights.map((item, index) => (
                <div key={item}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>

            <button type="button" className="aizen-btn aizen-btn--light" onClick={openPlatform}>
              {t('public.accessRiskModule')}
            </button>
          </div>

          <SiteVideo
            content={content}
            title={text(content.videoTitle, content.videoTitleKa) || t('public.demoTitle')}
          />
        </section>

        <section className="aizen-about-teaser">
          <div>
            <span className="aizen-section-label">{t('public.nav.about')}</span>
            <h2>{t('public.aboutTeaser')}</h2>
            <p>{text(content.aboutDescription, content.aboutDescriptionKa)}</p>
          </div>
          <button
            type="button"
            className="aizen-btn aizen-btn--secondary aizen-btn--lg"
            onClick={() => {
              navigate('/about')
            }}
          >
            {t('public.discoverAizen')}
          </button>
        </section>

        <section className="aizen-cta-section">
          <div>
            <span>{t('public.readyToStart')}</span>
            <h2>{t('public.cta.home')}</h2>
          </div>
          <div className="aizen-cta-actions">
            <button
              type="button"
              className="aizen-btn aizen-btn--primary aizen-btn--lg"
              onClick={openPlatform}
            >
              {t('public.openRiskManagement')}
            </button>
            {content.contactEmail ? (
              <a
                href={`mailto:${content.contactEmail}`}
                className="aizen-btn aizen-btn--secondary aizen-btn--lg"
              >
                {content.contactEmail}
              </a>
            ) : null}
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
