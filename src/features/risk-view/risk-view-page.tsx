import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppData } from '../../data/app-data-context.ts'
import { hierarchyPath } from '../../domain/business-units/index.ts'
import { isActionOverdue } from '../../domain/actions/index.ts'
import { canEditRisk, canSeeRisk } from '../../domain/permissions/index.ts'
import { assess } from '../../domain/risk-engine/index.ts'
import { directionToTarget, historicalTrend } from '../../domain/trend/index.ts'
import type { Risk } from '../../domain/types/index.ts'
import { pickNamed, useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { RatingChip } from '../register/rating-chip.tsx'
import { RiskEditorModal } from '../risk-editor/risk-editor-modal.tsx'
import { AssessmentMatrix } from './assessment-matrix.tsx'
import { ResidualTrendChart } from './residual-trend-chart.tsx'
import './risk-view.css'

/*
 * Individual Risk View (ARCHITECTURE.md §8.2).
 *
 * Header band plus five tabs: Overview, Assessment, Controls, Actions,
 * Trend & Audit. Record-level visibility is enforced here, not just at the
 * route: a risk outside the user's scope resolves to the same not-found state
 * as one that does not exist, so the view cannot confirm its existence.
 */

const TABS = [
  { id: 'overview', labelKey: 'view.tab.overview' },
  { id: 'assessment', labelKey: 'view.tab.assessment' },
  { id: 'controls', labelKey: 'view.tab.controls' },
  { id: 'actions', labelKey: 'view.tab.actions' },
  { id: 'trend', labelKey: 'view.tab.trendAudit' },
] as const satisfies readonly { id: string; labelKey: TranslationKey }[]

type TabId = (typeof TABS)[number]['id']

export function RiskViewPage() {
  const { t, language } = useTranslation()
  const { riskId } = useParams<{ riskId: string }>()
  const { state } = useAppData()
  const { context } = useCurrentUser()

  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [editing, setEditing] = useState(false)

  const risk = useMemo(() => {
    if (!state) return null
    const found = state.risks.find((candidate) => candidate.id === riskId) ?? null
    // Visibility and existence collapse into one outcome, deliberately.
    return found && canSeeRisk(context, found) ? found : null
  }, [state, riskId, context])

  if (!state) return null

  if (!risk) {
    return (
      <section aria-labelledby="risk-missing-title">
        <h1 id="risk-missing-title">{t('view.notFound.title')}</h1>
        <div className="panel panel--notice">
          <p>{t('view.notFound.body')}</p>
          <Link to="/app/register">{t('view.backToRegister')}</Link>
        </div>
      </section>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const category = state.categories.find((candidate) => candidate.id === risk.categoryId)
  const userName = (id: string) => state.users.find((candidate) => candidate.id === id)?.name ?? '—'
  const actionOwners = [...new Set(risk.actions.map((action) => action.ownerId))].filter(Boolean)
  const editable = canEditRisk(context, risk)

  return (
    <section aria-labelledby="risk-title">
      <RiskHeader
        risk={risk}
        categoryLabel={category ? `${pickNamed(category, 'level1', language)} / ${pickNamed(category, 'level2', language)}` : '—'}
        businessUnitPath={hierarchyPath(state.businessUnits, risk.businessUnitId, language)}
        ownerName={userName(risk.riskOwnerId)}
        actionOwnerNames={actionOwners.map(userName)}
        matrix={state.matrix}
        editable={editable}
        onEdit={() => {
          setEditing(true)
        }}
      />

      <div className="risk-view__tabs" role="tablist" aria-label={t('page.risk.title')}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`risk-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`risk-panel-${tab.id}`}
            className="risk-view__tab"
            onClick={() => {
              setActiveTab(tab.id)
            }}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div
        className="risk-view__panel"
        role="tabpanel"
        id={`risk-panel-${activeTab}`}
        aria-labelledby={`risk-tab-${activeTab}`}
      >
        {activeTab === 'overview' ? (
          <OverviewTab risk={risk} userName={userName} today={today} />
        ) : null}
        {activeTab === 'assessment' ? <AssessmentTab risk={risk} matrix={state.matrix} userName={userName} /> : null}
        {activeTab === 'controls' ? <ControlsTab risk={risk} userName={userName} /> : null}
        {activeTab === 'actions' ? <ActionsTab risk={risk} userName={userName} today={today} /> : null}
        {activeTab === 'trend' ? <TrendAuditTab risk={risk} userName={userName} /> : null}
      </div>

      {editing ? (
        <RiskEditorModal
          risk={risk}
          onClose={() => {
            setEditing(false)
          }}
        />
      ) : null}
    </section>
  )
}

// --- header -----------------------------------------------------------------

function RiskHeader(props: {
  risk: Risk
  categoryLabel: string
  businessUnitPath: string
  ownerName: string
  actionOwnerNames: string[]
  matrix: Parameters<typeof assess>[1]
  editable: boolean
  onEdit: () => void
}) {
  const { t } = useTranslation()
  const { risk } = props

  return (
    <header className="risk-header">
      <div className="risk-header__identity">
        <p className="risk-header__ref">{risk.ref}</p>
        <h1 id="risk-title">{risk.title}</h1>
        <p className="risk-header__context">
          {props.categoryLabel} · {props.businessUnitPath}
        </p>
      </div>

      <dl className="risk-header__meta">
        <div>
          <dt>{t('view.header.owner')}</dt>
          <dd>{props.ownerName}</dd>
        </div>
        <div>
          <dt>{t('view.header.actionOwners')}</dt>
          <dd>{props.actionOwnerNames.length > 0 ? props.actionOwnerNames.join(', ') : t('view.header.none')}</dd>
        </div>
        <div>
          <dt>{t('view.header.targetDate')}</dt>
          <dd>{risk.targetDate}</dd>
        </div>
        <div>
          <dt>{t('view.header.status')}</dt>
          <dd>{risk.status}</dd>
        </div>
      </dl>

      <div className="risk-header__scores">
        {(['inherent', 'residual', 'target'] as const).map((kind) => (
          <div key={kind} className="risk-header__score">
            <span className="risk-header__score-label">{t(`editor.assessment.${kind}` as TranslationKey)}</span>
            <RatingChip
              score={risk[kind]}
              matrix={props.matrix}
              variant="detailed"
              label={t(`editor.assessment.${kind}` as TranslationKey)}
            />
          </div>
        ))}
      </div>

      {props.editable ? (
        <button type="button" className="risk-header__edit" onClick={props.onEdit}>
          {t('view.edit')}
        </button>
      ) : null}
    </header>
  )
}

// --- overview ---------------------------------------------------------------

function OverviewTab({
  risk,
  userName,
  today,
}: {
  risk: Risk
  userName: (id: string) => string
  today: string
}) {
  const { t } = useTranslation()

  const trend = historicalTrend(risk.history)
  const direction = directionToTarget(risk.residual, risk.target)

  return (
    <div className="risk-view__stack">
      <div className="risk-view__cards">
        {(['cause', 'event', 'consequence'] as const).map((field) => (
          <article key={field} className="panel">
            <h2>{t(`risk.${field}` as TranslationKey)}</h2>
            <p>{risk[field]}</p>
          </article>
        ))}
      </div>

      {risk.statusNarrative.trim().length > 0 ? (
        <article className="panel">
          <h2>{t('view.overview.narrative')}</h2>
          <p>{risk.statusNarrative}</p>
        </article>
      ) : null}

      <dl className="risk-view__facts">
        <div>
          <dt>{t('view.overview.response')}</dt>
          <dd>{risk.responseType}</dd>
        </div>
        <div>
          <dt>{t('view.overview.reviewDate')}</dt>
          <dd>{risk.reviewDate}</dd>
        </div>
        <div>
          <dt>{t('view.overview.riskType')}</dt>
          <dd>{risk.type}</dd>
        </div>
      </dl>

      {/*
       * Three separate indicators. Historical Trend and Direction to Target are
       * computed; Outlook is management judgement and is never overwritten by
       * either of them (ARCHITECTURE.md §7.1).
       */}
      <div className="risk-view__indicators">
        <article className="panel">
          <h2>{t('view.indicator.historicalTrend')}</h2>
          <p className="risk-view__indicator-value">{t(`trend.${trend}` as TranslationKey)}</p>
        </article>
        <article className="panel">
          <h2>{t('view.indicator.directionToTarget')}</h2>
          <p className="risk-view__indicator-value">{t(`direction.${direction}` as TranslationKey)}</p>
        </article>
        <article className="panel">
          <h2>{t('view.indicator.outlook')}</h2>
          <p className="risk-view__indicator-value">{risk.outlook}</p>
          <p className="panel__meta">{t('view.indicator.outlookHint')}</p>
        </article>
      </div>

      <article className="panel">
        <h2>{t('view.overview.controlsSummary')}</h2>
        {risk.controls.length === 0 ? (
          <p className="panel__meta">{t('view.overview.noControls')}</p>
        ) : (
          <ul className="risk-view__control-summary">
            {risk.controls.map((control) => (
              <li key={control.id}>
                <strong>{control.title}</strong>
                <span className="panel__meta">
                  {userName(control.ownerId)} · {control.type} · {control.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>

      {/* Overview action table columns are fixed by an explicit change request. */}
      <article className="panel">
        <h2>{t('view.overview.actionsSummary')}</h2>
        {risk.actions.length === 0 ? (
          <p className="panel__meta">{t('view.overview.noActions')}</p>
        ) : (
          <div className="scroll-x">
            <table className="risk-view__table">
              <thead>
                <tr>
                  <th scope="col">{t('editor.action.title')}</th>
                  <th scope="col">{t('view.actions.description')}</th>
                  <th scope="col">{t('view.actions.deliverable')}</th>
                  <th scope="col">{t('register.column.status')}</th>
                  <th scope="col">{t('view.actions.deadline')}</th>
                  <th scope="col">{t('editor.action.owner')}</th>
                </tr>
              </thead>
              <tbody>
                {risk.actions.map((action) => (
                  <tr key={action.id}>
                    <td>{action.title}</td>
                    <td>{action.description}</td>
                    <td>{action.deliverable}</td>
                    <td>
                      {action.status}
                      {isActionOverdue(action, today) ? (
                        <span className="risk-view__overdue"> {t('view.actions.overdue')}</span>
                      ) : null}
                    </td>
                    <td>{action.dueDate}</td>
                    <td>{userName(action.ownerId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {/* Acceptance summary appears only for an Accept response. */}
      {risk.responseType === 'Accept' ? (
        <article className="panel">
          <h2>{t('view.acceptance.title')}</h2>
          <p>{risk.acceptance.rationale}</p>
          <dl className="risk-view__facts">
            <div>
              <dt>{t('view.acceptance.initiator')}</dt>
              <dd>{risk.acceptance.initiatorId ? userName(risk.acceptance.initiatorId) : '—'}</dd>
            </div>
            <div>
              <dt>{t('editor.acceptance.approver')}</dt>
              <dd>{risk.acceptance.approverId ? userName(risk.acceptance.approverId) : '—'}</dd>
            </div>
            <div>
              <dt>{t('editor.acceptance.approvalDate')}</dt>
              <dd>{risk.acceptance.approvalDate || '—'}</dd>
            </div>
            <div>
              <dt>{t('editor.acceptance.validUntil')}</dt>
              <dd>{risk.acceptance.validUntil || '—'}</dd>
            </div>
            <div>
              <dt>{t('view.acceptance.reviewDate')}</dt>
              <dd>{risk.acceptance.reviewDate || '—'}</dd>
            </div>
          </dl>
        </article>
      ) : null}
    </div>
  )
}

// --- assessment -------------------------------------------------------------

function AssessmentTab({
  risk,
  matrix,
  userName,
}: {
  risk: Risk
  matrix: Parameters<typeof assess>[1]
  userName: (id: string) => string
}) {
  const { t } = useTranslation()

  return (
    <div className="risk-view__stack">
      <div className="risk-view__assessments">
        {(['inherent', 'residual', 'target'] as const).map((kind) => {
          const label = t(`editor.assessment.${kind}` as TranslationKey)
          return (
            <article key={kind} className="panel">
              <h2>{label}</h2>
              <RatingChip score={risk[kind]} matrix={matrix} variant="detailed" label={label} />
              <AssessmentMatrix score={risk[kind]} matrix={matrix} label={label} />
            </article>
          )
        })}
      </div>

      <article className="panel">
        <h2>{t('view.assessment.residualTrend')}</h2>
        <ResidualTrendChart history={risk.history} />
      </article>

      <article className="panel">
        <h2>{t('view.assessment.history')}</h2>
        {risk.history.length === 0 ? (
          <p className="panel__meta">{t('view.assessment.noHistory')}</p>
        ) : (
          <div className="scroll-x">
            <table className="risk-view__table">
              <thead>
                <tr>
                  <th scope="col">{t('view.assessment.date')}</th>
                  <th scope="col">{t('editor.assessment.inherent')}</th>
                  <th scope="col">{t('editor.assessment.residual')}</th>
                  <th scope="col">{t('editor.assessment.target')}</th>
                  <th scope="col">{t('view.assessment.actor')}</th>
                  <th scope="col">{t('view.assessment.note')}</th>
                </tr>
              </thead>
              <tbody>
                {risk.history.map((item) => (
                  <tr key={item.id}>
                    <td>{item.date}</td>
                    <td>{assess(item.inherent, matrix).score}</td>
                    <td>{assess(item.residual, matrix).score}</td>
                    <td>{assess(item.target, matrix).score}</td>
                    <td>{userName(item.actorId)}</td>
                    <td>{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </div>
  )
}

// --- controls ---------------------------------------------------------------

function ControlsTab({ risk, userName }: { risk: Risk; userName: (id: string) => string }) {
  const { t } = useTranslation()

  if (risk.controls.length === 0) {
    return <p className="panel__meta">{t('view.overview.noControls')}</p>
  }

  return (
    <div className="risk-view__stack">
      {risk.controls.map((control) => (
        <article key={control.id} className="panel">
          <h2>{control.title}</h2>
          <p>{control.description}</p>
          <dl className="risk-view__facts">
            <div>
              <dt>{t('editor.control.owner')}</dt>
              <dd>{userName(control.ownerId)}</dd>
            </div>
            <div>
              <dt>{t('view.controls.performer')}</dt>
              <dd>{control.performer || '—'}</dd>
            </div>
            <div>
              <dt>{t('view.controls.frequency')}</dt>
              <dd>{control.frequency || '—'}</dd>
            </div>
            <div>
              <dt>{t('editor.control.effectiveness')}</dt>
              <dd>{control.status}</dd>
            </div>
            <div>
              <dt>{t('register.column.category')}</dt>
              <dd>{control.type} · {control.automation}</dd>
            </div>
            <div>
              <dt>{t('view.controls.evidence')}</dt>
              <dd>{control.evidenceLocation || '—'}</dd>
            </div>
            <div>
              <dt>{t('view.controls.intendedOutcome')}</dt>
              <dd>{control.intendedOutcome || '—'}</dd>
            </div>
            <div>
              <dt>{t('view.controls.keyControl')}</dt>
              <dd>{control.keyControl ? '✓' : '—'}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  )
}

// --- actions ----------------------------------------------------------------

function ActionsTab({
  risk,
  userName,
  today,
}: {
  risk: Risk
  userName: (id: string) => string
  today: string
}) {
  const { t } = useTranslation()

  if (risk.actions.length === 0) {
    return <p className="panel__meta">{t('view.overview.noActions')}</p>
  }

  return (
    <div className="risk-view__stack">
      {risk.actions.map((action) => (
        <article key={action.id} className="panel">
          <h2>{action.title}</h2>
          <p>{action.description}</p>
          <dl className="risk-view__facts">
            <div>
              <dt>{t('view.actions.deliverable')}</dt>
              <dd>{action.deliverable || '—'}</dd>
            </div>
            <div>
              <dt>{t('editor.action.owner')}</dt>
              <dd>{userName(action.ownerId)}</dd>
            </div>
            <div>
              <dt>{t('view.actions.deadline')}</dt>
              <dd>
                {action.dueDate}
                {isActionOverdue(action, today) ? (
                  <span className="risk-view__overdue"> {t('view.actions.overdue')}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>{t('register.column.status')}</dt>
              <dd>{action.status}</dd>
            </div>
            <div>
              <dt>{t('editor.action.progress')}</dt>
              <dd>
                <progress value={action.progress} max={100} /> {action.progress}%
              </dd>
            </div>
          </dl>
          {action.notes.trim().length > 0 ? <p className="panel__meta">{action.notes}</p> : null}
        </article>
      ))}
    </div>
  )
}

// --- trend & audit ----------------------------------------------------------

function TrendAuditTab({ risk, userName }: { risk: Risk; userName: (id: string) => string }) {
  const { t } = useTranslation()

  return (
    <div className="risk-view__stack">
      <article className="panel">
        <h2>{t('view.assessment.history')}</h2>
        <ResidualTrendChart history={risk.history} />
      </article>

      <article className="panel">
        <h2>{t('view.audit.title')}</h2>
        {risk.audit.length === 0 ? (
          <p className="panel__meta">{t('view.audit.noEvents')}</p>
        ) : (
          <div className="scroll-x">
            {/* Newest first — the store prepends (ARCHITECTURE.md §3.6). */}
            <table className="risk-view__table">
              <thead>
                <tr>
                  <th scope="col">{t('view.audit.when')}</th>
                  <th scope="col">{t('view.audit.who')}</th>
                  <th scope="col">{t('view.audit.what')}</th>
                  <th scope="col">{t('view.audit.changes')}</th>
                </tr>
              </thead>
              <tbody>
                {risk.audit.map((event) => (
                  <tr key={event.id}>
                    <td>{event.date}</td>
                    <td>{userName(event.actorId)}</td>
                    <td>
                      <strong>{event.action}</strong>
                      <span className="risk-view__audit-summary">{event.summary}</span>
                    </td>
                    <td>
                      {event.changes && event.changes.length > 0 ? (
                        <ul className="risk-view__changes">
                          {event.changes.map((change) => (
                            <li key={change}>{change}</li>
                          ))}
                        </ul>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </div>
  )
}
