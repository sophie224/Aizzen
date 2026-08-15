import { useEffect, useId, useRef, useState } from 'react'
import { flattenTree } from '../../domain/business-units/index.ts'
import { level1Groups } from '../../domain/register/index.ts'
import type { ColumnDefinition } from '../../domain/register/columns.ts'
import { ratingLevels, ratingName, scaleName } from '../../domain/risk-engine/index.ts'
import { RISK_STATUSES, OUTLOOKS } from '../../domain/types/enums.ts'
import type {
  BusinessUnit,
  Category,
  Language,
  RatingMatrix,
  RegisterViewMode,
  RiskFilters,
} from '../../domain/types/index.ts'
import { pickNamed, useTranslation } from '../../i18n/index.ts'
import { IconColumns, IconFilter, IconSearch } from '../../ui/icons.tsx'

/*
 * Register toolbar (ARCHITECTURE.md §8.2).
 *
 * One row: global search, a Filters button, a Columns button and the
 * Compact / Detailed switch. Filters and Columns open as dismissible popovers
 * rather than occupying the page — the target design keeps the table itself
 * above the fold.
 *
 * The view switch stays a radio group: it is a single-choice control, and
 * radios give it keyboard and screen-reader semantics for free.
 */

export interface RegisterToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  filters: RiskFilters
  onFiltersChange: (filters: RiskFilters) => void
  viewMode: RegisterViewMode
  onViewModeChange: (mode: RegisterViewMode) => void
  columns: readonly ColumnDefinition[]
  visibleColumns: readonly string[]
  onVisibleColumnsChange: (columns: string[]) => void
  categories: readonly Category[]
  businessUnits: readonly BusinessUnit[]
  /** The configured matrix: rating filter options read their names from it. */
  matrix: RatingMatrix
  language: Language
}

/** Closes a popover on outside click or Escape, and returns focus to its trigger. */
function useDismiss(open: boolean, close: () => void) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      const container = containerRef.current
      if (container && event.target instanceof Node && !container.contains(event.target)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  return containerRef
}

export function RegisterToolbar(props: RegisterToolbarProps) {
  const { t } = useTranslation()
  const searchId = useId()
  const [openPanel, setOpenPanel] = useState<'filters' | 'columns' | null>(null)

  const containerRef = useDismiss(openPanel !== null, () => {
    setOpenPanel(null)
  })

  const groups = level1Groups(props.categories)
  const units = flattenTree(props.businessUnits, { includeInactive: false })
  const activeFilterCount = Object.values(props.filters).filter(
    (value) => value !== undefined && value !== '',
  ).length

  /** Writes one filter, removing the key entirely when cleared. */
  const setFilter = <K extends keyof RiskFilters>(key: K, value: string) => {
    const next: RiskFilters = { ...props.filters }
    if (value === '') delete next[key]
    else next[key] = value as RiskFilters[K]
    props.onFiltersChange(next)
  }

  const toggleColumn = (id: string) => {
    const next = props.visibleColumns.includes(id)
      ? props.visibleColumns.filter((column) => column !== id)
      : [...props.visibleColumns, id]
    // At least one column must remain selected.
    if (next.length > 0) props.onVisibleColumnsChange(next)
  }

  const toggle = (panel: 'filters' | 'columns') => {
    setOpenPanel((current) => (current === panel ? null : panel))
  }

  return (
    <div className="register-toolbar" ref={containerRef}>
      <div className="register-toolbar__search">
        <label htmlFor={searchId} className="visually-hidden">
          {t('register.search.label')}
        </label>
        <IconSearch className="register-toolbar__search-icon" />
        <input
          id={searchId}
          type="search"
          value={props.search}
          placeholder={t('register.search.placeholder')}
          onChange={(event) => {
            props.onSearchChange(event.target.value)
          }}
        />
      </div>

      <div className="register-toolbar__controls">
        <div className="register-toolbar__popover-host">
          <button
            type="button"
            className={openPanel === 'filters' ? 'btn is-open' : 'btn'}
            aria-expanded={openPanel === 'filters'}
            onClick={() => {
              toggle('filters')
            }}
          >
            <IconFilter />
            {t('register.filters.button')}
            {activeFilterCount > 0 ? (
              <span className="register-toolbar__count" aria-hidden="true">
                {activeFilterCount}
              </span>
            ) : null}
          </button>

          {openPanel === 'filters' ? (
            <div className="register-popover register-popover--filters">
              <fieldset className="register-filters">
                <legend>{t('register.filters.legend')}</legend>

                <label>
                  <span>{t('register.filter.category')}</span>
                  <select
                    value={props.filters.categoryLevel1 ?? ''}
                    onChange={(event) => {
                      setFilter('categoryLevel1', event.target.value)
                    }}
                  >
                    <option value="">{t('register.filter.all')}</option>
                    {groups.map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>{t('register.filter.businessUnit')}</span>
                  <select
                    value={props.filters.businessUnitId ?? ''}
                    onChange={(event) => {
                      setFilter('businessUnitId', event.target.value)
                    }}
                  >
                    <option value="">{t('register.filter.all')}</option>
                    {units.map(({ unit, depth }) => (
                      <option key={unit.id} value={unit.id}>
                        {`${' '.repeat(depth * 2)}${pickNamed(unit, 'name', props.language)}`}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>
                    {t('register.filter.residual')} {scaleName(props.matrix, props.language).toLowerCase()}
                  </span>
                  <select
                    value={props.filters.residualRating ?? ''}
                    onChange={(event) => {
                      setFilter('residualRating', event.target.value)
                    }}
                  >
                    <option value="">{t('register.filter.all')}</option>
                    {/* Filtering is keyed by the stable key; the label is configured. */}
                    {ratingLevels(props.matrix).map((level) => (
                      <option key={level.key} value={level.key}>
                        {ratingName(props.matrix, level.key, props.language)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>{t('register.filter.status')}</span>
                  <select
                    value={props.filters.status ?? ''}
                    onChange={(event) => {
                      setFilter('status', event.target.value)
                    }}
                  >
                    <option value="">{t('register.filter.all')}</option>
                    {RISK_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>{t('register.filter.outlook')}</span>
                  <select
                    value={props.filters.outlook ?? ''}
                    onChange={(event) => {
                      setFilter('outlook', event.target.value)
                    }}
                  >
                    <option value="">{t('register.filter.all')}</option>
                    {OUTLOOKS.map((outlook) => (
                      <option key={outlook} value={outlook}>
                        {outlook}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  className="btn btn--ghost register-filters__clear"
                  onClick={() => {
                    props.onFiltersChange({})
                  }}
                >
                  {t('register.filter.clear')}
                </button>
              </fieldset>
            </div>
          ) : null}
        </div>

        <div className="register-toolbar__popover-host">
          <button
            type="button"
            className={openPanel === 'columns' ? 'btn is-open' : 'btn'}
            aria-expanded={openPanel === 'columns'}
            onClick={() => {
              toggle('columns')
            }}
          >
            <IconColumns />
            {t('register.columns.label')}
          </button>

          {openPanel === 'columns' ? (
            <div className="register-popover register-popover--columns">
              <fieldset className="register-columns">
                <legend className="visually-hidden">{t('register.columns.label')}</legend>
                <ul>
                  {props.columns.map((column) => (
                    <li key={column.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={props.visibleColumns.includes(column.id)}
                          onChange={() => {
                            toggleColumn(column.id)
                          }}
                        />
                        <span>{column.customLabel ?? t(column.labelKey)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            </div>
          ) : null}
        </div>

        <fieldset className="register-toolbar__view segmented">
          <legend className="visually-hidden">{t('register.view.legend')}</legend>
          {(['compact', 'detailed'] as const).map((mode) => (
            <label key={mode} className={props.viewMode === mode ? 'is-active' : undefined}>
              <input
                type="radio"
                name="register-view-mode"
                value={mode}
                checked={props.viewMode === mode}
                onChange={() => {
                  props.onViewModeChange(mode)
                }}
              />
              <span>{t(mode === 'compact' ? 'register.view.compact' : 'register.view.detailed')}</span>
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  )
}
