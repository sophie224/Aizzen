import { useTranslation } from '../../i18n/index.ts'

/**
 * Shown while AppState loads.
 *
 * Guards render this rather than deciding early — a slow load must never be
 * mistaken for a permission failure.
 */
export function LoadingState() {
  const { t } = useTranslation()

  return (
    <p role="status" aria-live="polite">
      {t('state.loading')}
    </p>
  )
}
