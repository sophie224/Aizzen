import type {
  Acceptance,
  Dashboard,
  DashboardWidget,
  ReportSection,
  ReportTemplate,
  WidgetType,
} from '../../domain/types/index.ts'
import { LEGACY_COMPACT_COLUMN_MAP } from '../../domain/export/index.ts'
import { isRecord } from '../../domain/validation/guards.ts'

/*
 * Shape migration from the as-built v7 build to the canonical v8 contract.
 *
 * v7 predates the naming in the addendum specification, so this module is a
 * pure rename/reshape pass. It never drops risk data: every risk, control,
 * action, history item and audit event survives with its ID intact
 * (ARCHITECTURE.md §4.1).
 */

/** Legacy widget type slugs → canonical names. */
const WIDGET_TYPE_MAP: Record<string, WidgetType> = {
  metric: 'metric',
  heatmap: 'heatmap',
  bar: 'distribution',
  'top-risks': 'topRisks',
  'action-progress': 'actionProgress',
  'recent-activity': 'recentActivity',
  'trend-summary': 'trendSummary',
}

/** Legacy report section type slugs → canonical names. */
const SECTION_TYPE_MAP: Record<string, ReportSection['type']> = {
  dashboard: 'dashboard',
  text: 'openText',
  'risk-register': 'compactRegister',
}

/** An acceptance record is absent on every v7 risk; v8 always carries one. */
export function emptyAcceptance(): Acceptance {
  return {
    rationale: '',
    initiatorId: '',
    approverId: '',
    approvalDate: '',
    validUntil: '',
    reviewDate: '',
  }
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/**
 * True when the payload still uses v7 key names. Checked structurally rather
 * than by version number, so a partially-migrated or hand-edited file is still
 * handled correctly.
 */
export function isLegacyV7Shape(state: Record<string, unknown>): boolean {
  return (
    'version' in state ||
    'attributes' in state ||
    'globalAudit' in state ||
    'savedFilters' in state ||
    'sso' in state ||
    'clientLogo' in state
  )
}

function migrateWidget(raw: unknown): DashboardWidget | null {
  if (!isRecord(raw)) return null

  const legacyType = str(raw.type)
  const type = WIDGET_TYPE_MAP[legacyType]
  if (!type) return null

  const widget: DashboardWidget = {
    id: str(raw.id),
    type,
    titleEn: str(raw.titleEn, str(raw.title)),
    titleKa: str(raw.titleKa),
    // v7 calls the foreground colour `color`.
    accentColor: str(raw.accentColor, str(raw.color, '#1A2151')),
    backgroundColor: str(raw.backgroundColor, '#FFFFFF'),
    span: ([3, 4, 6, 8, 12] as const).includes(raw.span as 3) ? (raw.span as 3) : 6,
  }

  if (typeof raw.scoreBasis === 'string') {
    widget.scoreBasis = raw.scoreBasis as DashboardWidget['scoreBasis']
  }
  // v7 calls the grouping dimension `groupBy`.
  const grouping = raw.grouping ?? raw.groupBy
  if (typeof grouping === 'string') {
    widget.grouping = grouping as DashboardWidget['grouping']
  }
  if (typeof raw.metric === 'string') {
    widget.metric = raw.metric as DashboardWidget['metric']
  }
  if (typeof raw.limit === 'number') {
    widget.limit = raw.limit
  }

  return widget
}

export function migrateDashboard(raw: unknown): Dashboard | null {
  if (!isRecord(raw)) return null

  return {
    id: str(raw.id),
    nameEn: str(raw.nameEn, str(raw.name)),
    nameKa: str(raw.nameKa),
    descriptionEn: str(raw.descriptionEn, str(raw.description)),
    descriptionKa: str(raw.descriptionKa),
    accentColor: str(raw.accentColor, '#1A2151'),
    shared: raw.shared === true,
    filters: isRecord(raw.filters) ? (raw.filters as Dashboard['filters']) : {},
    widgets: Array.isArray(raw.widgets)
      ? raw.widgets.map(migrateWidget).filter((widget): widget is DashboardWidget => widget !== null)
      : [],
  }
}

/**
 * v7 stores every section in one flat shape carrying all possible keys. v8
 * uses a discriminated union, so each section is narrowed to its own type.
 */
function migrateSection(raw: unknown): ReportSection | null {
  if (!isRecord(raw)) return null

  const type = SECTION_TYPE_MAP[str(raw.type)]
  if (!type) return null

  const id = str(raw.id)
  const filters = isRecord(raw.filters) ? (raw.filters as ReportSection extends { filters: infer F } ? F : never) : {}

  if (type === 'dashboard') {
    return { id, type, dashboardId: str(raw.dashboardId), filters }
  }

  if (type === 'openText') {
    return {
      id,
      type,
      titleEn: str(raw.titleEn, str(raw.title)),
      titleKa: str(raw.titleKa),
      // v7 names the narrative fields `text` / `textKa`.
      bodyEn: str(raw.bodyEn, str(raw.text)),
      bodyKa: str(raw.bodyKa, str(raw.textKa)),
    }
  }

  return {
    id,
    type,
    titleEn: str(raw.titleEn, str(raw.title)),
    titleKa: str(raw.titleKa),
    // v7 named these columns after the register header (`number`, `risk`,
    // `owner`, `date`); v8 keys them by field. Slugs with no v8 equivalent are
    // left as-is here and dropped by repairReportSections, which can see the
    // custom attributes and so can tell an attribute id from a dead slug.
    columns: Array.isArray(raw.columns)
      ? raw.columns
          .filter((c): c is string => typeof c === 'string')
          .map((c) => LEGACY_COMPACT_COLUMN_MAP[c] ?? c)
      : [],
    filters,
  }
}

export function migrateReportTemplate(raw: unknown): ReportTemplate | null {
  if (!isRecord(raw)) return null

  return {
    id: str(raw.id),
    nameEn: str(raw.nameEn, str(raw.name)),
    nameKa: str(raw.nameKa),
    descriptionEn: str(raw.descriptionEn, str(raw.description)),
    descriptionKa: str(raw.descriptionKa),
    sections: Array.isArray(raw.sections)
      ? raw.sections.map(migrateSection).filter((section): section is ReportSection => section !== null)
      : [],
  }
}

/**
 * Applies the v7 → v8 rename pass. Returns a new object; the input is not
 * mutated. Fields already using canonical names are preserved, which is what
 * makes the pass idempotent.
 */
export function migrateLegacyV7Shape(state: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...state }

  // --- top-level key renames -------------------------------------------------
  next.schemaVersion = 8
  delete next.version

  if (!('customAttributes' in next) && Array.isArray(next.attributes)) {
    next.customAttributes = next.attributes
  }
  delete next.attributes

  if (!('auditEvents' in next) && Array.isArray(next.globalAudit)) {
    next.auditEvents = next.globalAudit
  }
  delete next.globalAudit

  if (!('savedViews' in next) && Array.isArray(next.savedFilters)) {
    next.savedViews = next.savedFilters
  }
  delete next.savedFilters

  if (!('ssoConfig' in next) && isRecord(next.sso)) {
    next.ssoConfig = next.sso
  }
  delete next.sso

  if (!isRecord(next.branding)) {
    next.branding = { clientLogo: typeof next.clientLogo === 'string' ? next.clientLogo : null }
  }
  delete next.clientLogo

  // Session-local values never belonged in persisted business state
  // (ARCHITECTURE.md §3.1); they move to the UI store.
  delete next.language
  delete next.currentUserId

  // --- per-record field renames ---------------------------------------------
  if (Array.isArray(next.categories)) {
    next.categories = next.categories.map((raw) => {
      if (!isRecord(raw)) return raw
      const { level1, level2, ...rest } = raw
      return {
        ...rest,
        level1En: str(rest.level1En, str(level1)),
        level1Ka: str(rest.level1Ka),
        level2En: str(rest.level2En, str(level2)),
        level2Ka: str(rest.level2Ka),
        active: rest.active !== false,
      }
    })
  }

  if (Array.isArray(next.businessUnits)) {
    next.businessUnits = next.businessUnits.map((raw) => {
      if (!isRecord(raw)) return raw
      const { name, ...rest } = raw
      return { ...rest, nameEn: str(rest.nameEn, str(name)), nameKa: str(rest.nameKa) }
    })
  }

  if (Array.isArray(next.customAttributes)) {
    next.customAttributes = next.customAttributes.map((raw) => {
      if (!isRecord(raw)) return raw
      // v7 uses nameEn/nameKa where v8 uses labelEn/labelKa.
      const { nameEn, nameKa, ...rest } = raw
      return {
        ...rest,
        labelEn: str(rest.labelEn, str(nameEn)),
        labelKa: str(rest.labelKa, str(nameKa)),
        options: Array.isArray(rest.options) ? rest.options : [],
        active: rest.active !== false,
        showInRegister: rest.showInRegister === true,
      }
    })
  }

  if (Array.isArray(next.roles)) {
    next.roles = next.roles.map((raw) => {
      if (!isRecord(raw)) return raw
      const { name, ...rest } = raw
      return {
        ...rest,
        nameEn: str(rest.nameEn, str(name)),
        nameKa: str(rest.nameKa),
        description: str(rest.description),
        system: rest.system === true,
      }
    })
  }

  if (Array.isArray(next.users)) {
    next.users = next.users.map((raw) => {
      if (!isRecord(raw)) return raw
      const { roles, ...rest } = raw
      return {
        ...rest,
        roleIds: Array.isArray(rest.roleIds) ? rest.roleIds : Array.isArray(roles) ? roles : [],
        businessUnitIds: Array.isArray(rest.businessUnitIds) ? rest.businessUnitIds : [],
        title: str(rest.title),
      }
    })
  }

  if (Array.isArray(next.risks)) {
    next.risks = next.risks.map((raw) => {
      if (!isRecord(raw)) return raw
      return {
        ...raw,
        // v7 has no acceptance record at all.
        acceptance: isRecord(raw.acceptance) ? raw.acceptance : emptyAcceptance(),
        custom: isRecord(raw.custom) ? raw.custom : {},
        controls: Array.isArray(raw.controls) ? raw.controls : [],
        actions: Array.isArray(raw.actions) ? raw.actions : [],
        history: Array.isArray(raw.history) ? raw.history : [],
        audit: Array.isArray(raw.audit) ? raw.audit : [],
        statusNarrative: str(raw.statusNarrative),
        updatedAt: str(raw.updatedAt),
      }
    })
  }

  if (Array.isArray(next.dashboards)) {
    next.dashboards = next.dashboards
      .map(migrateDashboard)
      .filter((dashboard): dashboard is Dashboard => dashboard !== null)
  }

  if (Array.isArray(next.reportTemplates)) {
    next.reportTemplates = next.reportTemplates
      .map(migrateReportTemplate)
      .filter((template): template is ReportTemplate => template !== null)
  }

  return next
}
