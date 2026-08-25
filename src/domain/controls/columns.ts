import type { ControlConfig, ControlCustomColumn, ControlRegisterName } from '../types/index.ts'
import { pickLanguage } from '../localisation/index.ts'

/*
 * Grid columns for both registers (FR-CR-07, FR-CD-05).
 *
 * Label keys are a plain string union rather than the i18n dictionary type:
 * the domain may not depend on an outer layer. The i18n layer asserts every
 * key here has a translation.
 */

export const CONTROL_COLUMN_LABEL_KEYS = [
  'controls.column.ref',
  'controls.column.name',
  'controls.column.objective',
  'controls.column.businessUnit',
  'controls.column.owner',
  'controls.column.effectiveness',
  'controls.column.maturity',
  'controls.column.assurance',
  'controls.column.evidence',
  'controls.column.source',
  'controls.column.deficiencies',
  'deficiency.column.ref',
  'deficiency.column.control',
  'deficiency.column.businessUnit',
  'deficiency.column.description',
  'deficiency.column.classification',
  'deficiency.column.remediationOwner',
  'deficiency.column.remediation',
  'deficiency.column.targetDate',
] as const

export type ControlColumnLabelKey = (typeof CONTROL_COLUMN_LABEL_KEYS)[number]

// --- custom columns (FR-CR-11, FR-CD-06) -------------------------------------

export function activeCustomColumns(
  config: ControlConfig,
  register: ControlRegisterName,
): ControlCustomColumn[] {
  return config.customColumns.filter((column) => column.register === register && column.active)
}

/** Columns an administrator flagged for the risk-side linked-controls view. */
export function riskViewCustomColumns(config: ControlConfig): ControlCustomColumn[] {
  return activeCustomColumns(config, 'control').filter((column) => column.showInRiskView)
}

export interface ControlColumnDefinition {
  /** Stable id; for a custom column this is the column definition's id. */
  id: string
  labelKey: ControlColumnLabelKey | null
  /** Custom columns carry their label directly, not via the dictionary. */
  customLabel?: string
  sortable: boolean
}

/** Control Register columns, in default order (§5.2 field specification). */
export const CONTROL_BASE_COLUMNS: readonly ControlColumnDefinition[] = [
  { id: 'ref', labelKey: 'controls.column.ref', sortable: true },
  { id: 'name', labelKey: 'controls.column.name', sortable: true },
  { id: 'objective', labelKey: 'controls.column.objective', sortable: false },
  { id: 'businessUnit', labelKey: 'controls.column.businessUnit', sortable: true },
  { id: 'owner', labelKey: 'controls.column.owner', sortable: true },
  { id: 'effectiveness', labelKey: 'controls.column.effectiveness', sortable: true },
  { id: 'maturity', labelKey: 'controls.column.maturity', sortable: true },
  { id: 'assurance', labelKey: 'controls.column.assurance', sortable: true },
  { id: 'evidence', labelKey: 'controls.column.evidence', sortable: false },
  { id: 'deficiencies', labelKey: 'controls.column.deficiencies', sortable: false },
  { id: 'source', labelKey: 'controls.column.source', sortable: true },
]

/** Control Deficiency Register columns, in default order (§5.4). */
export const DEFICIENCY_BASE_COLUMNS: readonly ControlColumnDefinition[] = [
  { id: 'ref', labelKey: 'deficiency.column.ref', sortable: true },
  { id: 'control', labelKey: 'deficiency.column.control', sortable: true },
  { id: 'businessUnit', labelKey: 'deficiency.column.businessUnit', sortable: true },
  { id: 'description', labelKey: 'deficiency.column.description', sortable: false },
  { id: 'classification', labelKey: 'deficiency.column.classification', sortable: true },
  { id: 'remediationOwner', labelKey: 'deficiency.column.remediationOwner', sortable: true },
  { id: 'remediation', labelKey: 'deficiency.column.remediation', sortable: false },
  { id: 'targetDate', labelKey: 'deficiency.column.targetDate', sortable: true },
]

export function baseColumnsFor(register: ControlRegisterName): readonly ControlColumnDefinition[] {
  return register === 'control' ? CONTROL_BASE_COLUMNS : DEFICIENCY_BASE_COLUMNS
}

/** A custom column rendered as a grid column, with its label resolved. */
export function customColumnDefinition(
  column: ControlCustomColumn,
  language: 'en' | 'ka',
): ControlColumnDefinition {
  return {
    id: column.id,
    labelKey: null,
    customLabel: pickLanguage(column.labelEn, column.labelKa, language),
    sortable: false,
  }
}

/**
 * Base columns plus every active custom column for that register.
 *
 * Deactivating a custom column removes it from the grid WITHOUT deleting the
 * values stored against it — reactivating brings the data back, the rule the
 * platform already applies to custom risk attributes.
 */
export function availableColumns(
  config: ControlConfig,
  register: ControlRegisterName,
  language: 'en' | 'ka' = 'en',
): ControlColumnDefinition[] {
  return [
    ...baseColumnsFor(register),
    ...activeCustomColumns(config, register).map((column) =>
      customColumnDefinition(column, language),
    ),
  ]
}
