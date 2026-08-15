import type { AppState, Branding, SsoConfig } from '../../domain/types/index.ts'
import { SCHEMA_VERSION } from '../../domain/types/index.ts'
import { createSeedCategories } from './categories.ts'
import { createSeedMatrix } from './matrix.ts'
import {
  createSeedBusinessUnits,
  createSeedCustomAttributes,
  createSeedUsers,
} from './organisation.ts'
import {
  createSeedDashboards,
  createSeedReportTemplates,
  createSeedSiteContent,
} from './reporting.ts'
import { createSeedRoles } from './roles.ts'

function createSeedBranding(): Branding {
  return { clientLogo: null }
}

/**
 * SAML draft. Phase 1 stores the configuration but performs no real
 * authentication; the Enabled toggle raises an audit event
 * (ARCHITECTURE.md §6.3).
 */
function createSeedSsoConfig(): SsoConfig {
  return {
    enabled: false,
    providerName: 'Microsoft Entra ID / Okta',
    entityId: '',
    metadataUrl: '',
    acsUrl: 'https://your-domain.example.com/auth/saml/acs',
    emailAttribute: 'email',
    roleAttribute: 'groups',
    roleMappings: 'ERM-Admins=Administrator\nERM-Risk-Managers=Risk Manager\nERM-Auditors=Auditor',
  }
}

/**
 * Builds a fresh canonical `AppState` at the current schema version.
 *
 * Called when storage is empty and by "Reset demo data". Each call returns
 * independent objects, so callers may mutate the result freely.
 *
 * `risks` is intentionally empty: PLAN.md M2 scopes the seed to master data,
 * matrix, default dashboard/report and site content. Sample risk records
 * arrive with the M0 legacy fixture in M3.
 */
export function createSeedState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,

    users: createSeedUsers(),
    roles: createSeedRoles(),

    categories: createSeedCategories(),
    businessUnits: createSeedBusinessUnits(),
    customAttributes: createSeedCustomAttributes(),
    matrix: createSeedMatrix(),

    risks: [],

    savedViews: [],
    dashboards: createSeedDashboards(),
    reportTemplates: createSeedReportTemplates(),
    auditEvents: [],

    branding: createSeedBranding(),
    ssoConfig: createSeedSsoConfig(),
    siteContent: createSeedSiteContent(),
  }
}

export { createSeedCategories, LEVEL_1_GROUPS } from './categories.ts'
export { createSeedMatrix, DEFAULT_RATING_COLORS } from './matrix.ts'
export { createSeedBusinessUnits, createSeedCustomAttributes, createSeedUsers } from './organisation.ts'
export { createSeedDashboards, createSeedReportTemplates, createSeedSiteContent } from './reporting.ts'
export { createSeedRoles } from './roles.ts'
