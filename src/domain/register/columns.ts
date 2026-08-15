import type { CustomAttribute } from '../types/index.ts'
import type { TranslationKeyish } from './column-labels.ts'

/*
 * Register column definitions (ARCHITECTURE.md §8.2).
 *
 * An active custom attribute with `showInRegister = true` joins the selectable
 * columns automatically — administrators extend the Register without a code
 * change (ARCHITECTURE.md §3.7).
 */

export interface ColumnDefinition {
  /** Stable key. For custom attributes this is the attribute ID. */
  id: string
  labelKey: TranslationKeyish
  /** Custom-attribute columns carry their label directly, not via the dictionary. */
  customLabel?: string
  sortable: boolean
  /** Shown by default when a user has no saved column selection. */
  defaultVisible: boolean
}

export const BASE_COLUMNS: readonly ColumnDefinition[] = [
  { id: 'ref', labelKey: 'register.column.ref', sortable: true, defaultVisible: true },
  { id: 'title', labelKey: 'register.column.title', sortable: true, defaultVisible: true },
  { id: 'category', labelKey: 'register.column.category', sortable: false, defaultVisible: true },
  { id: 'businessUnit', labelKey: 'register.column.businessUnit', sortable: false, defaultVisible: true },
  { id: 'riskOwner', labelKey: 'register.column.riskOwner', sortable: true, defaultVisible: true },
  { id: 'inherent', labelKey: 'register.column.inherent', sortable: false, defaultVisible: false },
  { id: 'residual', labelKey: 'register.column.residual', sortable: true, defaultVisible: true },
  { id: 'target', labelKey: 'register.column.target', sortable: false, defaultVisible: false },
  { id: 'status', labelKey: 'register.column.status', sortable: false, defaultVisible: true },
  { id: 'outlook', labelKey: 'register.column.outlook', sortable: false, defaultVisible: false },
  { id: 'targetDate', labelKey: 'register.column.targetDate', sortable: true, defaultVisible: true },
]

export const DEFAULT_VISIBLE_COLUMNS: readonly string[] = BASE_COLUMNS.filter(
  (column) => column.defaultVisible,
).map((column) => column.id)

/** Maps the sortable column keys onto the sort fields the query understands. */
export const COLUMN_SORT_FIELD: Record<string, 'ref' | 'title' | 'owner' | 'residual' | 'targetDate'> = {
  ref: 'ref',
  title: 'title',
  riskOwner: 'owner',
  residual: 'residual',
  targetDate: 'targetDate',
}

/**
 * Base columns plus any active custom attribute flagged for the Register.
 *
 * Inactive attributes drop out of the list without their stored values being
 * deleted — reactivating restores the column (ARCHITECTURE.md §3.7).
 */
export function selectableColumns(
  customAttributes: readonly CustomAttribute[],
  language: 'en' | 'ka' = 'en',
): ColumnDefinition[] {
  const custom = customAttributes
    .filter((attribute) => attribute.active && attribute.showInRegister)
    .map<ColumnDefinition>((attribute) => ({
      id: attribute.id,
      labelKey: 'register.column.custom',
      customLabel:
        language === 'ka' && attribute.labelKa.trim().length > 0 ? attribute.labelKa : attribute.labelEn,
      sortable: false,
      defaultVisible: false,
    }))

  return [...BASE_COLUMNS, ...custom]
}

/** Drops any stored column that no longer exists, preserving the chosen order. */
export function reconcileVisibleColumns(
  visible: readonly string[],
  available: readonly ColumnDefinition[],
): string[] {
  const ids = new Set(available.map((column) => column.id))
  const kept = visible.filter((id) => ids.has(id))
  return kept.length > 0 ? kept : [...DEFAULT_VISIBLE_COLUMNS]
}
