import { Link } from 'react-router-dom'
import { COLUMN_SORT_FIELD, type ColumnDefinition } from '../../domain/register/columns.ts'
import type { RegisterIndex } from '../../domain/register/index.ts'
import type {
  RatingMatrix,
  RegisterViewMode,
  Risk,
  SortState,
} from '../../domain/types/index.ts'
import { useTranslation } from '../../i18n/index.ts'
import { RatingChip } from './rating-chip.tsx'

/*
 * Register table (ARCHITECTURE.md §8.2).
 *
 * Compact is a condensed management list. Detailed adds the structured
 * description and the full-size rating chips.
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
}

function CellValue({
  columnId,
  risk,
  index,
  matrix,
  viewMode,
}: {
  columnId: string
  risk: Risk
  index: RegisterIndex
  matrix: RatingMatrix
  viewMode: RegisterViewMode
}) {
  const { t } = useTranslation()
  const chipVariant = viewMode === 'detailed' ? 'detailed' : 'compact'

  switch (columnId) {
    case 'ref':
      return <Link to={`/app/risks/${risk.id}`}>{risk.ref}</Link>
    case 'title':
      return (
        <>
          <Link to={`/app/risks/${risk.id}`} className="register-table__title">
            {risk.title}
          </Link>
          {viewMode === 'detailed' ? (
            <dl className="register-table__description">
              <div>
                <dt>{t('risk.cause')}</dt>
                <dd>{risk.cause}</dd>
              </div>
              <div>
                <dt>{t('risk.event')}</dt>
                <dd>{risk.event}</dd>
              </div>
              <div>
                <dt>{t('risk.consequence')}</dt>
                <dd>{risk.consequence}</dd>
              </div>
            </dl>
          ) : null}
        </>
      )
    case 'category':
      return <>{index.categoryLabel.get(risk.categoryId) ?? '—'}</>
    case 'businessUnit':
      return (
        <span title={index.businessUnitPath.get(risk.businessUnitId) ?? ''}>
          {index.businessUnitLabel.get(risk.businessUnitId) ?? '—'}
        </span>
      )
    case 'riskOwner':
      return <>{index.userName.get(risk.riskOwnerId) ?? '—'}</>
    case 'inherent':
      return <RatingChip score={risk.inherent} matrix={matrix} variant={chipVariant} label={t('register.column.inherent')} />
    case 'residual':
      return <RatingChip score={risk.residual} matrix={matrix} variant={chipVariant} label={t('register.column.residual')} />
    case 'target':
      return <RatingChip score={risk.target} matrix={matrix} variant={chipVariant} label={t('register.column.target')} />
    case 'status':
      return <>{risk.status}</>
    case 'outlook':
      return <>{risk.outlook}</>
    case 'targetDate':
      return <>{risk.targetDate}</>
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
    <div className="scroll-x">
      <table className={`register-table register-table--${props.viewMode}`}>
        <thead>
          <tr>
            {shown.map((column) => {
              const sortField = COLUMN_SORT_FIELD[column.id]
              const isSorted = sortField !== undefined && props.sort.field === sortField
              const label = column.customLabel ?? t(column.labelKey)

              if (!column.sortable || sortField === undefined) {
                return <th key={column.id} scope="col">{label}</th>
              }

              return (
                <th
                  key={column.id}
                  scope="col"
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
          {props.risks.map((risk) => (
            <tr key={risk.id}>
              {shown.map((column) => (
                <td key={column.id} data-column={column.id}>
                  <CellValue
                    columnId={column.id}
                    risk={risk}
                    index={props.index}
                    matrix={props.matrix}
                    viewMode={props.viewMode}
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
