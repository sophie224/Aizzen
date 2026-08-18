import type { AuditEvent, Risk } from './risk.ts'
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
 * version 7; migration handles that gap too.
 */
export const SCHEMA_VERSION = 12

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
