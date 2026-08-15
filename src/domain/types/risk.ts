import type {
  ActionPriority,
  ActionStatus,
  ControlAutomation,
  ControlEffectiveness,
  ControlType,
  Outlook,
  ResponseType,
  RiskStatus,
  RiskType,
  ScaleValue,
} from './enums.ts'

/** `YYYY-MM-DD`. Dates without a time component use an ISO date (ARCHITECTURE.md §12). */
export type IsoDate = string

/** Full UTC ISO 8601 timestamp. */
export type IsoDateTime = string

/**
 * A single assessment. Score and rating are DERIVED and deliberately absent —
 * they are recomputed at runtime from the configured matrix so that a matrix
 * change propagates everywhere (ARCHITECTURE.md §2.3, §7).
 */
export interface Score {
  impact: ScaleValue
  likelihood: ScaleValue
}

/**
 * An existing control. Created manually per risk — there is no control
 * catalogue to select from (ARCHITECTURE.md §3.3).
 */
export interface Control {
  id: string
  /** Empty title ⇒ the control is dropped on save. */
  title: string
  ownerId: string
  /** Who performs the control, as opposed to who owns it. */
  performer: string
  description: string
  /** Continuous / Daily / Weekly / Monthly / Quarterly, or free text. */
  frequency: string
  intendedOutcome: string
  evidenceLocation: string
  /** Critical to reaching the target level. */
  keyControl: boolean
  type: ControlType
  automation: ControlAutomation
  status: ControlEffectiveness
}

/**
 * A remediation action. `Overdue` is derived (`dueDate < today AND status !=
 * Completed`) and may differ from the stored status (ARCHITECTURE.md §3.4).
 */
export interface RemediationAction {
  id: string
  /** Empty title ⇒ the action is dropped on save. */
  title: string
  description: string
  /** What is produced on completion. */
  deliverable: string
  ownerId: string
  dueDate: IsoDate
  status: ActionStatus
  priority: ActionPriority
  /** 0–100 in steps of 5. */
  progress: number
  notes: string
}

/**
 * Formal risk acceptance. Required when the response or status implies
 * acceptance (ARCHITECTURE.md §3.5).
 */
export interface Acceptance {
  rationale: string
  initiatorId: string
  approverId: string
  approvalDate: IsoDate | ''
  /** Framework validity is six months from the approval date. */
  validUntil: IsoDate | ''
  reviewDate: IsoDate | ''
}

/**
 * A point-in-time snapshot of all three scores. Appended on creation and
 * whenever inherent, residual or target changes — never for narrative,
 * owner, status, control or action edits (ARCHITECTURE.md §3.6).
 */
export interface AssessmentHistoryItem {
  id: string
  date: IsoDate
  inherent: Score
  residual: Score
  target: Score
  note: string
  actorId: string
}

/** Values for dynamic custom attributes, keyed by attribute ID. */
export type CustomFieldValues = Record<string, string | number>

export interface Risk {
  /** Technical ID: `risk_<timestamp>_<random>`. */
  id: string
  /** Business reference: `<BU CODE>-<3-digit sequence>`, e.g. `TECH-001`. */
  ref: string
  /** Required; trimmed on save. */
  title: string
  type: RiskType
  categoryId: string
  businessUnitId: string
  riskOwnerId: string
  originDate: IsoDate
  /** Default: origin + 12 months. */
  reviewDate: IsoDate
  /** Default: origin + 6 months. */
  targetDate: IsoDate
  status: RiskStatus
  responseType: ResponseType
  /** Manual management judgement, never auto-computed. */
  outlook: Outlook

  /** Cause, event and consequence are all mandatory (ARCHITECTURE.md §8.2). */
  cause: string
  event: string
  consequence: string
  statusNarrative: string

  inherent: Score
  residual: Score
  target: Score

  controls: Control[]
  actions: RemediationAction[]
  acceptance: Acceptance

  custom: CustomFieldValues

  history: AssessmentHistoryItem[]
  /** Risk-scoped audit events, newest first. */
  audit: AuditEvent[]

  updatedAt: IsoDateTime
}

/**
 * Actor/action trace. Distinct from assessment history: an audit event is
 * written for every mutation, history only for score changes
 * (ARCHITECTURE.md §3.6).
 */
export interface AuditEvent {
  id: string
  date: IsoDateTime
  actorId: string
  /** Taxonomy code, e.g. `risk.created`, `matrix.updated`. */
  action: string
  entityType: string
  entityId: string
  summary: string
  changes?: string[]
}
