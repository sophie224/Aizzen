import { useTranslation } from '../../i18n/index.ts'

/*
 * The states every register grid must implement (Design Uplift v2 §9.3).
 *
 * Loading, empty, filtered-empty and error are DIFFERENT states with different
 * copy — conflating empty with filtered-empty is the failure the brief calls
 * out by name. Each is built from the platform's own primitives, so this file
 * adds behaviour rather than a second visual language.
 */

/**
 * Skeleton rows matching the real row height and column count, so nothing
 * shifts when data arrives (§9.3, §12.2).
 */
export function TableSkeleton({ columns, rows = 6 }: { columns: number; rows?: number }) {
  const { t } = useTranslation()

  return (
    <div className="control-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{t('state.loading')}</span>
      {Array.from({ length: rows }, (_, row) => (
        <div className="control-skeleton__row" key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <span className="skeleton control-skeleton__cell" key={column} />
          ))}
        </div>
      ))}
    </div>
  )
}
