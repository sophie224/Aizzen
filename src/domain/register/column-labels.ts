/*
 * The column label keys the Register uses.
 *
 * Declared in the domain as a plain string union rather than importing the
 * i18n dictionary type: the domain may not depend on outer layers, and the
 * dictionary is free to grow without widening this contract. The i18n layer
 * asserts that every key here has a translation.
 */
export const COLUMN_LABEL_KEYS = [
  'register.column.n',
  'register.column.ref',
  'register.column.title',
  'register.column.description',
  'register.column.category',
  'register.column.businessUnit',
  'register.column.riskOwner',
  'register.column.inherent',
  'register.column.controls',
  'register.column.residual',
  'register.column.target',
  'register.column.response',
  'register.column.actionPlan',
  'register.column.status',
  'register.column.trend',
  'register.column.outlook',
  'register.column.targetDate',
  'register.column.custom',
] as const

export type TranslationKeyish = (typeof COLUMN_LABEL_KEYS)[number]
