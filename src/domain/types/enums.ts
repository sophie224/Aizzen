/*
 * Closed vocabularies for the risk domain (ARCHITECTURE.md §3, §5).
 *
 * Each is a `const` array plus a derived union type, so the same declaration
 * serves the type system and the runtime validator. TS `enum` is unavailable
 * here — tsconfig sets `erasableSyntaxOnly`.
 */

/** Permission levels, ordered. None < Read < Edit (ARCHITECTURE.md §5.2). */
export const PERMISSION_LEVELS = ['none', 'read', 'edit'] as const
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number]

/** Numeric rank used to aggregate permissions across multiple roles. */
export const PERMISSION_RANK: Record<PermissionLevel, number> = {
  none: 0,
  read: 1,
  edit: 2,
}

/**
 * The eight permission modules. Website Administration is deliberately absent —
 * it sits outside this matrix behind a Super Admin guard (ARCHITECTURE.md §5.2).
 */
export const MODULE_NAMES = [
  'dashboard',
  'register',
  'risks',
  'controls',
  'actions',
  'reports',
  'audit',
  'administration',
] as const
export type ModuleName = (typeof MODULE_NAMES)[number]

export type PermissionSet = Record<ModuleName, PermissionLevel>

/** Impact and likelihood are always 1–5 (ARCHITECTURE.md §7). */
export const SCALE_VALUES = [1, 2, 3, 4, 5] as const
export type ScaleValue = (typeof SCALE_VALUES)[number]

/** Rating labels resolved from the matrix by exact cell, never by score range. */
export const RATING_LABELS = ['Low', 'Medium', 'High', 'Significant'] as const
export type RatingLabel = (typeof RATING_LABELS)[number]

/** The three assessment states every risk carries. */
export const ASSESSMENT_TYPES = ['inherent', 'residual', 'target'] as const
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number]

export const RISK_TYPES = ['Current', 'Emerging'] as const
export type RiskType = (typeof RISK_TYPES)[number]

export const RESPONSE_TYPES = ['Avoid', 'Mitigate', 'Transfer', 'Accept'] as const
export type ResponseType = (typeof RESPONSE_TYPES)[number]

/**
 * Manual 12-month management judgement. Never overwritten by the computed
 * historical trend (ARCHITECTURE.md §7.1).
 */
export const OUTLOOKS = ['Increasing', 'Stable', 'Decreasing'] as const
export type Outlook = (typeof OUTLOOKS)[number]

/**
 * Computed from the last two history snapshots — a derived value, never stored.
 * Declared here because dashboards and filters group by it.
 */
export const TRENDS = ['New', 'Improving', 'Stable', 'Worsening'] as const
export type Trend = (typeof TRENDS)[number]

/**
 * Risk workflow statuses, taken from the as-built v7 build. The specification
 * describes `status` only as "workflow status, manager controlled" and never
 * enumerates it, so the legacy vocabulary is authoritative here.
 *
 * Note `Overdue` and `Completed` overlap with action statuses but are distinct
 * fields; the exact transition matrix is an open product decision
 * (ARCHITECTURE.md §14, item 1).
 */
export const RISK_STATUSES = [
  'Draft',
  'In Progress',
  'Monitoring',
  'Rescheduled',
  'Overdue',
  'Completed',
  'Accepted',
] as const
export type RiskStatus = (typeof RISK_STATUSES)[number]

export const CONTROL_TYPES = ['Directive', 'Preventative', 'Detective', 'Corrective'] as const
export type ControlType = (typeof CONTROL_TYPES)[number]

export const CONTROL_AUTOMATION = ['Manual', 'Automated', 'Semi-Automated'] as const
export type ControlAutomation = (typeof CONTROL_AUTOMATION)[number]

export const CONTROL_EFFECTIVENESS = [
  'Effective',
  'Needs Improvement',
  'Ineffective',
  'Not Assessed',
] as const
export type ControlEffectiveness = (typeof CONTROL_EFFECTIVENESS)[number]

export const ACTION_STATUSES = [
  'Not Started',
  'In Progress',
  'Blocked',
  'Rescheduled',
  'Overdue',
  'Completed',
] as const
export type ActionStatus = (typeof ACTION_STATUSES)[number]

export const ACTION_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const
export type ActionPriority = (typeof ACTION_PRIORITIES)[number]

/** Dynamic risk-schema attribute types (ARCHITECTURE.md §3.7). */
export const ATTRIBUTE_TYPES = ['text', 'number', 'date', 'select', 'user'] as const
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number]

export const ENTITY_STATUSES = ['Active', 'Inactive'] as const
export type EntityStatus = (typeof ENTITY_STATUSES)[number]

export const LANGUAGES = ['en', 'ka'] as const
export type Language = (typeof LANGUAGES)[number]

/** The seven dashboard widget types (ARCHITECTURE.md §8.3). */
export const WIDGET_TYPES = [
  'metric',
  'heatmap',
  'distribution',
  'topRisks',
  'actionProgress',
  'recentActivity',
  'trendSummary',
] as const
export type WidgetType = (typeof WIDGET_TYPES)[number]

export const WIDGET_METRICS = [
  'totalRisks',
  'openRisks',
  'significantResidual',
  'overdueActions',
  'emergingRisks',
  'completedActions',
] as const
export type WidgetMetric = (typeof WIDGET_METRICS)[number]

export const WIDGET_GROUPINGS = [
  'rating',
  'category',
  'businessUnit',
  'status',
  'response',
  'outlook',
  'trend',
  'actionStatus',
] as const
export type WidgetGrouping = (typeof WIDGET_GROUPINGS)[number]

/** Permitted grid spans for a widget. */
export const WIDGET_SPANS = [3, 4, 6, 8, 12] as const
export type WidgetSpan = (typeof WIDGET_SPANS)[number]

/** The three report section types (ARCHITECTURE.md §8.4). */
export const REPORT_SECTION_TYPES = ['dashboard', 'openText', 'compactRegister'] as const
export type ReportSectionType = (typeof REPORT_SECTION_TYPES)[number]

export const REGISTER_VIEW_MODES = ['compact', 'detailed'] as const
export type RegisterViewMode = (typeof REGISTER_VIEW_MODES)[number]
