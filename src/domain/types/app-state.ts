import type { AuditEvent, Risk } from './risk.ts'
import type {
  ControlColumnPreference,
  ControlConfig,
  ControlDeficiency,
  ControlRiskLink,
  RegisterControl,
} from './controls.ts'
import type {
  Branding,
  BusinessUnit,
  Category,
  CustomAttribute,
  DemoRequest,
  MatrixVersion,
  RatingMatrix,
  Role,
  SiteContent,
  SsoConfig,
  User,
} from './master-data.ts'
import type {
  Dashboard,
  DashboardLayout,
  DashboardView,
  ReportTemplate,
  SavedView,
} from './reporting.ts'

/**
 * Current persisted schema version (ARCHITECTURE.md §4.1).
 *
 * 9 added the manual `Risk.description` field (CR-002). 10 adds the
 * configurable rating matrix (CR-003): the matrix gains a version, a scale
 * name, level display names, criterion descriptions and percentage bands,
 * AppState gains `matrixVersions`, and assessment snapshots record the matrix
 * version they were taken against. 11 adds the Dashboard module's saved views
 * and per-user widget layouts (CR-004). 12 adds the public "Request a demo"
 * intake: the `demoRequests` collection and the site-content copy the form
 * renders. Every step is additive — migration fills what is missing and
 * overwrites nothing that was configured. The legacy `app.html` build persists
 * version 7; migration handles that gap too. 13 adds the Control Register and
 * Control Deficiency Register (CR-2026): the `controls`, `controlDeficiencies`,
 * `controlRiskLinks` and `controlColumnPreferences` collections plus the
 * `controlConfig` scales. Purely additive — no existing collection or record
 * changes shape, so state written by an older build still loads unchanged.
 */
export const SCHEMA_VERSION = 13

/**
 * Browser storage key. Retained deliberately from the v3 build for backward
 * compatibility — do NOT rename it (ARCHITECTURE.md §4).
 */
export const STORAGE_KEY = 'erm-risk-management-v3-state'

/**
 * The complete persisted aggregate.
 *
 * Session-local references (active language, signed-in user) are deliberately
 * excluded — they belong to the UI store, not to authoritative business data
 * (ARCHITECTURE.md §2.1, §3.1).
 */
export interface AppState {
  schemaVersion: number

  users: User[]
  roles: Role[]

  categories: Category[]
  businessUnits: BusinessUnit[]
  customAttributes: CustomAttribute[]
  /** The live tenant configuration every matrix component reads (CR-003). */
  matrix: RatingMatrix
  /** Superseded configurations, newest first, so history stays readable. */
  matrixVersions: MatrixVersion[]

  risks: Risk[]

  /**
   * Organisation-wide Control Register (CR-2026, FR-CR-01).
   *
   * Distinct from `Risk.controls`, the narrative controls captured inside a
   * single risk — that list is untouched by this change.
   */
  controls: RegisterControl[]
  /** Findings raised against register controls (FR-CD-01). */
  controlDeficiencies: ControlDeficiency[]
  /** Risk ⇄ control join, so the risk record itself never changes (FR-CR-04). */
  controlRiskLinks: ControlRiskLink[]
  /** Configurable control scales and custom columns (FR-CR-09, FR-CR-11). */
  controlConfig: ControlConfig
  /** Per-user column order for both registers (FR-CR-07, FR-CD-05). */
  controlColumnPreferences: ControlColumnPreference[]

  savedViews: SavedView[]
  dashboards: Dashboard[]
  /** Saved Dashboard filter sets, private per user (CR-004). */
  dashboardViews: DashboardView[]
  /** Per-user widget arrangement for the Dashboard module (CR-004). */
  dashboardLayouts: DashboardLayout[]
  reportTemplates: ReportTemplate[]

  /** Global trail powering Recent Activity and Administration review. */
  auditEvents: AuditEvent[]

  /**
   * Public website demo requests, newest first. Marketing intake only — a
   * request never becomes a user account on its own.
   */
  demoRequests: DemoRequest[]

  branding: Branding
  ssoConfig: SsoConfig
  siteContent: SiteContent
}

/**
 * Top-level key renames between the legacy v7 build and the canonical v8
 * shape above. Consumed by the migration layer in M3 (ARCHITECTURE.md §4.1).
 */
export const LEGACY_V7_KEY_MAP = {
  version: 'schemaVersion',
  attributes: 'customAttributes',
  globalAudit: 'auditEvents',
  savedFilters: 'savedViews',
  sso: 'ssoConfig',
} as const

/**
 * Field renames inside legacy v7 records. The v7 build predates the naming in
 * the addendum specification; migration normalises to the canonical names.
 */
export const LEGACY_V7_FIELD_MAP = {
  category: { level1: 'level1En', level2: 'level2En' },
  businessUnit: { name: 'nameEn' },
  customAttribute: { nameEn: 'labelEn', nameKa: 'labelKa' },
  user: { roles: 'roleIds' },
  role: { name: 'nameEn' },
} as const
