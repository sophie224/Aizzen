import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import { flattenTree } from '../../domain/business-units/index.ts'
import { mergeAuthorisedRiskUpdate } from '../../domain/permissions/index.ts'
import { nextRiskReference } from '../../domain/reference/index.ts'
import {
  createDraftRisk,
  ownerCandidates,
  prepareSave,
  RISK_DESCRIPTION_MAX_LENGTH,
  type ValidationError,
} from '../../domain/risk-editor/index.ts'
import {
  assess,
  impactDescription,
  impactOptionLabel,
  likelihoodDescription,
  likelihoodOptionLabel,
} from '../../domain/risk-engine/index.ts'
import {
  ACTION_PRIORITIES,
  ACTION_STATUSES,
  CONTROL_AUTOMATION,
  CONTROL_EFFECTIVENESS,
  CONTROL_TYPES,
  OUTLOOKS,
  RESPONSE_TYPES,
  RISK_STATUSES,
  RISK_TYPES,
  SCALE_VALUES,
} from '../../domain/types/enums.ts'
import type {
  AssessmentType,
  Control,
  RatingMatrix,
  RemediationAction,
  Risk,
  Score,
  ScaleValue,
} from '../../domain/types/index.ts'
import { pickNamed, useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { IconClose, IconPlus, IconSave, IconTrash } from '../../ui/icons.tsx'
import { initialsOf } from '../../ui/initials.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { AssessmentMatrix } from '../risk-view/assessment-matrix.tsx'
import { MatrixGuidance } from '../risk-view/matrix-guidance.tsx'
import { RatingChip } from '../register/rating-chip.tsx'
import './risk-editor.css'

/*
 * Risk Editor (ARCHITECTURE.md §8.2).
 *
 * Works on a CLONED DRAFT. Cancel and close persist nothing; the repository is
 * only touched after a successful Save. The save itself runs the documented
 * workflow through the pure `prepareSave`, then the field-level merge so a
 * Control or Action Owner cannot smuggle changes past their permissions.
 */

const TABS = [
  { id: 'basic', labelKey: 'editor.tab.basic' },
  { id: 'description', labelKey: 'editor.tab.description' },
  { id: 'assessments', labelKey: 'editor.tab.assessments' },
  { id: 'controls', labelKey: 'editor.tab.controls' },
  { id: 'actions', labelKey: 'editor.tab.actions' },
  { id: 'custom', labelKey: 'editor.tab.custom' },
] as const satisfies readonly { id: string; labelKey: TranslationKey }[]

type TabId = (typeof TABS)[number]['id']

const ASSESSMENTS = ['inherent', 'residual', 'target'] as const

/** IDs are generated at the edge; the domain stays deterministic. */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export interface RiskEditorModalProps {
  /** The risk being edited, or null to create a new one. */
  risk: Risk | null
  onClose: () => void
  onSaved?: (risk: Risk) => void
}

/**
 * Readiness gate.
 *
 * The inner editor initialises its draft in a `useState` initialiser, which
 * requires AppState and the signed-in user to already exist. Splitting the
 * check out keeps that initialisation synchronous — deriving the draft in an
 * effect would cause a cascading render.
 */
export function RiskEditorModal(props: RiskEditorModalProps) {
  const { state } = useAppData()
  const { user, context } = useCurrentUser()

  if (!state || !user) return null

  return <RiskEditor {...props} state={state} user={user} context={context} />
}

interface RiskEditorProps extends RiskEditorModalProps {
  state: NonNullable<ReturnType<typeof useAppData>['state']>
  user: NonNullable<ReturnType<typeof useCurrentUser>['user']>
  context: ReturnType<typeof useCurrentUser>['context']
}

function RiskEditor({ risk, onClose, onSaved, state, user, context }: RiskEditorProps) {
  const { t, language } = useTranslation()
  const store = useAppDataStore()

  const [activeTab, setActiveTab] = useState<TabId>('basic')
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [saving, setSaving] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  const isNew = risk === null

  /*
   * The clone is taken ONCE, when the dialog opens. Every edit lands on this
   * copy; the stored record is untouched until Save succeeds, which is what
   * makes Cancel a genuine no-op (ARCHITECTURE.md §8.2).
   */
  const [draft, setDraft] = useState<Risk>(() =>
    risk
      ? structuredClone(risk)
      : createDraftRisk({
          currentUser: user,
          users: state.users,
          categories: state.categories,
          businessUnits: state.businessUnits,
          customAttributes: state.customAttributes,
          risks: state.risks,
          today: new Date().toISOString().slice(0, 10),
          id: generateId('risk'),
        }),
  )

  /*
   * Dirty-state check. The draft is compared against the snapshot taken when
   * the dialog opened, so closing with unsaved edits asks first — and closing
   * an untouched dialog stays a single click (CR-002).
   */
  // Captured once, on mount, and never updated — the baseline for "dirty".
  const [openedWith] = useState(() => JSON.stringify(draft))
  const isDirty = JSON.stringify(draft) !== openedWith

  const requestClose = () => {
    if (isDirty) setConfirmingClose(true)
    else onClose()
  }

  // Escape closes without persisting, matching Cancel.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (JSON.stringify(draft) === openedWith) onClose()
      else setConfirmingClose(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, draft, openedWith])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  const units = useMemo(
    () => (state ? flattenTree(state.businessUnits, { includeInactive: false }) : []),
    [state],
  )

  const update = (patch: Partial<Risk>) => {
    setDraft((current) => ({ ...current, ...patch }))
  }

  /**
   * Changing the Business Unit recalculates the reference — but ONLY on a new
   * risk. An existing reference is never renumbered (ARCHITECTURE.md §7.2).
   */
  const changeBusinessUnit = (businessUnitId: string) => {
    if (isNew) {
      update({
        businessUnitId,
        ref: nextRiskReference(businessUnitId, state.businessUnits, state.risks),
      })
    } else {
      update({ businessUnitId })
    }
  }

  const errorFor = (field: string) => errors.find((error) => error.field === field)

  const handleSave = async () => {
    setSaving(true)

    // Gate 5 before anything else: never trust the submitted record wholesale.
    const authorised = risk ? mergeAuthorisedRiskUpdate(context, risk, draft) : draft

    const result = prepareSave({
      original: risk,
      draft: authorised,
      actorId: user.id,
      today: new Date().toISOString().slice(0, 10),
      now: new Date().toISOString(),
      historyId: generateId('hist'),
      generatedRef: nextRiskReference(authorised.businessUnitId, state.businessUnits, state.risks),
      matrixVersion: state.matrix.version,
    })

    if (!result.ok) {
      setErrors(result.errors)
      setSaving(false)
      return
    }

    setErrors([])

    try {
      await store.update({
        mutate: (nextState) => {
          const index = nextState.risks.findIndex((candidate) => candidate.id === result.risk.id)
          if (index >= 0) nextState.risks[index] = result.risk
          else nextState.risks.push(result.risk)
        },
        audit: {
          actorId: user.id,
          action: result.action,
          entityType: 'Risk',
          entityId: result.risk.id,
          summary: `${result.risk.ref} ${result.risk.title}`,
          changes: result.changes,
        },
      })
      onSaved?.(result.risk)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const tabCount = (id: TabId): number | null => {
    if (id === 'controls') return draft.controls.length
    if (id === 'actions') return draft.actions.length
    return null
  }

  return (
    <div className="editor-backdrop">
      <div
        className="editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="editor-dialog__header">
          <div className="editor-dialog__identity">
            <p className="editor-dialog__ref">{draft.ref}</p>
            <h2 id="editor-title">{t(isNew ? 'editor.newTitle' : 'editor.editTitle')}</h2>
          </div>
          <button
            type="button"
            className="editor-dialog__close"
            aria-label={t('editor.close')}
            title={t('action.close')}
            onClick={requestClose}
          >
            <IconClose />
          </button>
        </header>

        {errors.length > 0 ? (
          <div className="editor-errors" role="alert">
            <p>{t('editor.errorSummary')}</p>
            <ul>
              {errors.map((error) => (
                <li key={error.field}>{t(error.messageKey as TranslationKey)}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="editor-tabs" role="tablist" aria-label={t('editor.editTitle')}>
          {TABS.map((tab) => {
            const count = tabCount(tab.id)
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                className="editor-tabs__tab"
                onClick={() => {
                  setActiveTab(tab.id)
                }}
              >
                {t(tab.labelKey)}
                {count !== null ? (
                  // Decorative: the count duplicates the list the tab opens, so
                  // it stays out of the tab's accessible name.
                  <span className="editor-tabs__count" aria-hidden="true">
                    {count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        <div
          className="editor-panel"
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
        >
          {activeTab === 'basic' ? (
            <section className="editor-section">
              <header className="editor-section__head">
                <h3>{t('editor.tab.basic')}</h3>
                <p>{t('editor.section.basicHint')}</p>
              </header>

              <div className="editor-grid">
                <label>
                  <span>{t('editor.field.code')}</span>
                  {/* The business reference is generated, never hand-edited. */}
                  <input value={draft.ref} readOnly />
                </label>

                <label>
                  <span>{t('editor.field.type')}</span>
                  <select
                    value={draft.type}
                    onChange={(event) => {
                      update({ type: event.target.value as Risk['type'] })
                    }}
                  >
                    {RISK_TYPES.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>{t('editor.field.status')}</span>
                  <select
                    value={draft.status}
                    onChange={(event) => {
                      update({ status: event.target.value as Risk['status'] })
                    }}
                  >
                    {RISK_STATUSES.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>

                <label className="editor-grid__full">
                  <span>{t('editor.field.title')}</span>
                  <input
                    value={draft.title}
                    aria-invalid={errorFor('title') !== undefined}
                    onChange={(event) => {
                      update({ title: event.target.value })
                    }}
                  />
                </label>

                <label>
                  <span>{t('editor.field.category')}</span>
                  <select
                    value={draft.categoryId}
                    aria-invalid={errorFor('categoryId') !== undefined}
                    onChange={(event) => {
                      update({ categoryId: event.target.value })
                    }}
                  >
                    <option value="">—</option>
                    {state.categories
                      .filter((category) => category.active || category.id === draft.categoryId)
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {pickNamed(category, 'level1', language)} / {pickNamed(category, 'level2', language)}
                        </option>
                      ))}
                  </select>
                </label>

                {/*
                  * Helper text sits OUTSIDE the label: inside it, it would be
                  * folded into the field's accessible name.
                  */}
                <div className="editor-field">
                  <label>
                    <span>{t('editor.field.businessUnit')}</span>
                    <select
                      value={draft.businessUnitId}
                      onChange={(event) => {
                        changeBusinessUnit(event.target.value)
                      }}
                    >
                      {units.map(({ unit, depth }) => (
                        <option key={unit.id} value={unit.id}>
                          {`${' '.repeat(depth * 2)}${pickNamed(unit, 'name', language)}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <small>{t('editor.hint.businessUnitScope')}</small>
                </div>

                <label>
                  <span>{t('editor.field.riskOwner')}</span>
                  <select
                    value={draft.riskOwnerId}
                    aria-invalid={errorFor('riskOwnerId') !== undefined}
                    onChange={(event) => {
                      update({ riskOwnerId: event.target.value })
                    }}
                  >
                    <option value="">—</option>
                    {ownerCandidates(state.users, state.businessUnits, draft.businessUnitId, 'role_risk_owner').map(
                      (candidate) => (
                        <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                      ),
                    )}
                  </select>
                </label>

                <label>
                  <span>{t('editor.field.originDate')}</span>
                  <input type="date" value={draft.originDate} onChange={(event) => { update({ originDate: event.target.value }) }} />
                </label>
                <label>
                  <span>{t('editor.field.reviewDate')}</span>
                  <input type="date" value={draft.reviewDate} onChange={(event) => { update({ reviewDate: event.target.value }) }} />
                </label>
                <label>
                  <span>{t('editor.field.targetDate')}</span>
                  <input type="date" value={draft.targetDate} onChange={(event) => { update({ targetDate: event.target.value }) }} />
                </label>

                <label>
                  <span>{t('editor.field.response')}</span>
                  <select
                    value={draft.responseType}
                    onChange={(event) => {
                      update({ responseType: event.target.value as Risk['responseType'] })
                    }}
                  >
                    {RESPONSE_TYPES.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>

                <div className="editor-field">
                  <label>
                    <span>{t('editor.field.outlook')}</span>
                    <select
                      value={draft.outlook}
                      onChange={(event) => {
                        update({ outlook: event.target.value as Risk['outlook'] })
                      }}
                    >
                      {OUTLOOKS.map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <small>{t('editor.hint.outlook')}</small>
                </div>

                {/* Acceptance is only meaningful for Accept / Accepted. */}
                {draft.responseType === 'Accept' || draft.status === 'Accepted' ? (
                  <fieldset className="editor-acceptance">
                    <legend>{t('editor.acceptance.legend')}</legend>
                    <label>
                      <span>{t('editor.acceptance.rationale')}</span>
                      <textarea
                        value={draft.acceptance.rationale}
                        aria-invalid={errorFor('acceptance.rationale') !== undefined}
                        onChange={(event) => {
                          update({ acceptance: { ...draft.acceptance, rationale: event.target.value } })
                        }}
                      />
                    </label>
                    <label>
                      <span>{t('editor.acceptance.approver')}</span>
                      <select
                        value={draft.acceptance.approverId}
                        aria-invalid={errorFor('acceptance.approverId') !== undefined}
                        onChange={(event) => {
                          update({ acceptance: { ...draft.acceptance, approverId: event.target.value } })
                        }}
                      >
                        <option value="">—</option>
                        {state.users.filter((candidate) => candidate.status === 'Active').map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{t('editor.acceptance.approvalDate')}</span>
                      <input
                        type="date"
                        value={draft.acceptance.approvalDate}
                        aria-invalid={errorFor('acceptance.approvalDate') !== undefined}
                        onChange={(event) => {
                          update({ acceptance: { ...draft.acceptance, approvalDate: event.target.value } })
                        }}
                      />
                    </label>
                    <label>
                      <span>{t('editor.acceptance.validUntil')}</span>
                      <input
                        type="date"
                        value={draft.acceptance.validUntil}
                        aria-invalid={errorFor('acceptance.validUntil') !== undefined}
                        onChange={(event) => {
                          update({ acceptance: { ...draft.acceptance, validUntil: event.target.value } })
                        }}
                      />
                    </label>
                  </fieldset>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeTab === 'description' ? (
            <section className="editor-section">
              <header className="editor-section__head">
                <h3>{t('editor.tab.description')}</h3>
                <p>{t('editor.section.descriptionHint')}</p>
              </header>

              <div className="editor-stack">
                {/*
                  * Manual free-text summary (CR-002). It sits above the
                  * numbered blocks but is entirely independent of them — it is
                  * never generated from cause / event / consequence.
                  */}
                <div className="editor-field">
                  <label>
                    <span>{t('editor.field.description')}</span>
                    <textarea
                      className="editor-description"
                      rows={4}
                      maxLength={RISK_DESCRIPTION_MAX_LENGTH}
                      value={draft.description}
                      onChange={(event) => {
                        update({ description: event.target.value })
                      }}
                    />
                  </label>
                  <div className="editor-field__foot">
                    <small>{t('editor.hint.description')}</small>
                    <small
                      className="editor-counter"
                      aria-label={`${String(draft.description.length)} / ${String(RISK_DESCRIPTION_MAX_LENGTH)} ${t('editor.counter.label')}`}
                    >
                      {draft.description.length} / {RISK_DESCRIPTION_MAX_LENGTH}
                    </small>
                  </div>
                </div>

                {(['cause', 'event', 'consequence'] as const).map((field, position) => (
                  <div key={field} className="editor-field">
                    {/* The step number stays out of the label's accessible name. */}
                    <span className="editor-step" aria-hidden="true">
                      {String(position + 1).padStart(2, '0')}
                    </span>
                    <label>
                      <span>{t(`risk.${field}` as TranslationKey)}</span>
                      <textarea
                        value={draft[field]}
                        aria-invalid={errorFor(field) !== undefined}
                        onChange={(event) => {
                          update({ [field]: event.target.value } as Partial<Risk>)
                        }}
                      />
                    </label>
                  </div>
                ))}
                <label>
                  <span>{t('editor.field.statusNarrative')}</span>
                  <textarea
                    value={draft.statusNarrative}
                    onChange={(event) => {
                      update({ statusNarrative: event.target.value })
                    }}
                  />
                </label>
              </div>
            </section>
          ) : null}

          {activeTab === 'assessments' ? (
            <section className="editor-section">
              <header className="editor-section__head">
                <h3>{t('editor.tab.assessments')}</h3>
                <p>{t('editor.section.assessmentsHint')}</p>
              </header>

              <div className="editor-assessments">
                {ASSESSMENTS.map((kind) => (
                  <AssessmentColumn
                    key={kind}
                    kind={kind}
                    score={draft[kind]}
                    matrix={state.matrix}
                    onChange={(score) => {
                      update({ [kind]: score } as Partial<Risk>)
                    }}
                  />
                ))}
              </div>

              <MatrixGuidance matrix={state.matrix} variant="bar" />
            </section>
          ) : null}

          {activeTab === 'controls' ? (
            <ControlsTab
              draft={draft}
              onChange={(controls) => {
                update({ controls })
              }}
              candidates={ownerCandidates(state.users, state.businessUnits, draft.businessUnitId, 'role_control_owner')}
            />
          ) : null}

          {activeTab === 'actions' ? (
            <ActionsTab
              draft={draft}
              onChange={(actions) => {
                update({ actions })
              }}
              candidates={ownerCandidates(state.users, state.businessUnits, draft.businessUnitId, 'role_action_owner')}
            />
          ) : null}

          {activeTab === 'custom' ? (
            <section className="editor-section">
              <header className="editor-section__head">
                <h3>{t('editor.tab.custom')}</h3>
              </header>
              <div className="editor-grid">
                {state.customAttributes
                  .filter((attribute) => attribute.active)
                  .map((attribute) => (
                    <label key={attribute.id}>
                      <span>{pickNamed(attribute, 'label', language)}</span>
                      {attribute.type === 'select' ? (
                        <select
                          value={String(draft.custom[attribute.id] ?? '')}
                          onChange={(event) => {
                            update({ custom: { ...draft.custom, [attribute.id]: event.target.value } })
                          }}
                        >
                          <option value="">—</option>
                          {attribute.options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={attribute.type === 'number' ? 'number' : attribute.type === 'date' ? 'date' : 'text'}
                          value={String(draft.custom[attribute.id] ?? '')}
                          onChange={(event) => {
                            const raw = event.target.value
                            update({
                              custom: {
                                ...draft.custom,
                                [attribute.id]: attribute.type === 'number' ? Number(raw) : raw,
                              },
                            })
                          }}
                        />
                      )}
                    </label>
                  ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* Closing with unsaved edits confirms in place rather than discarding. */}
        {confirmingClose ? (
          <p className="editor-unsaved" role="alert">
            <span>{t('editor.unsaved.title')}</span>
            <button type="button" className="btn" onClick={onClose}>
              {t('editor.unsaved.discard')}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setConfirmingClose(false)
              }}
            >
              {t('editor.unsaved.keep')}
            </button>
          </p>
        ) : null}

        <footer className="editor-dialog__footer">
          {/* Live score summary: derived from the engine on every keystroke. */}
          <p className="editor-summary" aria-label={t('editor.summary.flow')}>
            {ASSESSMENTS.map((kind, position) => (
              <span key={kind} className="editor-summary__item">
                {position > 0 ? (
                  <span className="editor-summary__arrow" aria-hidden="true">
                    ›
                  </span>
                ) : null}
                <span className="editor-summary__label">
                  {t(`editor.assessment.${kind}` as TranslationKey)}
                </span>
                <strong>{assess(draft[kind], state.matrix).score}</strong>
              </span>
            ))}
          </p>

          <div className="editor-dialog__buttons">
            {/* Cancel persists nothing — the draft is simply discarded. */}
            <button type="button" className="btn btn--ghost" onClick={requestClose}>
              {t('action.cancel')}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={saving}
              onClick={() => {
                void handleSave()
              }}
            >
              <IconSave size={14} />
              {t('action.save')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

// --- assessments ------------------------------------------------------------

/**
 * One assessment column: labelled dropdowns and an interactive matrix, kept in
 * sync. Score, rating and colour all come from the risk engine — the column
 * holds no rating logic of its own (ARCHITECTURE.md §7).
 */
function AssessmentColumn({
  kind,
  score,
  matrix,
  onChange,
}: {
  kind: AssessmentType
  score: Score
  matrix: RatingMatrix
  onChange: (score: Score) => void
}) {
  const { t, language } = useTranslation()
  const label = t(`editor.assessment.${kind}` as TranslationKey)
  const view = assess(score, matrix)

  /*
   * Option text, axis names and descriptions all come from the saved matrix
   * configuration (CR-003) — this column hard-codes no label of its own.
   */
  const impactTitle = (value: ScaleValue) =>
    [impactOptionLabel(value, matrix, language), impactDescription(value, matrix, language)]
      .filter(Boolean)
      .join(' — ')

  const likelihoodTitle = (value: ScaleValue) =>
    [likelihoodOptionLabel(value, matrix, language), likelihoodDescription(value, matrix, language)]
      .filter(Boolean)
      .join(' — ')

  return (
    <fieldset className="editor-assessment">
      <legend>
        <span className="editor-assessment__name">{label}</span>
        <span className="editor-assessment__score">{view.score}</span>
        <RatingChip score={score} matrix={matrix} variant="pill" label={label} />
      </legend>

      <div className="editor-assessment__selects">
        <label>
          <span>{t('editor.field.impact')}</span>
          {/* A native select clips its own value, so the full label is a tooltip. */}
          <select
            value={score.impact}
            title={impactTitle(score.impact)}
            onChange={(event) => {
              onChange({ ...score, impact: Number(event.target.value) as ScaleValue })
            }}
          >
            {SCALE_VALUES.map((value) => (
              <option key={value} value={value} title={impactDescription(value, matrix, language)}>
                {impactOptionLabel(value, matrix, language)}
              </option>
            ))}
          </select>
        </label>

        <span className="editor-assessment__times" aria-hidden="true">
          ×
        </span>

        <label>
          <span>{t('editor.field.likelihood')}</span>
          <select
            value={score.likelihood}
            title={likelihoodTitle(score.likelihood)}
            onChange={(event) => {
              onChange({ ...score, likelihood: Number(event.target.value) as ScaleValue })
            }}
          >
            {SCALE_VALUES.map((value) => (
              <option key={value} value={value} title={likelihoodDescription(value, matrix, language)}>
                {likelihoodOptionLabel(value, matrix, language)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <AssessmentMatrix score={score} matrix={matrix} label={label} onSelect={onChange} />
    </fieldset>
  )
}

// --- controls ---------------------------------------------------------------

function ControlsTab({
  draft,
  onChange,
  candidates,
}: {
  draft: Risk
  onChange: (controls: Control[]) => void
  candidates: readonly { id: string; name: string }[]
}) {
  const { t } = useTranslation()
  const [quick, setQuick] = useState('')

  const blank = (): Control => ({
    id: generateId('ctrl'), title: '', ownerId: candidates[0]?.id ?? '', performer: '',
    description: '', frequency: '', intendedOutcome: '', evidenceLocation: '',
    keyControl: false, type: 'Preventative', automation: 'Manual', status: 'Not Assessed',
  })

  /**
   * Quick input: one control per non-empty line, whitespace trimmed, and
   * case-insensitive duplicates skipped (ARCHITECTURE.md §8.2).
   */
  const applyQuick = () => {
    const existing = new Set(draft.controls.map((control) => control.title.trim().toLowerCase()))
    const created: Control[] = []

    for (const line of quick.split('\n')) {
      const title = line.trim()
      if (title.length === 0) continue
      const key = title.toLowerCase()
      if (existing.has(key)) continue
      existing.add(key)
      created.push({ ...blank(), id: generateId('ctrl'), title })
    }

    if (created.length > 0) onChange([...draft.controls, ...created])
    setQuick('')
  }

  return (
    <section className="editor-section">
      <header className="editor-section__head editor-section__head--action">
        <div>
          <h3>{t('view.overview.controlsSummary')}</h3>
          <p>{t('editor.control.quick')}</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            onChange([...draft.controls, blank()])
          }}
        >
          <IconPlus size={14} />
          {t('editor.control.add')}
        </button>
      </header>

      <div className="editor-stack">
        <label>
          <span>{t('editor.control.quick')}</span>
          <textarea value={quick} onChange={(event) => { setQuick(event.target.value) }} />
        </label>
        <button type="button" className="btn" onClick={applyQuick}>
          {t('editor.control.quickApply')}
        </button>

        <ul className="editor-list">
          {draft.controls.map((control, index) => (
            <li key={control.id} className="editor-card">
              <div className="editor-card__row editor-card__row--head">
                <span className="avatar" aria-hidden="true">C</span>
                <label className="editor-card__grow">
                  <span className="visually-hidden">{t('editor.control.title')}</span>
                  <input
                    value={control.title}
                    onChange={(event) => {
                      const next = [...draft.controls]
                      next[index] = { ...control, title: event.target.value }
                      onChange(next)
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn--icon btn--danger"
                  aria-label={`${t('editor.remove')}: ${control.title}`}
                  title={t('editor.remove')}
                  onClick={() => {
                    onChange(draft.controls.filter((candidate) => candidate.id !== control.id))
                  }}
                >
                  <IconTrash size={16} />
                </button>
              </div>

              <div className="editor-card__row editor-card__row--three">
                <label>
                  <span>{t('editor.control.owner')}</span>
                  <select
                    value={control.ownerId}
                    onChange={(event) => {
                      const next = [...draft.controls]
                      next[index] = { ...control, ownerId: event.target.value }
                      onChange(next)
                    }}
                  >
                    <option value="">—</option>
                    {candidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t('editor.control.effectiveness')}</span>
                  <select
                    value={control.status}
                    onChange={(event) => {
                      const next = [...draft.controls]
                      next[index] = { ...control, status: event.target.value as Control['status'] }
                      onChange(next)
                    }}
                  >
                    {CONTROL_EFFECTIVENESS.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t('view.controls.performer')}</span>
                  <input
                    value={control.performer}
                    onChange={(event) => {
                      const next = [...draft.controls]
                      next[index] = { ...control, performer: event.target.value }
                      onChange(next)
                    }}
                  />
                </label>
              </div>

              <div className="editor-card__row editor-card__row--three">
                <label>
                  <span>{t('register.column.category')}</span>
                  <select
                    aria-label={`${control.title} type`}
                    value={control.type}
                    onChange={(event) => {
                      const next = [...draft.controls]
                      next[index] = { ...control, type: event.target.value as Control['type'] }
                      onChange(next)
                    }}
                  >
                    {CONTROL_TYPES.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t('view.controls.frequency')}</span>
                  <select
                    aria-label={`${control.title} automation`}
                    value={control.automation}
                    onChange={(event) => {
                      const next = [...draft.controls]
                      next[index] = { ...control, automation: event.target.value as Control['automation'] }
                      onChange(next)
                    }}
                  >
                    {CONTROL_AUTOMATION.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t('view.controls.evidence')}</span>
                  <input
                    value={control.evidenceLocation}
                    onChange={(event) => {
                      const next = [...draft.controls]
                      next[index] = { ...control, evidenceLocation: event.target.value }
                      onChange(next)
                    }}
                  />
                </label>
              </div>

              <label>
                <span>{t('view.actions.description')}</span>
                <textarea
                  value={control.description}
                  onChange={(event) => {
                    const next = [...draft.controls]
                    next[index] = { ...control, description: event.target.value }
                    onChange(next)
                  }}
                />
              </label>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

// --- actions ----------------------------------------------------------------

function ActionsTab({
  draft,
  onChange,
  candidates,
}: {
  draft: Risk
  onChange: (actions: RemediationAction[]) => void
  candidates: readonly { id: string; name: string }[]
}) {
  const { t } = useTranslation()
  // Removal is destructive and easy to mis-click, so it confirms in place.
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null)

  const blank = (): RemediationAction => ({
    id: generateId('act'), title: '', description: '', deliverable: '',
    ownerId: candidates[0]?.id ?? draft.riskOwnerId,
    // Default due date is today + 3 months (ARCHITECTURE.md §3.4).
    dueDate: new Date(Date.now() + 92 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    status: 'Not Started', priority: 'Medium', progress: 0, notes: '',
  })

  return (
    <section className="editor-section">
      <header className="editor-section__head editor-section__head--action">
        <div>
          <h3>{t('editor.action.section')}</h3>
          <p>{t('editor.action.sectionHint')}</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            onChange([...draft.actions, blank()])
          }}
        >
          <IconPlus size={14} />
          {t('editor.action.add')}
        </button>
      </header>

      <ul className="editor-list">
        {draft.actions.map((action, index) => {
          const patch = (changes: Partial<RemediationAction>) => {
            const next = [...draft.actions]
            next[index] = { ...action, ...changes }
            onChange(next)
          }

          return (
            <li key={action.id} className="editor-card">
              <div className="editor-card__row editor-card__row--head">
                <span className="avatar" aria-hidden="true">
                  {action.title.trim().length > 0 ? initialsOf(action.title) : 'A'}
                </span>
                <label className="editor-card__grow">
                  <span className="visually-hidden">{t('editor.action.title')}</span>
                  <input
                    value={action.title}
                    onChange={(event) => { patch({ title: event.target.value }) }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn--icon btn--danger"
                  aria-label={`${t('editor.remove')}: ${action.title}`}
                  title={t('editor.remove')}
                  onClick={() => {
                    setPendingRemoval(action.id)
                  }}
                >
                  <IconTrash size={16} />
                </button>
              </div>

              {pendingRemoval === action.id ? (
                <p className="editor-card__confirm" role="alert">
                  <span>{t('editor.action.removeConfirm')}</span>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      onChange(draft.actions.filter((candidate) => candidate.id !== action.id))
                      setPendingRemoval(null)
                    }}
                  >
                    {t('editor.remove')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      setPendingRemoval(null)
                    }}
                  >
                    {t('action.cancel')}
                  </button>
                </p>
              ) : null}

              <div className="editor-card__row editor-card__row--three">
                <label>
                  <span>{t('editor.action.owner')}</span>
                  <select value={action.ownerId} onChange={(event) => { patch({ ownerId: event.target.value }) }}>
                    <option value="">—</option>
                    {candidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t('editor.action.dueDate')}</span>
                  <input type="date" value={action.dueDate} onChange={(event) => { patch({ dueDate: event.target.value }) }} />
                </label>
                <label>
                  <span>{t('editor.action.status')}</span>
                  <select
                    aria-label={`${action.title} status`}
                    value={action.status}
                    onChange={(event) => { patch({ status: event.target.value as RemediationAction['status'] }) }}
                  >
                    {ACTION_STATUSES.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="editor-card__row editor-card__row--two">
                <label>
                  <span>{t('editor.action.priority')}</span>
                  <select
                    aria-label={`${action.title} priority`}
                    value={action.priority}
                    onChange={(event) => { patch({ priority: event.target.value as RemediationAction['priority'] }) }}
                  >
                    {ACTION_PRIORITIES.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="editor-progress">
                  <span>
                    {t('editor.action.progress')} — {action.progress}%
                  </span>
                  {/* 0–100 in steps of 5 (ARCHITECTURE.md §3.4). */}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={action.progress}
                    onChange={(event) => { patch({ progress: Number(event.target.value) }) }}
                  />
                </label>
              </div>

              <div className="editor-card__row editor-card__row--two">
                <label>
                  <span>{t('editor.action.description')}</span>
                  <textarea
                    value={action.description}
                    onChange={(event) => { patch({ description: event.target.value }) }}
                  />
                </label>
                <label>
                  <span>{t('editor.action.deliverable')}</span>
                  <textarea
                    value={action.deliverable}
                    onChange={(event) => { patch({ deliverable: event.target.value }) }}
                  />
                </label>
              </div>

              <label>
                <span>{t('editor.action.notes')}</span>
                <textarea
                  value={action.notes}
                  onChange={(event) => { patch({ notes: event.target.value }) }}
                />
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
