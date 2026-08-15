import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import { flattenTree } from '../../domain/business-units/index.ts'
import { mergeAuthorisedRiskUpdate } from '../../domain/permissions/index.ts'
import { nextRiskReference } from '../../domain/reference/index.ts'
import {
  createDraftRisk,
  ownerCandidates,
  prepareSave,
  type ValidationError,
} from '../../domain/risk-editor/index.ts'
import { assess } from '../../domain/risk-engine/index.ts'
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
  Control,
  RemediationAction,
  Risk,
  Score,
  ScaleValue,
} from '../../domain/types/index.ts'
import { pickNamed, useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
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

  // Escape closes without persisting, matching Cancel.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

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
          <h2 id="editor-title">{t(isNew ? 'editor.newTitle' : 'editor.editTitle')}</h2>
          <span className="editor-dialog__ref">{draft.ref}</span>
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
          {TABS.map((tab) => (
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
            </button>
          ))}
        </div>

        <div
          className="editor-panel"
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
        >
          {activeTab === 'basic' ? (
            <div className="editor-grid">
              <label>
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
          ) : null}

          {activeTab === 'description' ? (
            <div className="editor-stack">
              {(['cause', 'event', 'consequence'] as const).map((field) => (
                <label key={field}>
                  <span>{t(`risk.${field}` as TranslationKey)}</span>
                  <textarea
                    value={draft[field]}
                    aria-invalid={errorFor(field) !== undefined}
                    onChange={(event) => {
                      update({ [field]: event.target.value } as Partial<Risk>)
                    }}
                  />
                </label>
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
          ) : null}

          {activeTab === 'assessments' ? (
            <div className="editor-assessments">
              {(['inherent', 'residual', 'target'] as const).map((kind) => {
                const score = draft[kind]
                const view = assess(score, state.matrix)
                const setScore = (patch: Partial<Score>) => {
                  update({ [kind]: { ...score, ...patch } } as Partial<Risk>)
                }

                return (
                  <fieldset key={kind} className="editor-assessment">
                    <legend>{t(`editor.assessment.${kind}` as TranslationKey)}</legend>
                    <label>
                      <span>{t('editor.field.impact')}</span>
                      <select
                        value={score.impact}
                        onChange={(event) => {
                          setScore({ impact: Number(event.target.value) as ScaleValue })
                        }}
                      >
                        {SCALE_VALUES.map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{t('editor.field.likelihood')}</span>
                      <select
                        value={score.likelihood}
                        onChange={(event) => {
                          setScore({ likelihood: Number(event.target.value) as ScaleValue })
                        }}
                      >
                        {SCALE_VALUES.map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    {/* Derived live from the engine — never stored. */}
                    <output className="editor-assessment__result" style={{ background: view.color }}>
                      {view.score} · {view.rating}
                    </output>
                  </fieldset>
                )
              })}
            </div>
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
            <div className="editor-stack">
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
          ) : null}
        </div>

        <footer className="editor-dialog__footer">
          {/* Cancel persists nothing — the draft is simply discarded. */}
          <button type="button" onClick={onClose}>{t('action.cancel')}</button>
          <button
            type="button"
            className="editor-dialog__save"
            disabled={saving}
            onClick={() => {
              void handleSave()
            }}
          >
            {t('action.save')}
          </button>
        </footer>
      </div>
    </div>
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
    <div className="editor-stack">
      <label>
        <span>{t('editor.control.quick')}</span>
        <textarea value={quick} onChange={(event) => { setQuick(event.target.value) }} />
      </label>
      <button type="button" onClick={applyQuick}>{t('editor.control.quickApply')}</button>

      <ul className="editor-list">
        {draft.controls.map((control, index) => (
          <li key={control.id} className="editor-list__item">
            <label>
              <span>{t('editor.control.title')}</span>
              <input
                value={control.title}
                onChange={(event) => {
                  const next = [...draft.controls]
                  next[index] = { ...control, title: event.target.value }
                  onChange(next)
                }}
              />
            </label>
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
            <div className="editor-list__meta">
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
              <button
                type="button"
                onClick={() => {
                  onChange(draft.controls.filter((candidate) => candidate.id !== control.id))
                }}
              >
                {t('editor.remove')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button type="button" onClick={() => { onChange([...draft.controls, blank()]) }}>
        {t('editor.control.add')}
      </button>
    </div>
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

  const blank = (): RemediationAction => ({
    id: generateId('act'), title: '', description: '', deliverable: '',
    ownerId: candidates[0]?.id ?? draft.riskOwnerId,
    // Default due date is today + 3 months (ARCHITECTURE.md §3.4).
    dueDate: new Date(Date.now() + 92 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    status: 'Not Started', priority: 'Medium', progress: 0, notes: '',
  })

  return (
    <div className="editor-stack">
      <ul className="editor-list">
        {draft.actions.map((action, index) => {
          const patch = (changes: Partial<RemediationAction>) => {
            const next = [...draft.actions]
            next[index] = { ...action, ...changes }
            onChange(next)
          }

          return (
            <li key={action.id} className="editor-list__item">
              <label>
                <span>{t('editor.action.title')}</span>
                <input value={action.title} onChange={(event) => { patch({ title: event.target.value }) }} />
              </label>
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
              <div className="editor-list__meta">
                <select
                  aria-label={`${action.title} status`}
                  value={action.status}
                  onChange={(event) => { patch({ status: event.target.value as RemediationAction['status'] }) }}
                >
                  {ACTION_STATUSES.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
                <select
                  aria-label={`${action.title} priority`}
                  value={action.priority}
                  onChange={(event) => { patch({ priority: event.target.value as RemediationAction['priority'] }) }}
                >
                  {ACTION_PRIORITIES.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
                <label className="editor-progress">
                  <span>{t('editor.action.progress')}</span>
                  {/* 0–100 in steps of 5 (ARCHITECTURE.md §3.4). */}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={action.progress}
                    onChange={(event) => { patch({ progress: Number(event.target.value) }) }}
                  />
                  <output>{action.progress}%</output>
                </label>
                <button
                  type="button"
                  onClick={() => { onChange(draft.actions.filter((candidate) => candidate.id !== action.id)) }}
                >
                  {t('editor.remove')}
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <button type="button" onClick={() => { onChange([...draft.actions, blank()]) }}>
        {t('editor.action.add')}
      </button>
    </div>
  )
}
