import { useMemo, useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import { reorderWidgets, type DashboardContext } from '../../domain/dashboard/index.ts'
import { availableCompactColumns, toggleCompactColumn } from '../../domain/export/index.ts'
import { canAccess, visibleRisks } from '../../domain/permissions/index.ts'
import { buildRegisterIndex } from '../../domain/register/index.ts'
import { ratingLevels, ratingName } from '../../domain/risk-engine/index.ts'
import { RISK_STATUSES } from '../../domain/types/enums.ts'
import type { ReportSection, ReportTemplate, RiskFilters, RatingMatrix } from '../../domain/types/index.ts'
import { pickNamed, useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import {
  CompactRegisterSectionView,
  DashboardSectionView,
  OpenTextSectionView,
} from './report-sections.tsx'
import './reports.css'

/*
 * Report Template Builder (ARCHITECTURE.md §8.4).
 *
 * Three section types, each independently filtered and reorderable. Print/PDF
 * uses the browser print dialog in Phase 1; Phase 2 recommends server-side
 * rendering against a versioned template snapshot.
 */

function blankTemplate(id: string): ReportTemplate {
  return {
    id, nameEn: 'New report', nameKa: '', descriptionEn: '', descriptionKa: '', sections: [],
  }
}

export function ReportsPage() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user, context: access } = useCurrentUser()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const scoped = useMemo(
    () => (state ? visibleRisks(access, state.risks) : []),
    [state, access],
  )

  const index = useMemo(() => {
    if (!state) return null
    return buildRegisterIndex({
      categories: state.categories,
      businessUnits: state.businessUnits,
      users: state.users,
      matrix: state.matrix,
      language,
    })
  }, [state, language])

  if (!state || !index || !user) return null

  const templates = state.reportTemplates
  const template = templates.find((candidate) => candidate.id === selectedId) ?? templates[0]
  const canEdit = canAccess(access, 'reports', 'edit')

  if (!template) {
    return (
      <section aria-labelledby="reports-title">
        <h1 id="reports-title">{t('page.reports.title')}</h1>
        <p className="panel__meta">{t('report.noTemplates')}</p>
      </section>
    )
  }

  const context: DashboardContext = {
    risks: scoped,
    businessUnits: state.businessUnits,
    categories: state.categories,
    users: state.users,
    customAttributes: state.customAttributes,
    matrix: state.matrix,
    index,
    auditEvents: state.auditEvents,
    dashboards: state.dashboards,
    today: new Date().toISOString().slice(0, 10),
    language,
  }

  const write = async (next: ReportTemplate, action: string) => {
    await store.update({
      mutate: (appState) => {
        const position = appState.reportTemplates.findIndex((candidate) => candidate.id === next.id)
        if (position >= 0) appState.reportTemplates[position] = next
        else appState.reportTemplates.push(next)
      },
      audit: { actorId: user.id, action, entityType: 'ReportTemplate', entityId: next.id, summary: next.nameEn },
    })
  }

  const patch = (changes: Partial<ReportTemplate>) =>
    write({ ...template, ...changes }, 'report.updated')

  const addSection = (section: ReportSection) =>
    void patch({ sections: [...template.sections, section] })

  const patchSection = (position: number, changes: Partial<ReportSection>) => {
    const sections = [...template.sections]
    sections[position] = { ...sections[position], ...changes } as ReportSection
    void patch({ sections })
  }

  const now = () => Date.now().toString(36)

  return (
    <section aria-labelledby="reports-title">
      <div className="dash-header report-controls">
        <h1 id="reports-title">{t('page.reports.title')}</h1>

        <div className="dash-header__controls">
          <label>
            <span className="visually-hidden">{t('report.select')}</span>
            <select
              value={template.id}
              onChange={(event) => {
                setSelectedId(event.target.value)
                setNotice(null)
              }}
            >
              {templates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {pickNamed(candidate, 'name', language)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => {
              // Phase 1 PDF is the browser print dialog.
              if (typeof window.print === 'function') window.print()
            }}
          >
            {t('report.print')}
          </button>

          {canEdit ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const created = blankTemplate(`rpt_${now()}`)
                  void write(created, 'report.created').then(() => {
                    setSelectedId(created.id)
                    setEditing(true)
                  })
                }}
              >
                {t('report.add')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const copy: ReportTemplate = {
                    ...structuredClone(template),
                    id: `rpt_${now()}`,
                    nameEn: `${template.nameEn} (copy)`,
                  }
                  void write(copy, 'report.duplicated').then(() => { setSelectedId(copy.id) })
                }}
              >
                {t('report.duplicate')}
              </button>
              <button
                type="button"
                onClick={() => {
                  void store
                    .update({
                      mutate: (appState) => {
                        appState.reportTemplates = appState.reportTemplates.filter(
                          (candidate) => candidate.id !== template.id,
                        )
                      },
                      audit: {
                        actorId: user.id, action: 'report.deleted', entityType: 'ReportTemplate',
                        entityId: template.id, summary: template.nameEn,
                      },
                    })
                    .then(() => { setSelectedId(null) })
                }}
              >
                {t('report.delete')}
              </button>
              <button type="button" onClick={() => { setEditing(!editing) }}>
                {editing ? t('report.done') : t('report.edit')}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {notice ? <p className="admin-errors" role="alert">{notice}</p> : null}

      {editing && canEdit ? (
        <div className="report-settings">
          <div className="admin-form">
            <label>
              <span>{t('report.nameEn')}</span>
              <input value={template.nameEn} onChange={(event) => { void patch({ nameEn: event.target.value }) }} />
            </label>
            <label>
              <span>{t('report.nameKa')}</span>
              <input value={template.nameKa} onChange={(event) => { void patch({ nameKa: event.target.value }) }} />
            </label>
            <label>
              <span>{t('report.descriptionEn')}</span>
              <input value={template.descriptionEn} onChange={(event) => { void patch({ descriptionEn: event.target.value }) }} />
            </label>
          </div>

          <div className="report-add-sections">
            <button
              type="button"
              onClick={() => {
                addSection({
                  id: `sec_${now()}`, type: 'dashboard',
                  dashboardId: state.dashboards[0]?.id ?? '', filters: {},
                })
              }}
            >
              {t('report.addDashboardSection')}
            </button>
            <button
              type="button"
              onClick={() => {
                addSection({
                  id: `sec_${now()}`, type: 'openText',
                  titleEn: 'Executive summary', titleKa: '', bodyEn: '', bodyKa: '',
                })
              }}
            >
              {t('report.addTextSection')}
            </button>
            <button
              type="button"
              onClick={() => {
                addSection({
                  id: `sec_${now()}`, type: 'compactRegister',
                  titleEn: 'Risk register', titleKa: '',
                  columns: ['ref', 'title', 'residual', 'status'], filters: {},
                })
              }}
            >
              {t('report.addRegisterSection')}
            </button>
          </div>
        </div>
      ) : null}

      <article className="report-document">
        <header className="report-document__header">
          <h1>{pickNamed(template, 'name', language)}</h1>
          <p className="panel__meta">{pickNamed(template, 'description', language)}</p>
        </header>

        {template.sections.length === 0 ? (
          <p className="panel__meta">{t('report.noSections')}</p>
        ) : (
          template.sections.map((section, position) => (
            <div key={section.id} className="report-section-wrapper">
              {section.type === 'dashboard' ? (
                <DashboardSectionView section={section} risks={scoped} context={context} />
              ) : null}
              {section.type === 'openText' ? (
                <OpenTextSectionView section={section} risks={scoped} context={context} />
              ) : null}
              {section.type === 'compactRegister' ? (
                <CompactRegisterSectionView section={section} risks={scoped} context={context} />
              ) : null}

              {editing && canEdit ? (
                <SectionEditor
                  section={section}
                  position={position}
                  total={template.sections.length}
                  dashboards={state.dashboards.map((dashboard) => ({
                    id: dashboard.id,
                    label: pickNamed(dashboard, 'name', language),
                  }))}
                  columns={availableCompactColumns(state.customAttributes)}
                  onPatch={(changes) => { patchSection(position, changes) }}
                  onMove={(to) => { void patch({ sections: reorderWidgets(template.sections, position, to) }) }}
                  onDuplicate={() => {
                    const copy = { ...structuredClone(section), id: `sec_${now()}` }
                    const sections = [...template.sections]
                    sections.splice(position + 1, 0, copy)
                    void patch({ sections })
                  }}
                  onDelete={() => {
                    void patch({ sections: template.sections.filter((candidate) => candidate.id !== section.id) })
                  }}
                  onLastColumn={() => { setNotice(t('report.section.lastColumn')) }}
                  matrix={state.matrix}
                  language={language}
                />
              ) : null}
            </div>
          ))
        )}
      </article>
    </section>
  )
}

// --- section editor ---------------------------------------------------------

function SectionEditor(props: {
  section: ReportSection
  position: number
  total: number
  dashboards: readonly { id: string; label: string }[]
  columns: readonly { id: string; label: string }[]
  onPatch: (changes: Partial<ReportSection>) => void
  onMove: (to: number) => void
  onDuplicate: () => void
  onDelete: () => void
  onLastColumn: () => void
  /** Rating filter options read their names from the saved configuration. */
  matrix: RatingMatrix
  language: 'en' | 'ka'
}) {
  const { t } = useTranslation()
  const { section } = props
  const name = t(`report.section.${section.type}` as TranslationKey)

  const setFilter = (key: keyof RiskFilters, value: string) => {
    if (section.type === 'openText') return
    const filters = { ...section.filters } as Record<string, string | undefined>
    if (value === '') delete filters[key]
    else filters[key] = value
    props.onPatch({ filters: filters as RiskFilters } as Partial<ReportSection>)
  }

  return (
    <div className="report-section__editor">
      <p className="report-section__kind">{name}</p>

      {section.type === 'dashboard' ? (
        <label>
          <span>{t('report.section.dashboardChoice')}</span>
          <select
            aria-label={`${name} ${String(props.position + 1)} ${t('report.section.dashboardChoice')}`}
            value={section.dashboardId}
            onChange={(event) => { props.onPatch({ dashboardId: event.target.value } as Partial<ReportSection>) }}
          >
            {props.dashboards.map((dashboard) => (
              <option key={dashboard.id} value={dashboard.id}>{dashboard.label}</option>
            ))}
          </select>
        </label>
      ) : null}

      {section.type === 'openText' ? (
        <>
          <label>
            <span>{t('report.section.titleEn')}</span>
            <input
              aria-label={`${name} ${String(props.position + 1)} ${t('report.section.titleEn')}`}
              value={section.titleEn}
              onChange={(event) => { props.onPatch({ titleEn: event.target.value } as Partial<ReportSection>) }}
            />
          </label>
          <label>
            <span>{t('report.section.bodyEn')}</span>
            <textarea
              aria-label={`${name} ${String(props.position + 1)} ${t('report.section.bodyEn')}`}
              value={section.bodyEn}
              onChange={(event) => { props.onPatch({ bodyEn: event.target.value } as Partial<ReportSection>) }}
            />
          </label>
        </>
      ) : null}

      {section.type === 'compactRegister' ? (
        <>
          <label>
            <span>{t('report.section.titleEn')}</span>
            <input
              aria-label={`${name} ${String(props.position + 1)} ${t('report.section.titleEn')}`}
              value={section.titleEn}
              onChange={(event) => { props.onPatch({ titleEn: event.target.value } as Partial<ReportSection>) }}
            />
          </label>

          <fieldset className="report-columns">
            <legend>{t('report.section.columns')}</legend>
            {props.columns.map((column) => (
              <label key={column.id}>
                <input
                  type="checkbox"
                  checked={section.columns.includes(column.id)}
                  onChange={() => {
                    const next = toggleCompactColumn(section.columns, column.id)
                    // Unchanged means the last column was protected.
                    if (next.length === section.columns.length && section.columns.includes(column.id)) {
                      props.onLastColumn()
                      return
                    }
                    props.onPatch({ columns: next } as Partial<ReportSection>)
                  }}
                />
                <span>{column.label}</span>
              </label>
            ))}
          </fieldset>
        </>
      ) : null}

      {/* Dashboard and register sections carry their own filters. */}
      {section.type !== 'openText' ? (
        <fieldset className="report-filters">
          <legend>{t('report.section.filters')}</legend>
          <label>
            <span>{t('register.filter.status')}</span>
            <select
              aria-label={`${name} ${String(props.position + 1)} ${t('register.filter.status')}`}
              value={section.filters.status ?? ''}
              onChange={(event) => { setFilter('status', event.target.value) }}
            >
              <option value="">{t('register.filter.all')}</option>
              {RISK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label>
            <span>{t('register.filter.residualRating')}</span>
            <select
              aria-label={`${name} ${String(props.position + 1)} ${t('register.filter.residualRating')}`}
              value={section.filters.residualRating ?? ''}
              onChange={(event) => { setFilter('residualRating', event.target.value) }}
            >
              <option value="">{t('register.filter.all')}</option>
              {/* Keyed by the stable rating key; the label is configured (CR-003). */}
              {ratingLevels(props.matrix).map((level) => (
                <option key={level.key} value={level.key}>
                  {ratingName(props.matrix, level.key, props.language)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      ) : null}

      <div className="report-section__actions">
        <button type="button" disabled={props.position === 0} onClick={() => { props.onMove(props.position - 1) }}>
          {t('report.section.moveUp')}
        </button>
        <button
          type="button"
          disabled={props.position === props.total - 1}
          onClick={() => { props.onMove(props.position + 1) }}
        >
          {t('report.section.moveDown')}
        </button>
        <button type="button" onClick={props.onDuplicate}>{t('report.section.duplicate')}</button>
        <button type="button" onClick={props.onDelete}>{t('report.section.delete')}</button>
      </div>
    </div>
  )
}
