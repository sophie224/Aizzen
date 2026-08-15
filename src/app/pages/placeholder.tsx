import { Link } from 'react-router-dom'
import { useTranslation, type TranslationKey } from '../../i18n/index.ts'

/*
 * Shell-milestone placeholders.
 *
 * M5 delivers the frame: routing, guards, layout, branding and i18n. Each
 * route renders a titled region so the frame is verifiable, and names the
 * milestone that fills it in (PLAN.md).
 */

export interface PlaceholderPageProps {
  titleKey: TranslationKey
  milestone: string
  description: string
}

export function PlaceholderPage({ titleKey, milestone, description }: PlaceholderPageProps) {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">{t(titleKey)}</h1>
      <div className="panel panel--notice">
        <p>{description}</p>
        <p className="panel__meta">
          {t('state.comingSoon')} Scheduled for milestone {milestone}.
        </p>
      </div>
    </section>
  )
}

export function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">{t('state.notFound.title')}</h1>
      <div className="panel">
        <p>{t('state.notFound.body')}</p>
        <Link to="/app/dashboard">{t('state.backToDashboard')}</Link>
      </div>
    </section>
  )
}
