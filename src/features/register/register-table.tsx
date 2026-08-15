import { Link } from 'react-router-dom'
import { displayActionStatus } from '../../domain/actions/index.ts'
import { COLUMN_SORT_FIELD, type ColumnDefinition } from '../../domain/register/columns.ts'
import type { RegisterIndex } from '../../domain/register/index.ts'
import { isRiskOverdue } from '../../domain/risks/index.ts'
import { historicalTrend } from '../../domain/trend/index.ts'
import type {
  Outlook,
  RatingMatrix,
  RegisterViewMode,
  Risk,
  SortState,
  Trend,
} from '../../domain/types/index.ts'
import { useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { IconTrend } from '../../ui/icons.tsx'
import { initialsOf } from '../../ui/initials.ts'
import { StatusPill } from '../../ui/status-pill.tsx'
import { RatingChip } from './rating-chip.tsx'

/*
 * Register table (ARCHITECTURE.md §8.2).
 *
 * Compact is a condensed management list. Detailed adds the structured
 * description under the risk name and reading-size rating chips. The header row
 * is sticky so horizontal and vertical scrolling stay oriented.
 */

export interface RegisterTableProps {
  risks: readonly Risk[]
  columns: readonly ColumnDefinition[]
  visibleColumns: readonly string[]
  viewMode: RegisterViewMode
  sort: SortState
  onSortChange: (field: SortState['field']) => void
  index: RegisterIndex
  matrix: RatingMatrix
  /** ISO date used for the derived Overdue rule; passed in, never read here. */
  today: string
}

/** Trend and outlook share one glyph vocabulary: up is worse, down is better. */
const TREND_DIRECTION: Record<Trend, 'up' | 'down' | 'flat'> = {
  New: 'flat',
  Improving: 'down',
  Worsening: 'up',
  Stable: 'flat',
}

const OUTLOOK_DIRECTION: Record<Outlook, 'up' | 'down' | 'flat'> = {
  Increasing: 'up',
  Stable: 'flat',
  Decreasing: 'down',
}

function OwnerCell({ name }: { name: string }) {
  return (
    <span className="register-table__owner">
      <span className="avatar" aria-hidden="true">
        {initialsOf(name)}
      </span>
      <span className="register-table__owner-name">{name}</span>
    </span>
  )
}

function ControlsCell({ risk }: { risk: Risk }) {
  const { t } = useTranslation()

  if (risk.controls.length === 0) {
    return <span className="register-table__muted">{t('register.cell.noControls')}</span>
  }

  return (
    <ul className="register-table__bullets">
      {risk.controls.map((control) => (
        <li key={control.id} title={control.title}>
          {control.title}
        </li>
      ))}
    </ul>
  )
}

function ActionPlanCell({ risk, today }: { risk: Risk; today: string }) {
  const { t } = useTranslation()

  if (risk.actions.length === 0) {
    return <span className="register-table__muted">{t('register.cell.noActions')}</span>
  }

  return (
    <ul className="register-table__actions">
      {risk.actions.map((action) => (
        <li key={action.id}>
          <StatusPill status={displayActionStatus(action, today)} />
          <span className="register-table__action-title" title={action.title}>
            {action.title}
          </span>
        </li>
      ))}
    </ul>
  )
}

function CellValue({
  columnId,
  risk,
  rowNumber,
  index,
  matrix,
  viewMode,
  today,
}: {
  columnId: string
  risk: Risk
  rowNumber: number
  index: RegisterIndex
  matrix: RatingMatrix
  viewMode: RegisterViewMode
  today: string
}) {
  const { t } = useTranslation()
  const chipVariant = viewMode === 'detailed' ? 'detailed' : 'compact'

  switch (columnId) {
    case 'n':
      return <span className="register-table__n">{rowNumber}</span>
    case 'ref':
      return <Link to={`/app/risks/${risk.id}`}>{risk.ref}</Link>
    case 'title':
      return (
        <>
          <Link to={`/app/risks/${risk.id}`} className="register-table__title">
            {risk.title}
          </Link>
          <span className="register-table__subtitle">
            <span className="register-table__code">{risk.ref}</span>
            <span aria-hidden="true"> · </span>
            {index.categoryLabel.get(risk.categoryId) ?? '—'}
          </span>
          {viewMode === 'detailed' ? (
            <dl className="register-table__description">
              {(['cause', 'event', 'consequence'] as const).map((field) => (
                <div key={field}>
                  <dt>{t(`risk.${field}` as TranslationKey)}</dt>
                  <dd>{risk[field]}</dd>

                </div>
              ))}
            </dl>
          ) : null}
        </>
      )
    case 'description': {
      /*
       * The manually entered description only (CR-002). There is deliberately
       * no fallback to Event or Cause: an empty field says "not written yet",
       * and derived text here would misrepresent the record.
       */
      const description = risk.description.trim()
      if (description.length === 0) {
        return <span className="register-table__muted">{t('register.cell.noDescription')}</span>
      }
      // Clamped to 2 lines compact / 4 detailed; the title carries the rest.
      return (
        <span className="register-table__clamp" title={description}>
          {description}
        </span>
      )
    }
    case 'category':
      return <>{index.categoryLabel.get(risk.categoryId) ?? '—'}</>
    case 'businessUnit':
      return (
        <span title={index.businessUnitPath.get(risk.businessUnitId) ?? ''}>
          {index.businessUnitLabel.get(risk.businessUnitId) ?? '—'}
        </span>
      )
    case 'riskOwner':
      return <OwnerCell name={index.userName.get(risk.riskOwnerId) ?? '—'} />
    case 'inherent':
      return <RatingChip score={risk.inherent} matrix={matrix} variant={chipVariant} label={t('register.column.inherent')} />
    case 'residual':
      return <RatingChip score={risk.residual} matrix={matrix} variant={chipVariant} label={t('register.column.residual')} />
    case 'target':
      return <RatingChip score={risk.target} matrix={matrix} variant={chipVariant} label={t('register.column.target')} />
    case 'controls':
      return <ControlsCell risk={risk} />
    case 'response':
      return <>{risk.responseType}</>
    case 'actionPlan':
      return <ActionPlanCell risk={risk} today={today} />
    case 'status':
      return <StatusPill status={risk.status} />
    case 'trend': {
      // Computed from history — distinct from the manual outlook below.
      const trend = historicalTrend(risk.history)
      return (
        <span className="register-table__signal">
          <IconTrend direction={TREND_DIRECTION[trend]} size={14} />
          {t(`trend.${trend}` as TranslationKey)}
        </span>
      )
    }
    case 'outlook':
      return (
        <span className="register-table__signal">
          <IconTrend direction={OUTLOOK_DIRECTION[risk.outlook]} size={14} />
          {risk.outlook}
        </span>
      )
    case 'targetDate':
      return (
        <>
          <span className="register-table__date">{risk.targetDate}</span>
          {isRiskOverdue(risk, today) ? (
            <span className="register-table__overdue">{t('view.overdue')}</span>
          ) : null}
        </>
      )
    default: {
      // Custom attribute value, keyed by attribute ID.
      const value = risk.custom[columnId]
      return <>{value === undefined || value === '' ? '—' : String(value)}</>
    }
  }
}

export function RegisterTable(props: RegisterTableProps) {
  const { t } = useTranslation()
  const shown = props.columns.filter((column) => props.visibleColumns.includes(column.id))

  return (
    <div className="register-table-scroll scroll-x">
      <table className={`register-table register-table--${props.viewMode}`}>
        <thead>
          <tr>
            {shown.map((column) => {
              const sortField = COLUMN_SORT_FIELD[column.id]
              const isSorted = sortField !== undefined && props.sort.field === sortField
              const label = column.customLabel ?? t(column.labelKey)

              if (!column.sortable || sortField === undefined) {
                return (
                  <th key={column.id} scope="col" data-column={column.id}>
                    {label}
                  </th>
                )
              }

              return (
                <th
                  key={column.id}
                  scope="col"
                  data-column={column.id}
                  aria-sort={isSorted ? (props.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    className="register-table__sort"
                    onClick={() => {
                      props.onSortChange(sortField)
                    }}
                  >
                    {label}
                    <span aria-hidden="true" className="register-table__sort-mark">
                      {isSorted ? (props.sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {props.risks.map((risk, rowIndex) => (
            <tr key={risk.id}>
              {shown.map((column) => (
                <td key={column.id} data-column={column.id}>
                  <CellValue
                    columnId={column.id}
                    risk={risk}
                    rowNumber={rowIndex + 1}
                    index={props.index}
                    matrix={props.matrix}
                    viewMode={props.viewMode}
                    today={props.today}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
