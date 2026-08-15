import type { AuditEvent, Risk } from './risk.ts'
import type {
  Branding,
  BusinessUnit,
  Category,
  CustomAttribute,
  RatingMatrix,
  Role,
  SiteContent,
  SsoConfig,
  User,
} from './master-data.ts'
import type { Dashboard, ReportTemplate, SavedView } from './reporting.ts'

/**
 * Current persisted schema version (ARCHITECTURE.md §4.1).
 * The legacy `app.html` build persists version 7; migration handles the gap.
 */
export const SCHEMA_VERSION = 8

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
  matrix: RatingMatrix

  risks: Risk[]

  savedViews: SavedView[]
  dashboards: Dashboard[]
  reportTemplates: ReportTemplate[]

  /** Global trail powering Recent Activity and Administration review. */
  auditEvents: AuditEvent[]

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
