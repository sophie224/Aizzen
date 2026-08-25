import type { AttributeType } from './enums.ts'
import type { CustomFieldValues, IsoDate, IsoDateTime } from './risk.ts'

/*
 * Control Register and Control Deficiency Register (CR-2026 "Control Register
 * & Control Deficiency Register", FR-CR-01…11 / FR-CD-01…07).
 *
 * ADDITIVE BY CONSTRUCTION. These types describe new collections only; the
 * `Risk` record is not extended, and the controls a risk already carries
 * (`Risk.controls`, the per-risk "Existing Controls" list) are a DIFFERENT
 * concept that this change deliberately leaves untouched:
 *
 *   Risk.controls[]    — narrative controls captured inside one risk (v7)
 *   AppState.controls[] — the organisation-wide control register (this CR)
 *
 * A risk is joined to a register control through `ControlRiskLink`, the
 * equivalent of the CR's join table, so no existing record changes shape.
 */

/** Framework libraries controls can be imported from (FR-CR-02). */
export const CONTROL_FRAMEWORK_IDS = ['iso27001', 'nistCsf2', 'iso31000', 'nis2', 'sox'] as const
export type ControlFrameworkId = (typeof CONTROL_FRAMEWORK_IDS)[number]

/** How a control entered the register. Drives whether `ref` is system-issued. */
export const CONTROL_SOURCES = ['Manual', 'Framework', 'Upload'] as const
export type ControlSource = (typeof CONTROL_SOURCES)[number]

/**
 * One level of a configurable control scale (FR-CR-09).
 *
 * `key` is the STABLE stored value — renaming a level or recolouring it never
 * touches stored controls, filters or exports. This mirrors the rule the
 * rating matrix already follows for `Low | Medium | High | Significant`.
 */
export interface ControlScaleLevel {
  key: string
  labelEn: string
  labelKa: string
  /** Hex, e.g. `#00B050`. Rendered as a chip background. */
  color: string
}

/** A manually entered evidence item attached to a control (FR-CR-10). */
export interface ControlEvidence {
  id: string
  /** Required; an empty title drops the item on save. */
  title: string
  /** Where the evidence lives — free text, entered manually. */
  reference: string
  note: string
  addedAt: IsoDateTime
}

/** A control in the organisation-wide register (§5.2 field specification). */
export interface RegisterControl {
  /** Technical ID: `ctl_<timestamp>_<random>`. */
  id: string
  /**
   * Business identifier shown as "Control ID": sequential `0001` for manual
   * controls, the framework's own UID for imported ones. Read-only after
   * creation (§5.2).
   */
  ref: string
  source: ControlSource
  /** Set only for framework-imported controls. */
  frameworkId: ControlFrameworkId | null
  /** Version of the seed package the control came from, for traceability. */
  frameworkVersion: string
  /** Mandatory OU. Drives visibility (FR-CR-08). */
  businessUnitId: string
  name: string
  objective: string
  /** Chosen from the existing user directory; may be empty. */
  ownerId: string
  /** Stable keys into `ControlConfig.effectiveness` / `.maturity` / `.assurance`. */
  effectiveness: string
  maturity: string
  assurance: string
  evidence: ControlEvidence[]
  /** Values for custom columns, keyed by `ControlCustomColumn.id`. */
  custom: CustomFieldValues
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/** A finding raised against a control (§5.4 field specification). */
export interface ControlDeficiency {
  /** Technical ID: `cdf_<timestamp>_<random>`. */
  id: string
  /** Business identifier shown as "Finding ID", sequential from `0001`. */
  ref: string
  /** Mandatory OU; scoping follows the Control Register (FR-CD-07). */
  businessUnitId: string
  /** `RegisterControl.id`; a finding must map to an existing control. */
  controlId: string
  description: string
  /** Stable key into `ControlConfig.classifications`. */
  classification: string
  remediationOwnerId: string
  remediationDescription: string
  targetDate: IsoDate | ''
  custom: CustomFieldValues
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/**
 * Risk ⇄ register-control join (FR-CR-04).
 *
 * A separate record precisely so the risk itself is not modified — the CR
 * requires the risk table to stay as it is.
 */
export interface ControlRiskLink {
  id: string
  riskId: string
  controlId: string
  createdAt: IsoDateTime
  actorId: string
}

/** Which register a custom column or column order belongs to. */
export const CONTROL_REGISTERS = ['control', 'deficiency'] as const
export type ControlRegisterName = (typeof CONTROL_REGISTERS)[number]

/**
 * An administrator-defined column ("Add Column", FR-CR-11 / FR-CD-06).
 *
 * Typed metadata only — a definition plus values on the record. Nothing here
 * ever becomes a schema change, which is the CR's explicit security rule.
 */
export interface ControlCustomColumn {
  id: string
  register: ControlRegisterName
  labelEn: string
  labelKa: string
  type: AttributeType
  /** Values for `select`; empty for every other type. */
  options: string[]
  /**
   * FR-CR-11: also show this attribute in the risk's linked-controls view.
   * Only meaningful for `register: 'control'`.
   */
  showInRiskView: boolean
  /** Deactivating hides the column but preserves stored values. */
  active: boolean
}

/** Configurable scales and columns for both registers (FR-CR-09). */
export interface ControlConfig {
  /** Bumped on every saved configuration, like the rating matrix. */
  version: number
  effectiveness: ControlScaleLevel[]
  maturity: ControlScaleLevel[]
  assurance: ControlScaleLevel[]
  /** Finding Classification list (§5.4). */
  classifications: ControlScaleLevel[]
  customColumns: ControlCustomColumn[]
}

/**
 * Per-user column order for a register (FR-CR-07 / FR-CD-05).
 *
 * A missing or stale preference must never block rendering — it is reconciled
 * against the live column set on read.
 */
export interface ControlColumnPreference {
  id: string
  userId: string
  register: ControlRegisterName
  columnIds: string[]
}
