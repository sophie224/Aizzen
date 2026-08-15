import {
  ACTION_PRIORITIES,
  ACTION_STATUSES,
  ATTRIBUTE_TYPES,
  CONTROL_AUTOMATION,
  CONTROL_EFFECTIVENESS,
  CONTROL_TYPES,
  ENTITY_STATUSES,
  MODULE_NAMES,
  OUTLOOKS,
  PERMISSION_LEVELS,
  RATING_LABELS,
  RESPONSE_TYPES,
  RISK_STATUSES,
  RISK_TYPES,
  SCALE_VALUES,
} from '../types/enums.ts'
import type {
  ActionPriority,
  ActionStatus,
  AttributeType,
  ControlAutomation,
  ControlEffectiveness,
  ControlType,
  EntityStatus,
  Outlook,
  PermissionLevel,
  RatingLabel,
  ResponseType,
  RiskStatus,
  RiskType,
  ScaleValue,
} from '../types/enums.ts'

/** Narrows an unknown value to a plain object with unknown members. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString)
}

/** Builds a membership guard from one of the `const` vocabularies in enums.ts. */
function memberOf<T extends readonly unknown[]>(values: T) {
  return (value: unknown): value is T[number] => values.includes(value)
}

export const isScaleValue = memberOf(SCALE_VALUES) as (value: unknown) => value is ScaleValue
export const isRatingLabel = memberOf(RATING_LABELS) as (value: unknown) => value is RatingLabel
export const isPermissionLevel = memberOf(PERMISSION_LEVELS) as (
  value: unknown,
) => value is PermissionLevel
export const isRiskType = memberOf(RISK_TYPES) as (value: unknown) => value is RiskType
export const isRiskStatus = memberOf(RISK_STATUSES) as (value: unknown) => value is RiskStatus
export const isResponseType = memberOf(RESPONSE_TYPES) as (value: unknown) => value is ResponseType
export const isOutlook = memberOf(OUTLOOKS) as (value: unknown) => value is Outlook
export const isControlType = memberOf(CONTROL_TYPES) as (value: unknown) => value is ControlType
export const isControlAutomation = memberOf(CONTROL_AUTOMATION) as (
  value: unknown,
) => value is ControlAutomation
export const isControlEffectiveness = memberOf(CONTROL_EFFECTIVENESS) as (
  value: unknown,
) => value is ControlEffectiveness
export const isActionStatus = memberOf(ACTION_STATUSES) as (value: unknown) => value is ActionStatus
export const isActionPriority = memberOf(ACTION_PRIORITIES) as (
  value: unknown,
) => value is ActionPriority
export const isAttributeType = memberOf(ATTRIBUTE_TYPES) as (value: unknown) => value is AttributeType
export const isEntityStatus = memberOf(ENTITY_STATUSES) as (value: unknown) => value is EntityStatus

/** A score carries impact and likelihood only — never a stored score or rating. */
export function isScore(value: unknown): boolean {
  return isRecord(value) && isScaleValue(value.impact) && isScaleValue(value.likelihood)
}

/** True when every one of the eight modules has a valid permission level. */
export function isPermissionSet(value: unknown): boolean {
  if (!isRecord(value)) return false
  return MODULE_NAMES.every((module) => isPermissionLevel(value[module]))
}
