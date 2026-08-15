import { useEffect, useState } from 'react'
import { useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { siteAssets } from './site-assets.ts'
import { SiteIcon, type SiteIconName } from './site-icons.tsx'

/*
 * Hero product carousel.
 *
 * Auto-advances every three seconds, pauses on hover and on keyboard focus so
 * a reader is never moved off the slide they are on, and answers to the arrow
 * keys. Under `prefers-reduced-motion` it does not advance on its own at all —
 * the arrows and dots still work.
 */

interface Slide {
  id: string
  icon: SiteIconName
  labelKey: TranslationKey
  titleKey: TranslationKey
  bodyKey: TranslationKey
  image: string
}

const slides: Slide[] = [
  {
    id: 'dashboard',
    icon: 'dashboard',
    labelKey: 'public.carousel.dashboard.label',
    titleKey: 'public.carousel.dashboard.title',
    bodyKey: 'public.carousel.dashboard.body',
    image: siteAssets.heroDashboard,
  },
  {
    id: 'register',
    icon: 'register',
    labelKey: 'public.carousel.register.label',
    titleKey: 'public.carousel.register.title',
    bodyKey: 'public.carousel.register.body',
    image: siteAssets.heroRegister,
  },
  {
    id: 'reports',
    icon: 'report',
    labelKey: 'public.carousel.reports.label',
    titleKey: 'public.carousel.reports.title',
    bodyKey: 'public.carousel.reports.body',
    image: siteAssets.heroReports,
  },
]

export function HeroCarousel() {
  const { t } = useTranslation()
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const timer = window.setTimeout(() => {
      setActive((index) => (index + 1) % slides.length)
    }, 3000)
    return () => {
      window.clearTimeout(timer)
    }
  }, [active, paused])

  const go = (index: number) => {
    setActive((index + slides.length) % slides.length)
  }

  return (
    <div
      className="aizen-hero-visual aizen-product-carousel"
      aria-label={t('public.carousel.aria')}
      onMouseEnter={() => {
        setPaused(true)
      }}
      onMouseLeave={() => {
        setPaused(false)
      }}
      onFocusCapture={() => {
        setPaused(true)
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') go(active - 1)
        if (event.key === 'ArrowRight') go(active + 1)
      }}
    >
      <div className="aizen-browser-chrome" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>AIZEN · Risk Management</span>
      </div>

      <div className="aizen-carousel-viewport" aria-live="polite">
        {slides.map((slide, index) => (
          <figure
            key={slide.id}
            className={`aizen-carousel-slide ${index === active ? 'active' : ''}`}
            aria-hidden={index !== active}
          >
            <img
              src={slide.image}
              alt={`${t(slide.labelKey)}: ${t(slide.titleKey)}`}
              loading={index === 0 ? 'eager' : 'lazy'}
            />
            <figcaption>
              <span className="aizen-carousel-icon">
                <SiteIcon name={slide.icon} size={17} />
              </span>
              <div>
                <small>{t(slide.labelKey)}</small>
                <strong>{t(slide.titleKey)}</strong>
                <p>{t(slide.bodyKey)}</p>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>

      <button
        type="button"
        className="aizen-carousel-arrow previous"
        aria-label={t('public.carousel.previous')}
        onClick={() => {
          go(active - 1)
        }}
      >
        <SiteIcon name="chevron" size={18} />
      </button>
      <button
        type="button"
        className="aizen-carousel-arrow next"
        aria-label={t('public.carousel.next')}
        onClick={() => {
          go(active + 1)
        }}
      >
        <SiteIcon name="chevron" size={18} />
      </button>

      <div className="aizen-carousel-footer">
        <div className="aizen-carousel-dots" role="tablist" aria-label={t('public.carousel.slides')}>
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              className={index === active ? 'active' : ''}
              aria-selected={index === active}
              aria-label={t(slide.labelKey)}
              onClick={() => {
                go(index)
              }}
            >
              <span />
            </button>
          ))}
        </div>
        <span className="aizen-carousel-counter">
          {String(active + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
        </span>
      </div>
    </div>
  )
}
