import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppData } from '../../data/app-data-context.ts'
import { hierarchyPath } from '../../domain/business-units/index.ts'
import { displayActionStatus, isActionOverdue } from '../../domain/actions/index.ts'
import { canEditRisk, canSeeRisk } from '../../domain/permissions/index.ts'
import { assess, impactLabel, likelihoodLabel } from '../../domain/risk-engine/index.ts'
import { isRiskOverdue } from '../../domain/risks/index.ts'
import { directionToTarget, historicalTrend } from '../../domain/trend/index.ts'
import type { AssessmentType, Outlook, RatingMatrix, Risk, Trend } from '../../domain/types/index.ts'
import { pickNamed, useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { IconChevronLeft, IconList, IconPencil, IconTrend } from '../../ui/icons.tsx'
import { initialsOf } from '../../ui/initials.ts'
import { StatusPill } from '../../ui/status-pill.tsx'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { RatingChip } from '../../ui/rating-chip.tsx'
import { RiskEditorModal } from '../risk-editor/risk-editor-modal.tsx'
import { AssessmentMatrix } from './assessment-matrix.tsx'
import { MatrixGuidance } from './matrix-guidance.tsx'
import { ResidualTrendChart } from './residual-trend-chart.tsx'
import './risk-view.css'

/*
 * Individual Risk View (ARCHITECTURE.md §8.2).
 *
 * Dark hero band plus five tabs: Overview, Assessment, Controls, Actions,
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

const ASSESSMENTS = ['inherent', 'residual', 'target'] as const

const TREND_DIRECTION: Record<Trend, 'up' | 'down' | 'flat'> = {
  New: 'flat',
  Improving: 'down',
  Worsening: 'up',
  Stable: 'flat',
}

const OUTLOOK_DIRECTION: Record<Outlook, 'up' | 'down' | 'flat'> = {
  Increasing: 'up',
  Stable: 'flat',
  Decreasing: 'down',
}

/** Icon-based empty state, so an empty collection never reads as a broken panel. */
function EmptyState({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        <IconList />
      </span>
      <p>{message}</p>
    </div>
  )
}

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
    <section aria-labelledby="risk-title" className="risk-view">
      <div className="risk-view__top">
        <Link to="/app/register" className="risk-view__back">
          <IconChevronLeft size={14} />
          {t('view.backToRegister')}
        </Link>

        {editable ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setEditing(true)
            }}
          >
            <IconPencil size={14} />
            {t('view.edit')}
          </button>
        ) : null}
      </div>

      <RiskHero
        risk={risk}
        categoryLabel={category ? `${pickNamed(category, 'level1', language)} / ${pickNamed(category, 'level2', language)}` : '—'}
        businessUnitPath={hierarchyPath(state.businessUnits, risk.businessUnitId, language)}
        ownerName={userName(risk.riskOwnerId)}
        actionOwnerNames={actionOwners.map(userName)}
        matrix={state.matrix}
        today={today}
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

// --- hero band --------------------------------------------------------------

/** One KPI column of the strip under the hero band. */
function ScoreKpi({
  kind,
  risk,
  matrix,
}: {
  kind: AssessmentType
  risk: Risk
  matrix: RatingMatrix
}) {
  const { t } = useTranslation()
  const label = t(`editor.assessment.${kind}` as TranslationKey)
  const view = assess(risk[kind], matrix)

  return (
    <div className="risk-hero__kpi risk-hero__kpi--score" style={{ borderTopColor: view.color }}>
      <dt>{label}</dt>
      <dd>
        {/* One badge carries score, rating and I×L — the same one the register
            uses, at the same size. */}
        <RatingChip score={risk[kind]} matrix={matrix} label={label} />
      </dd>
    </div>
  )
}

function RiskHero(props: {
  risk: Risk
  categoryLabel: string
  businessUnitPath: string
  ownerName: string
  actionOwnerNames: string[]
  matrix: RatingMatrix
  today: string
}) {
  const { t } = useTranslation()
  const { risk } = props
  const overdue = isRiskOverdue(risk, props.today)

  return (
    <header className="risk-hero">
      <div className="risk-hero__band">
        <span className="risk-hero__code">{risk.ref}</span>
        <div className="risk-hero__identity">
          <h1 id="risk-title">{risk.title}</h1>
          <p className="risk-hero__context">
            {props.categoryLabel} · {props.businessUnitPath}
          </p>
        </div>
        <StatusPill status={risk.status} className="risk-hero__status" />
      </div>

      <dl className="risk-hero__kpis">
        <div className="risk-hero__kpi">
          <dt>{t('view.header.owner')}</dt>
          <dd>
            <span className="risk-hero__person">
              <span className="avatar" aria-hidden="true">
                {initialsOf(props.ownerName)}
              </span>
              {props.ownerName}
            </span>
          </dd>
        </div>

        <div className="risk-hero__kpi">
          <dt>{t('view.header.actionOwners')}</dt>
          <dd>
            {props.actionOwnerNames.length > 0 ? (
              <>
                <span className="risk-hero__person">
                  <span className="avatar" aria-hidden="true">
                    {initialsOf(props.actionOwnerNames[0])}
                  </span>
                  {props.actionOwnerNames.join(', ')}
                </span>
                <span className="risk-hero__meta">
                  {props.actionOwnerNames.length} {t('view.header.actorCount')}
                </span>
              </>
            ) : (
              t('view.header.none')
            )}
          </dd>
        </div>

        {ASSESSMENTS.map((kind) => (
          <ScoreKpi key={kind} kind={kind} risk={risk} matrix={props.matrix} />
        ))}

        <div className="risk-hero__kpi">
          <dt>{t('view.header.targetDate')}</dt>
          <dd>
            <span className="risk-hero__date">{risk.targetDate}</span>
            {overdue ? <span className="risk-view__overdue">{t('view.overdue')}</span> : null}
          </dd>
        </div>
      </dl>
    </header>
  )
}

// --- overview ---------------------------------------------------------------

/** Trend chip. The label is part of the accessible name, never colour alone. */
function SignalChip({
  label,
  value,
  direction,
}: {
  label: string
  value: string
  direction: 'up' | 'down' | 'flat'
}) {
  return (
    <span className={`signal-chip signal-chip--${direction}`} aria-label={`${label}: ${value}`}>
      <IconTrend direction={direction} size={14} />
      {value}
    </span>
  )
}

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
  const directionArrow = direction === 'decreasingToTarget' ? 'down' : direction === 'increasing' ? 'up' : 'flat'

  return (
    <div className="risk-view__stack">
      <div className="risk-view__split">
        <article className="panel risk-structured">
          <header className="risk-structured__head">
            <h2>{t('view.overview.structured')}</h2>
            <p className="panel__meta">{t('view.overview.structuredHint')}</p>
          </header>

          {/*
            * The manual description, in full: never clamped here, and the
            * line breaks the author typed are preserved (CR-002).
            */}
          <div className="risk-structured__description">
            <h3>{t('view.overview.description')}</h3>
            {risk.description.trim().length > 0 ? (
              <p>{risk.description}</p>
            ) : (
              <p className="risk-structured__empty">{t('view.overview.noDescription')}</p>
            )}
          </div>

          <div className="risk-structured__cards">
            {(['cause', 'event', 'consequence'] as const).map((field, position) => (
              <section key={field} className="risk-structured__card">
                <span className="risk-structured__step" aria-hidden="true">
                  {String(position + 1).padStart(2, '0')}
                </span>
                <h3>{t(`risk.${field}` as TranslationKey)}</h3>
                <p>{risk[field]}</p>
              </section>
            ))}
          </div>
        </article>

        <article className="panel risk-narrative">
          <header className="risk-narrative__head">
            <h2>{t('view.overview.narrative')}</h2>
            <p className="panel__meta">{risk.updatedAt.slice(0, 10)}</p>
          </header>

          <p className="risk-narrative__body">
            {risk.statusNarrative.trim().length > 0
              ? risk.statusNarrative
              : t('view.overview.narrativeEmpty')}
          </p>

          {/*
           * Three separate indicators. Historical Trend and Direction to Target
           * are computed; Outlook is management judgement and is never
           * overwritten by either of them (ARCHITECTURE.md §7.1).
           */}
          <div className="risk-narrative__chips">
            <SignalChip
              label={t('view.indicator.historicalTrend')}
              value={t(`trend.${trend}` as TranslationKey)}
              direction={TREND_DIRECTION[trend]}
            />
            <SignalChip
              label={t('view.indicator.directionToTarget')}
              value={t(`direction.${direction}` as TranslationKey)}
              direction={directionArrow}
            />
            <SignalChip
              label={t('view.indicator.outlook')}
              value={risk.outlook}
              direction={OUTLOOK_DIRECTION[risk.outlook]}
            />
          </div>

          <dl className="risk-narrative__facts">
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
        </article>
      </div>

      <article className="panel">
        <header className="risk-view__card-head">
          <h2>{t('view.overview.controlsSummary')}</h2>
          <p className="panel__meta">
            {risk.controls.length} {t('view.overview.controlsCount')}
          </p>
        </header>
        {risk.controls.length === 0 ? (
          <EmptyState message={t('view.overview.noControls')} />
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
          <EmptyState message={t('view.overview.noActions')} />
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
                      <StatusPill status={displayActionStatus(action, today)} />
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
  matrix: RatingMatrix
  userName: (id: string) => string
}) {
  const { t, language } = useTranslation()

  return (
    <div className="risk-view__stack">
      <div className="risk-view__assessments">
        {ASSESSMENTS.map((kind) => {
          const label = t(`editor.assessment.${kind}` as TranslationKey)
          const view = assess(risk[kind], matrix)

          return (
            <article key={kind} className="panel assessment-card">
              <header className="assessment-card__head">
                <h2>{label}</h2>
              </header>
              <RatingChip score={risk[kind]} matrix={matrix} label={label} />
              <p className="assessment-card__descriptor">
                {impactLabel(view.impact, matrix, language)} × {likelihoodLabel(view.likelihood, matrix, language)}
              </p>
              <AssessmentMatrix score={risk[kind]} matrix={matrix} label={label} />
            </article>
          )
        })}
      </div>

      <MatrixGuidance matrix={matrix} />

      <article className="panel">
        <h2>{t('view.assessment.residualTrend')}</h2>
        <ResidualTrendChart history={risk.history} />
      </article>

      <article className="panel">
        <h2>{t('view.assessment.history')}</h2>
        {risk.history.length === 0 ? (
          <EmptyState message={t('view.assessment.noHistory')} />
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
                  <th scope="col">{t('view.assessment.matrixVersion')}</th>
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
                    {/*
                      * The configuration this snapshot was recorded against.
                      * Older snapshots predate versioning and say so (CR-003).
                      */}
                    <td>{item.matrixVersion === undefined ? '—' : `v${String(item.matrixVersion)}`}</td>
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
    return <EmptyState message={t('view.overview.noControls')} />
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
    return <EmptyState message={t('view.overview.noActions')} />
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
          <EmptyState message={t('view.audit.noEvents')} />
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
