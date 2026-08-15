import { Link } from 'react-router-dom'
import { useTranslation } from '../../i18n/index.ts'

/**
 * Shown when a signed-in user reaches a route they may not view.
 *
 * Deliberately generic: it never reveals whether the resource exists, which
 * is the same discretion the sign-in flow applies (ARCHITECTURE.md §6.2).
 */
export function AccessDenied() {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="access-denied-title" role="alert">
      <h1 id="access-denied-title">{t('state.accessDenied.title')}</h1>
      <div className="panel panel--denied">
        <p>{t('state.accessDenied.body')}</p>
        <Link to="/app/dashboard">{t('state.backToDashboard')}</Link>
      </div>
    </section>
  )
}
