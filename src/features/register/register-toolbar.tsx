import { useId } from 'react'
import { flattenTree } from '../../domain/business-units/index.ts'
import { level1Groups } from '../../domain/register/index.ts'
import type { ColumnDefinition } from '../../domain/register/columns.ts'
import { RATING_LABELS, RISK_STATUSES, OUTLOOKS } from '../../domain/types/enums.ts'
import type {
  BusinessUnit,
  Category,
  Language,
  RegisterViewMode,
  RiskFilters,
} from '../../domain/types/index.ts'
import { pickNamed, useTranslation } from '../../i18n/index.ts'

/*
 * Register toolbar: search, filters, view mode and column visibility
 * (ARCHITECTURE.md §8.2).
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
  language: Language
}

export function RegisterToolbar(props: RegisterToolbarProps) {
  const { t } = useTranslation()
  const searchId = useId()
  const groups = level1Groups(props.categories)
  const units = flattenTree(props.businessUnits, { includeInactive: false })

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

  return (
    <div className="register-toolbar">
      <div className="register-toolbar__search">
        <label htmlFor={searchId}>{t('register.search.label')}</label>
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

      <fieldset className="register-toolbar__filters">
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
                {`${' '.repeat(depth * 2)}${pickNamed(unit, 'name', props.language)}`}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{t('register.filter.residualRating')}</span>
          <select
            value={props.filters.residualRating ?? ''}
            onChange={(event) => {
              setFilter('residualRating', event.target.value)
            }}
          >
            <option value="">{t('register.filter.all')}</option>
            {RATING_LABELS.map((rating) => (
              <option key={rating} value={rating}>
                {rating}
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
      </fieldset>

      <fieldset className="register-toolbar__view">
        <legend>{t('register.view.legend')}</legend>
        {(['compact', 'detailed'] as const).map((mode) => (
          <label key={mode}>
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

      <details className="register-toolbar__columns">
        <summary>{t('register.columns.label')}</summary>
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
      </details>
    </div>
  )
}
