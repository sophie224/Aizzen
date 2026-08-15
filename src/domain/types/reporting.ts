import type { IsoDate } from './risk.ts'
import type {
  AssessmentType,
  RatingLabel,
  RegisterViewMode,
  ReportSectionType,
  Outlook,
  RiskStatus,
  RiskType,
  ScaleValue,
  WidgetGrouping,
  WidgetMetric,
  WidgetSpan,
  WidgetType,
} from './enums.ts'

/**
 * The seven filters shared by the Register, dashboards and report sections
 * (ARCHITECTURE.md §8.2–§8.4). Every field is optional — an absent key means
 * "no constraint".
 */
export interface RiskFilters {
  /** Exact category match, used by report sections that pin one category. */
  categoryId?: string
  /**
   * Level-1 group match, e.g. `Operational`. This is what the Risk Register's
   * category filter uses — it groups by the broad Level 1 category, not by the
   * specific Level 2 one (ARCHITECTURE.md §8.2).
   */
  categoryLevel1?: string
  /** Matches the selected unit and all descendants. */
  businessUnitId?: string
  residualRating?: RatingLabel
  status?: RiskStatus
  outlook?: Outlook
  riskType?: RiskType
  riskOwnerId?: string

  /*
   * --- dashboard drill-through (CR-004) -------------------------------------
   *
   * The dashboard and the Register share ONE predicate set, which is what
   * makes a widget count and the register result reconcile exactly under the
   * same filters. Every key below is optional and absent means "no
   * constraint", exactly like the seven above.
   */

  /** Which assessment `impact` / `likelihood` refer to. Defaults to residual. */
  basis?: AssessmentType
  impact?: ScaleValue
  likelihood?: ScaleValue

  /** Target-date window, inclusive at both ends. */
  targetFrom?: IsoDate
  targetTo?: IsoDate

  /** Still open: any status other than Completed. */
  open?: boolean
  /** Residual score above the target score. */
  aboveTarget?: boolean
  /** Residual rating sits at the most severe configured level. */
  aboveAppetite?: boolean
  /** Holds at least one action past its due date and not Completed. */
  hasOverdueAction?: boolean
  /** Review date falls within the next `REVIEW_SOON_DAYS`. */
  reviewDueSoon?: boolean
}

export interface SortState {
  field: 'title' | 'owner' | 'residual' | 'targetDate' | 'ref'
  direction: 'asc' | 'desc'
}

/**
 * A user's saved Register configuration. Each user may hold at most one
 * default; setting a new default clears the previous one
 * (ARCHITECTURE.md §8.2).
 */
export interface SavedView {
  id: string
  name: string
  /** Owning user — saved views are private and invisible to others. */
  userId: string
  search: string
  filters: RiskFilters
  sort: SortState
  visibleColumns: string[]
  viewMode: RegisterViewMode
  isDefault: boolean
}

/**
 * A saved Dashboard view (CR-004).
 *
 * Mirrors the Register's saved views deliberately: private to its owner, at
 * most one default each, and it captures the filter set plus the heat-map
 * basis — the two things that change what every widget shows.
 */
export interface DashboardView {
  id: string
  name: string
  /** Owning user — dashboard views are private, like the Register's. */
  userId: string
  filters: RiskFilters
  basis: AssessmentType
  isDefault: boolean
}

/** One user's widget arrangement, saved so the dashboard opens as they left it. */
export interface DashboardLayout {
  userId: string
  /** Widget IDs in display order; unknown IDs are ignored on read. */
  order: string[]
  /** Widget IDs the user has hidden. */
  hidden: string[]
}

export interface DashboardWidget {
  id: string
  type: WidgetType
  titleEn: string
  titleKa: string
  /** Foreground / accent colour. */
  accentColor: string
  backgroundColor: string
  span: WidgetSpan
  /** Which assessment a heatmap or Top Risks widget reads. */
  scoreBasis?: AssessmentType
  grouping?: WidgetGrouping
  metric?: WidgetMetric
  /** 1–20, for Top Risks and Recent Activity. */
  limit?: number
}

export interface Dashboard {
  id: string
  nameEn: string
  nameKa: string
  descriptionEn: string
  descriptionKa: string
  accentColor: string
  shared: boolean
  /** Persisted with the definition and restored when the dashboard opens. */
  filters: RiskFilters
  widgets: DashboardWidget[]
}

interface ReportSectionBase {
  id: string
  type: ReportSectionType
}

/** Renders a saved dashboard at this section's own scope. */
export interface DashboardReportSection extends ReportSectionBase {
  type: 'dashboard'
  dashboardId: string
  /** Independent of the dashboard's own saved filters. */
  filters: RiskFilters
}

/** Executive Summary, Management Commentary, Recommendations, Decisions Required. */
export interface OpenTextReportSection extends ReportSectionBase {
  type: 'openText'
  titleEn: string
  titleKa: string
  bodyEn: string
  bodyKa: string
}

/** Tabular risk extract. At least one column must remain selected. */
export interface CompactRegisterReportSection extends ReportSectionBase {
  type: 'compactRegister'
  titleEn: string
  titleKa: string
  /** Base columns plus active custom-attribute IDs, in template order. */
  columns: string[]
  filters: RiskFilters
}

export type ReportSection =
  | DashboardReportSection
  | OpenTextReportSection
  | CompactRegisterReportSection

export interface ReportTemplate {
  id: string
  nameEn: string
  nameKa: string
  descriptionEn: string
  descriptionKa: string
  sections: ReportSection[]
}
