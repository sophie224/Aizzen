import { useState } from 'react'
import { useAppData } from '../../data/app-data-context.ts'
import { administrationMetrics } from '../../domain/administration/index.ts'
import { useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { BusinessUnitsSection } from './business-units-section.tsx'
import { CategoriesSection } from './categories-section.tsx'
import { BrandingSection } from './branding-section.tsx'
import { ControlScalesSection } from './control-scales-section.tsx'
import { CustomAttributesSection } from './custom-attributes-section.tsx'
import { DataToolsSection } from './data-tools-section.tsx'
import { SsoSection } from './sso-section.tsx'
import { MatrixSection } from './matrix-section.tsx'
import { RolesSection } from './roles-section.tsx'
import { UsersSection } from './users-section.tsx'
import './administration.css'

/*
 * Risk Administration (ARCHITECTURE.md §8.5).
 *
 * All ten sections are implemented: Overview, Categories, Business Units,
 * Custom Attributes, Users, Roles & Permissions, Rating Matrix, Branding,
 * SSO/SAML roadmap and Data Tools.
 */

const SECTIONS = [
  { id: 'overview', labelKey: 'admin.section.overview', milestone: null },
  { id: 'categories', labelKey: 'admin.section.categories', milestone: null },
  { id: 'businessUnits', labelKey: 'admin.section.businessUnits', milestone: null },
  { id: 'customAttributes', labelKey: 'admin.section.customAttributes', milestone: null },
  { id: 'users', labelKey: 'admin.section.users', milestone: null },
  { id: 'roles', labelKey: 'admin.section.roles', milestone: null },
  { id: 'matrix', labelKey: 'admin.section.matrix', milestone: null },
  { id: 'controlScales', labelKey: 'admin.section.controlScales', milestone: null },
  { id: 'branding', labelKey: 'admin.section.branding', milestone: null },
  { id: 'sso', labelKey: 'admin.section.sso', milestone: null },
  { id: 'dataTools', labelKey: 'admin.section.dataTools', milestone: null },
] as const satisfies readonly { id: string; labelKey: TranslationKey; milestone: string | null }[]

type SectionId = (typeof SECTIONS)[number]['id']

export function AdministrationPage() {
  const { t } = useTranslation()
  const [active, setActive] = useState<SectionId>('overview')

  const current = SECTIONS.find((section) => section.id === active)

  return (
    <section aria-labelledby="administration-title">
      <h1 id="administration-title">{t('page.administration.title')}</h1>

      <div className="admin-layout">
        <nav className="admin-nav" aria-label={t('admin.sections')}>
          <ul>
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  className="admin-nav__link"
                  aria-current={active === section.id ? 'page' : undefined}
                  onClick={() => {
                    setActive(section.id)
                  }}
                >
                  {t(section.labelKey)}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="admin-workspace">
          {active === 'overview' ? <OverviewSection /> : null}
          {active === 'categories' ? <CategoriesSection /> : null}
          {active === 'businessUnits' ? <BusinessUnitsSection /> : null}
          {active === 'customAttributes' ? <CustomAttributesSection /> : null}
          {active === 'users' ? <UsersSection /> : null}
          {active === 'roles' ? <RolesSection /> : null}
          {active === 'matrix' ? <MatrixSection /> : null}
          {active === 'controlScales' ? <ControlScalesSection /> : null}
          {active === 'branding' ? <BrandingSection /> : null}
          {active === 'sso' ? <SsoSection /> : null}
          {active === 'dataTools' ? <DataToolsSection /> : null}

          {current?.milestone ? (
            <section aria-labelledby="pending-title">
              <h2 id="pending-title">{t(current.labelKey)}</h2>
              <div className="panel panel--notice">
                <p>{t('state.comingSoon')} Scheduled for milestone {current.milestone}.</p>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  )
}

/**
 * Configuration health summary.
 *
 * Counts only — it deliberately does not check completeness, so an active
 * category with no Georgian label still counts as active (ARCHITECTURE.md §8.5).
 */
function OverviewSection() {
  const { t } = useTranslation()
  const { state } = useAppData()

  if (!state) return null
  const metrics = administrationMetrics(state)

  const tiles = [
    { key: 'admin.metric.activeCategories', value: metrics.activeCategories },
    { key: 'admin.metric.activeBusinessUnits', value: metrics.activeBusinessUnits },
    { key: 'admin.metric.activeUsers', value: metrics.activeUsers },
    { key: 'admin.metric.activeCustomAttributes', value: metrics.activeCustomAttributes },
    { key: 'admin.metric.roles', value: metrics.roles },
    { key: 'admin.metric.auditEvents', value: metrics.auditEvents },
  ] as const satisfies readonly { key: TranslationKey; value: number }[]

  return (
    <section aria-labelledby="overview-title">
      <h2 id="overview-title">{t('admin.section.overview')}</h2>

      <ul className="admin-metrics">
        {tiles.map((tile) => (
          <li key={tile.key} className="admin-metric">
            <span className="admin-metric__value">{tile.value}</span>
            <span className="admin-metric__label">{t(tile.key)}</span>
          </li>
        ))}
      </ul>

      <p className="panel__meta">{t('admin.overview.note')}</p>
    </section>
  )
}
