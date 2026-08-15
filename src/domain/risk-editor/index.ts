import { riskScore } from '../risk-engine/index.ts'
import type {
  AssessmentHistoryItem,
  IsoDate,
  IsoDateTime,
  Risk,
  Score,
} from '../types/index.ts'

export * from './defaults.ts'

/*
 * Risk save workflow (ARCHITECTURE.md §8.2).
 *
 *   clone -> apply edits -> validate -> clean controls/actions
 *     -> compare assessments -> append history if a score changed
 *     -> append audit event -> repository.save
 *
 * Everything here is pure. The caller supplies `today`, `now` and generated
 * IDs, so a save is fully reproducible in tests.
 */

// --- validation -------------------------------------------------------------

/** Field key plus a message key the UI resolves through i18n. */
export interface ValidationError {
  field: string
  messageKey: string
}

/**
 * The six documented save blockers (ARCHITECTURE.md §8.2).
 *
 * Returns every failure at once rather than the first, so the editor can mark
 * all offending fields in one pass.
 */
export function validateRisk(risk: Risk): ValidationError[] {
  const errors: ValidationError[] = []
  const blank = (value: string) => value.trim().length === 0

  if (blank(risk.title)) errors.push({ field: 'title', messageKey: 'editor.error.title' })
  if (blank(risk.categoryId)) errors.push({ field: 'categoryId', messageKey: 'editor.error.category' })
  if (blank(risk.riskOwnerId)) errors.push({ field: 'riskOwnerId', messageKey: 'editor.error.riskOwner' })

  // Cause, event and consequence are each independently mandatory.
  if (blank(risk.cause)) errors.push({ field: 'cause', messageKey: 'editor.error.cause' })
  if (blank(risk.event)) errors.push({ field: 'event', messageKey: 'editor.error.event' })
  if (blank(risk.consequence)) errors.push({ field: 'consequence', messageKey: 'editor.error.consequence' })

  if (risk.responseType === 'Accept' && blank(risk.acceptance.rationale)) {
    errors.push({ field: 'acceptance.rationale', messageKey: 'editor.error.acceptanceRationale' })
  }

  if (risk.status === 'Accepted') {
    if (blank(risk.acceptance.approverId)) {
      errors.push({ field: 'acceptance.approverId', messageKey: 'editor.error.approver' })
    }
    if (blank(risk.acceptance.approvalDate)) {
      errors.push({ field: 'acceptance.approvalDate', messageKey: 'editor.error.approvalDate' })
    }
    if (blank(risk.acceptance.validUntil)) {
      errors.push({ field: 'acceptance.validUntil', messageKey: 'editor.error.validUntil' })
    }
  }

  return errors
}

// --- cleaning ---------------------------------------------------------------

export interface CleanOptions {
  /** Used when the reference is blank; the caller generates it. */
  generatedRef: string
  now: IsoDateTime
}

/**
 * Data cleaning applied immediately before save (ARCHITECTURE.md §8.2).
 *
 * Controls and actions with an empty title are dropped — that is how the UI's
 * "remove" affordance works, and it keeps blank rows out of the record.
 * Custom values keep their attribute-ID binding untouched.
 */
export function cleanRisk(risk: Risk, options: CleanOptions): Risk {
  return {
    ...risk,
    title: risk.title.trim(),
    ref: risk.ref.trim().length > 0 ? risk.ref.trim() : options.generatedRef,
    controls: risk.controls.filter((control) => control.title.trim().length > 0),
    actions: risk.actions.filter((action) => action.title.trim().length > 0),
    updatedAt: options.now,
  }
}

// --- change detection -------------------------------------------------------

function sameScore(a: Score, b: Score): boolean {
  return a.impact === b.impact && a.likelihood === b.likelihood
}

/**
 * True when any of the three assessments changed.
 *
 * This is the ONLY trigger for a new history item: narrative, owner, status,
 * control and action edits never create one (ARCHITECTURE.md §3.6).
 */
export function assessmentsChanged(before: Risk, after: Risk): boolean {
  return (
    !sameScore(before.inherent, after.inherent) ||
    !sameScore(before.residual, after.residual) ||
    !sameScore(before.target, after.target)
  )
}

/** Master fields whose change is named individually in the audit trail. */
const TRACKED_FIELDS: readonly [keyof Risk, string][] = [
  ['title', 'Title'],
  ['status', 'Status'],
  ['riskOwnerId', 'Risk owner'],
  ['categoryId', 'Category'],
  ['businessUnitId', 'Business unit'],
  ['targetDate', 'Target date'],
  ['outlook', 'Outlook'],
]

/**
 * Human-readable change labels for the audit event.
 *
 * Mirrors the v7 build: named master fields, score transitions with their
 * before → after values, control and action changes, and a `Record saved`
 * fallback so an audit event is never empty (ARCHITECTURE.md §8.2).
 */
export function diffRisk(before: Risk, after: Risk): string[] {
  const changes: string[] = []

  for (const [key, label] of TRACKED_FIELDS) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes.push(`${label}: changed`)
  }

  const scoreChange = (name: string, from: Score, to: Score) => {
    if (!sameScore(from, to)) {
      changes.push(`${name}: ${String(riskScore(from))} → ${String(riskScore(to))}`)
    }
  }
  scoreChange('Inherent', before.inherent, after.inherent)
  scoreChange('Residual', before.residual, after.residual)
  scoreChange('Target', before.target, after.target)

  if (JSON.stringify(before.controls) !== JSON.stringify(after.controls)) changes.push('Controls updated')
  if (JSON.stringify(before.actions) !== JSON.stringify(after.actions)) changes.push('Action plans updated')

  return changes.length > 0 ? changes : ['Record saved']
}

// --- save orchestration -----------------------------------------------------

export interface PrepareSaveInput {
  /** The stored record, or null when creating. */
  original: Risk | null
  draft: Risk
  actorId: string
  today: IsoDate
  now: IsoDateTime
  /** Generated outside the domain, so the result stays deterministic. */
  historyId: string
  generatedRef: string
}

export type PrepareSaveResult =
  | {
      readonly ok: true
      readonly risk: Risk
      readonly action: 'risk.created' | 'risk.updated'
      readonly changes: string[]
      /** True when a history snapshot was appended. */
      readonly historyAppended: boolean
    }
  | { readonly ok: false; readonly errors: ValidationError[] }

function snapshot(risk: Risk, id: string, date: IsoDate, actorId: string, note: string): AssessmentHistoryItem {
  return {
    id,
    date,
    inherent: { ...risk.inherent },
    residual: { ...risk.residual },
    target: { ...risk.target },
    note,
    actorId,
  }
}

/**
 * Runs the whole save workflow and returns the record to persist.
 *
 * Does NOT write anything — the caller hands the result to the repository, so
 * the rules stay testable without a store.
 */
export function prepareSave(input: PrepareSaveInput): PrepareSaveResult {
  const errors = validateRisk(input.draft)
  if (errors.length > 0) return { ok: false, errors }

  const cleaned = cleanRisk(input.draft, { generatedRef: input.generatedRef, now: input.now })
  const original = input.original

  if (original === null) {
    // A new risk always opens its history with an initial snapshot.
    const initial = snapshot(cleaned, input.historyId, input.today, input.actorId, 'Initial assessment')
    return {
      ok: true,
      risk: { ...cleaned, history: [...cleaned.history, initial] },
      action: 'risk.created',
      changes: ['Record created'],
      historyAppended: true,
    }
  }

  const scoresChanged = assessmentsChanged(original, cleaned)

  const risk: Risk = scoresChanged
    ? {
        ...cleaned,
        history: [
          ...cleaned.history,
          snapshot(cleaned, input.historyId, input.today, input.actorId, 'Assessment updated'),
        ],
      }
    : cleaned

  return {
    ok: true,
    risk,
    action: 'risk.updated',
    changes: diffRisk(original, cleaned),
    historyAppended: scoresChanged,
  }
}
