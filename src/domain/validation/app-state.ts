import type { AppState } from '../types/app-state.ts'
import { MODULE_NAMES, SCALE_VALUES } from '../types/enums.ts'
import {
  isActionPriority,
  isActionStatus,
  isAttributeType,
  isBoolean,
  isControlAutomation,
  isControlEffectiveness,
  isControlType,
  isDemoRequestStatus,
  isEntityStatus,
  isFiniteNumber,
  isLanguage,
  isNonEmptyString,
  isOutlook,
  isPermissionSet,
  isRatingLabel,
  isRecord,
  isResponseType,
  isRiskStatus,
  isRiskType,
  isScaleValue,
  isScore,
  isString,
  isStringArray,
} from './guards.ts'

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: string[] }

/** Accumulates `path: message` diagnostics while walking a candidate state. */
class ErrorBag {
  readonly errors: string[] = []

  add(path: string, message: string): void {
    this.errors.push(`${path}: ${message}`)
  }

  require(condition: boolean, path: string, message: string): boolean {
    if (!condition) this.add(path, message)
    return condition
  }
}

const REQUIRED_COLLECTIONS = [
  'users',
  'roles',
  'categories',
  'businessUnits',
  'customAttributes',
  'risks',
  'savedViews',
  'matrixVersions',
  'dashboards',
  'dashboardViews',
  'dashboardLayouts',
  'reportTemplates',
  'auditEvents',
  'controls',
  'controlDeficiencies',
  'controlRiskLinks',
  'controlColumnPreferences',
  'demoRequests',
] as const

/**
 * Minimum gate applied at IMPORT time, before migration runs.
 *
 * Deliberately permissive: a legacy v7 backup must survive this check and
 * reach the migration layer. The spec requires only "basic structural
 * validation — minimum risks/users arrays" (ARCHITECTURE.md §4.2).
 */
export function validateImportableState(value: unknown): ValidationResult<unknown> {
  const bag = new ErrorBag()

  if (!isRecord(value)) {
    return { ok: false, errors: ['root: expected a JSON object'] }
  }

  // A v7 export nests the payload under `state`; a raw state object does not.
  const candidate = isRecord(value.state) ? value.state : value

  bag.require(Array.isArray(candidate.risks), 'risks', 'expected an array')
  bag.require(Array.isArray(candidate.users), 'users', 'expected an array')

  if (bag.errors.length > 0) return { ok: false, errors: bag.errors }
  return { ok: true, value: candidate }
}

/**
 * Parses JSON text and applies the import gate. Malformed JSON never throws —
 * it returns an error result so the caller can preserve current state
 * (ARCHITECTURE.md §10).
 */
export function parseImportableState(text: string): ValidationResult<unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unparseable input'
    return { ok: false, errors: [`root: invalid JSON (${detail})`] }
  }
  return validateImportableState(parsed)
}

function validateUsers(users: unknown[], bag: ErrorBag): void {
  users.forEach((user, index) => {
    const path = `users[${index}]`
    if (!isRecord(user)) return void bag.add(path, 'expected an object')

    bag.require(isNonEmptyString(user.id), `${path}.id`, 'required')
    bag.require(isNonEmptyString(user.name), `${path}.name`, 'required')
    bag.require(isNonEmptyString(user.email), `${path}.email`, 'required')
    bag.require(isString(user.title), `${path}.title`, 'expected a string')
    bag.require(isEntityStatus(user.status), `${path}.status`, 'expected Active or Inactive')
    if (bag.require(isStringArray(user.roleIds), `${path}.roleIds`, 'expected a string array')) {
      bag.require((user.roleIds as string[]).length > 0, `${path}.roleIds`, 'at least one role required')
    }
    if (
      bag.require(
        isStringArray(user.businessUnitIds),
        `${path}.businessUnitIds`,
        'expected a string array',
      )
    ) {
      bag.require(
        (user.businessUnitIds as string[]).length > 0,
        `${path}.businessUnitIds`,
        'at least one business unit scope required',
      )
    }
  })
}

function validateRoles(roles: unknown[], bag: ErrorBag): void {
  roles.forEach((role, index) => {
    const path = `roles[${index}]`
    if (!isRecord(role)) return void bag.add(path, 'expected an object')

    bag.require(isNonEmptyString(role.id), `${path}.id`, 'required')
    bag.require(isNonEmptyString(role.nameEn), `${path}.nameEn`, 'required')
    bag.require(isBoolean(role.system), `${path}.system`, 'expected a boolean')
    bag.require(
      isPermissionSet(role.permissions),
      `${path}.permissions`,
      `expected a level for each of: ${MODULE_NAMES.join(', ')}`,
    )
  })
}

function validateCategories(categories: unknown[], bag: ErrorBag): void {
  categories.forEach((category, index) => {
    const path = `categories[${index}]`
    if (!isRecord(category)) return void bag.add(path, 'expected an object')

    bag.require(isNonEmptyString(category.id), `${path}.id`, 'required')
    bag.require(isNonEmptyString(category.level1En), `${path}.level1En`, 'required')
    bag.require(isNonEmptyString(category.level2En), `${path}.level2En`, 'required')
    bag.require(isBoolean(category.active), `${path}.active`, 'expected a boolean')
  })
}

function validateBusinessUnits(units: unknown[], bag: ErrorBag): void {
  units.forEach((unit, index) => {
    const path = `businessUnits[${index}]`
    if (!isRecord(unit)) return void bag.add(path, 'expected an object')

    bag.require(isNonEmptyString(unit.id), `${path}.id`, 'required')
    bag.require(isNonEmptyString(unit.code), `${path}.code`, 'required')
    bag.require(isNonEmptyString(unit.nameEn), `${path}.nameEn`, 'required')
    bag.require(
      unit.parentId === null || isNonEmptyString(unit.parentId),
      `${path}.parentId`,
      'expected a string or null',
    )
    bag.require(isBoolean(unit.active), `${path}.active`, 'expected a boolean')
  })
}

function validateCustomAttributes(attributes: unknown[], bag: ErrorBag): void {
  attributes.forEach((attribute, index) => {
    const path = `customAttributes[${index}]`
    if (!isRecord(attribute)) return void bag.add(path, 'expected an object')

    bag.require(isNonEmptyString(attribute.id), `${path}.id`, 'required')
    bag.require(isNonEmptyString(attribute.labelEn), `${path}.labelEn`, 'required')
    bag.require(isAttributeType(attribute.type), `${path}.type`, 'unknown attribute type')
    bag.require(isStringArray(attribute.options), `${path}.options`, 'expected a string array')
    bag.require(isBoolean(attribute.active), `${path}.active`, 'expected a boolean')
    bag.require(
      isBoolean(attribute.showInRegister),
      `${path}.showInRegister`,
      'expected a boolean',
    )
  })
}

function validateMatrix(matrix: unknown, bag: ErrorBag): void {
  if (!isRecord(matrix)) return void bag.add('matrix', 'expected an object')

  // Configuration envelope (CR-003) — repair fills these before validation.
  bag.require(isFiniteNumber(matrix.version), 'matrix.version', 'expected a number')
  bag.require(isNonEmptyString(matrix.scaleNameEn), 'matrix.scaleNameEn', 'required')
  if (bag.require(Array.isArray(matrix.levels), 'matrix.levels', 'expected an array')) {
    const keys = new Set(
      (matrix.levels as unknown[]).filter(isRecord).map((level) => level.key),
    )
    for (const rating of ['Low', 'Medium', 'High', 'Significant'] as const) {
      bag.require(keys.has(rating), 'matrix.levels', `missing level ${rating}`)
    }
  }

  if (!Array.isArray(matrix.cells)) {
    bag.add('matrix.cells', 'expected an array')
  } else {
    // All 25 intersections must exist — rating is resolved by exact cell.
    const seen = new Set<string>()
    matrix.cells.forEach((cell, index) => {
      const path = `matrix.cells[${index}]`
      if (!isRecord(cell)) return void bag.add(path, 'expected an object')

      const validImpact = bag.require(isScaleValue(cell.impact), `${path}.impact`, 'expected 1-5')
      const validLikelihood = bag.require(
        isScaleValue(cell.likelihood),
        `${path}.likelihood`,
        'expected 1-5',
      )
      bag.require(isRatingLabel(cell.rating), `${path}.rating`, 'unknown rating label')
      if (validImpact && validLikelihood) seen.add(`${String(cell.impact)}:${String(cell.likelihood)}`)
    })

    for (const impact of SCALE_VALUES) {
      for (const likelihood of SCALE_VALUES) {
        bag.require(
          seen.has(`${String(impact)}:${String(likelihood)}`),
          'matrix.cells',
          `missing cell impact ${String(impact)} x likelihood ${String(likelihood)}`,
        )
      }
    }
  }

  if (!isRecord(matrix.colors)) {
    bag.add('matrix.colors', 'expected an object')
  } else {
    for (const rating of ['Low', 'Medium', 'High', 'Significant'] as const) {
      bag.require(isNonEmptyString(matrix.colors[rating]), `matrix.colors.${rating}`, 'required')
    }
  }
}

function validateControlsAndActions(risk: Record<string, unknown>, path: string, bag: ErrorBag): void {
  if (Array.isArray(risk.controls)) {
    risk.controls.forEach((control, index) => {
      const controlPath = `${path}.controls[${index}]`
      if (!isRecord(control)) return void bag.add(controlPath, 'expected an object')

      bag.require(isNonEmptyString(control.id), `${controlPath}.id`, 'required')
      bag.require(isString(control.title), `${controlPath}.title`, 'expected a string')
      bag.require(isControlType(control.type), `${controlPath}.type`, 'unknown control type')
      bag.require(
        isControlAutomation(control.automation),
        `${controlPath}.automation`,
        'unknown automation type',
      )
      bag.require(
        isControlEffectiveness(control.status),
        `${controlPath}.status`,
        'unknown effectiveness status',
      )
      bag.require(isBoolean(control.keyControl), `${controlPath}.keyControl`, 'expected a boolean')
    })
  } else {
    bag.add(`${path}.controls`, 'expected an array')
  }

  if (Array.isArray(risk.actions)) {
    risk.actions.forEach((action, index) => {
      const actionPath = `${path}.actions[${index}]`
      if (!isRecord(action)) return void bag.add(actionPath, 'expected an object')

      bag.require(isNonEmptyString(action.id), `${actionPath}.id`, 'required')
      bag.require(isString(action.title), `${actionPath}.title`, 'expected a string')
      bag.require(isActionStatus(action.status), `${actionPath}.status`, 'unknown action status')
      bag.require(
        isActionPriority(action.priority),
        `${actionPath}.priority`,
        'unknown action priority',
      )
      if (bag.require(isFiniteNumber(action.progress), `${actionPath}.progress`, 'expected a number')) {
        const progress = action.progress as number
        bag.require(
          progress >= 0 && progress <= 100,
          `${actionPath}.progress`,
          'expected 0-100',
        )
      }
    })
  } else {
    bag.add(`${path}.actions`, 'expected an array')
  }
}

function validateRisks(risks: unknown[], bag: ErrorBag): void {
  risks.forEach((risk, index) => {
    const path = `risks[${index}]`
    if (!isRecord(risk)) return void bag.add(path, 'expected an object')

    bag.require(isNonEmptyString(risk.id), `${path}.id`, 'required')
    bag.require(isString(risk.ref), `${path}.ref`, 'expected a string')
    bag.require(isNonEmptyString(risk.title), `${path}.title`, 'required')
    bag.require(isRiskType(risk.type), `${path}.type`, 'expected Current or Emerging')
    bag.require(isNonEmptyString(risk.categoryId), `${path}.categoryId`, 'required')
    bag.require(isNonEmptyString(risk.businessUnitId), `${path}.businessUnitId`, 'required')
    bag.require(isNonEmptyString(risk.riskOwnerId), `${path}.riskOwnerId`, 'required')
    bag.require(isRiskStatus(risk.status), `${path}.status`, 'unknown risk status')
    bag.require(isResponseType(risk.responseType), `${path}.responseType`, 'unknown response type')
    bag.require(isOutlook(risk.outlook), `${path}.outlook`, 'unknown outlook')

    // Optional free text, but the key must exist — repair fills it (CR-002).
    bag.require(isString(risk.description), `${path}.description`, 'expected a string')

    // Cause, event and consequence are mandatory (ARCHITECTURE.md §8.2).
    bag.require(isNonEmptyString(risk.cause), `${path}.cause`, 'required')
    bag.require(isNonEmptyString(risk.event), `${path}.event`, 'required')
    bag.require(isNonEmptyString(risk.consequence), `${path}.consequence`, 'required')

    bag.require(isScore(risk.inherent), `${path}.inherent`, 'expected impact and likelihood 1-5')
    bag.require(isScore(risk.residual), `${path}.residual`, 'expected impact and likelihood 1-5')
    bag.require(isScore(risk.target), `${path}.target`, 'expected impact and likelihood 1-5')

    bag.require(isRecord(risk.custom), `${path}.custom`, 'expected an object')
    bag.require(Array.isArray(risk.history), `${path}.history`, 'expected an array')
    bag.require(Array.isArray(risk.audit), `${path}.audit`, 'expected an array')

    validateControlsAndActions(risk, path, bag)
  })
}

/**
 * Public demo requests.
 *
 * Every field is checked, because this collection is the one an unauthenticated
 * visitor can append to. `status`, `handledBy` and `handledAt` are handling
 * state the public form never sets, so a payload that carries a bad one is
 * rejected here rather than trusted.
 */
function validateDemoRequests(requests: unknown[], bag: ErrorBag): void {
  requests.forEach((request, index) => {
    const path = `demoRequests[${index}]`
    if (!isRecord(request)) return void bag.add(path, 'expected an object')

    bag.require(isNonEmptyString(request.id), `${path}.id`, 'required')
    bag.require(isNonEmptyString(request.submittedAt), `${path}.submittedAt`, 'required')
    bag.require(isNonEmptyString(request.email), `${path}.email`, 'required')

    for (const field of ['firstName', 'lastName', 'jobTitle', 'company', 'country', 'phone', 'message', 'handledBy', 'handledAt', 'notes'] as const) {
      bag.require(isString(request[field]), `${path}.${field}`, 'expected a string')
    }

    bag.require(isStringArray(request.solutionIds), `${path}.solutionIds`, 'expected a string array')
    bag.require(isBoolean(request.consent), `${path}.consent`, 'expected a boolean')
    bag.require(isLanguage(request.language), `${path}.language`, 'expected en or ka')
    bag.require(
      isDemoRequestStatus(request.status),
      `${path}.status`,
      'unknown demo request status',
    )
  })
}

/**
 * Control Register, findings and their join records (CR-2026).
 *
 * Structural only: a scale value is deliberately NOT checked against the
 * configured levels, because a level an administrator later removes must not
 * make previously valid state unloadable. The UI renders such a value as its
 * stored key instead.
 */
function validateControlRegister(state: Record<string, unknown>, bag: ErrorBag): void {
  if (Array.isArray(state.controls)) {
    state.controls.forEach((control, index) => {
      const path = `controls[${index}]`
      if (!isRecord(control)) return void bag.add(path, 'expected an object')

      bag.require(isNonEmptyString(control.id), `${path}.id`, 'required')
      bag.require(isNonEmptyString(control.ref), `${path}.ref`, 'required')
      bag.require(isNonEmptyString(control.businessUnitId), `${path}.businessUnitId`, 'required')
      for (const field of ['name', 'objective', 'ownerId', 'effectiveness', 'maturity', 'assurance'] as const) {
        bag.require(isString(control[field]), `${path}.${field}`, 'expected a string')
      }
      bag.require(Array.isArray(control.evidence), `${path}.evidence`, 'expected an array')
      bag.require(isRecord(control.custom), `${path}.custom`, 'expected an object')
    })
  }

  if (Array.isArray(state.controlDeficiencies)) {
    state.controlDeficiencies.forEach((deficiency, index) => {
      const path = `controlDeficiencies[${index}]`
      if (!isRecord(deficiency)) return void bag.add(path, 'expected an object')

      bag.require(isNonEmptyString(deficiency.id), `${path}.id`, 'required')
      bag.require(isNonEmptyString(deficiency.ref), `${path}.ref`, 'required')
      bag.require(isNonEmptyString(deficiency.controlId), `${path}.controlId`, 'required')
      bag.require(isNonEmptyString(deficiency.businessUnitId), `${path}.businessUnitId`, 'required')
      for (const field of ['description', 'classification', 'remediationOwnerId', 'remediationDescription', 'targetDate'] as const) {
        bag.require(isString(deficiency[field]), `${path}.${field}`, 'expected a string')
      }
      bag.require(isRecord(deficiency.custom), `${path}.custom`, 'expected an object')
    })
  }

  if (Array.isArray(state.controlRiskLinks)) {
    state.controlRiskLinks.forEach((link, index) => {
      const path = `controlRiskLinks[${index}]`
      if (!isRecord(link)) return void bag.add(path, 'expected an object')

      bag.require(isNonEmptyString(link.id), `${path}.id`, 'required')
      bag.require(isNonEmptyString(link.riskId), `${path}.riskId`, 'required')
      bag.require(isNonEmptyString(link.controlId), `${path}.controlId`, 'required')
    })
  }

  if (isRecord(state.controlConfig)) {
    for (const scale of ['effectiveness', 'maturity', 'assurance', 'classifications'] as const) {
      bag.require(Array.isArray(state.controlConfig[scale]), `controlConfig.${scale}`, 'expected an array')
    }
    bag.require(
      Array.isArray(state.controlConfig.customColumns),
      'controlConfig.customColumns',
      'expected an array',
    )
  } else {
    bag.add('controlConfig', 'expected an object')
  }
}

/**
 * Full canonical validation, applied AFTER migration and before persisting.
 *
 * Complements the permissive import gate: this is what guarantees the state
 * the application actually runs on matches the documented contract.
 */
export function validateAppState(value: unknown): ValidationResult<AppState> {
  const bag = new ErrorBag()

  if (!isRecord(value)) {
    return { ok: false, errors: ['root: expected a JSON object'] }
  }

  bag.require(isFiniteNumber(value.schemaVersion), 'schemaVersion', 'expected a number')

  for (const key of REQUIRED_COLLECTIONS) {
    bag.require(Array.isArray(value[key]), key, 'expected an array')
  }

  bag.require(isRecord(value.branding), 'branding', 'expected an object')
  bag.require(isRecord(value.ssoConfig), 'ssoConfig', 'expected an object')
  bag.require(isRecord(value.siteContent), 'siteContent', 'expected an object')

  if (Array.isArray(value.users)) validateUsers(value.users, bag)
  if (Array.isArray(value.roles)) validateRoles(value.roles, bag)
  if (Array.isArray(value.categories)) validateCategories(value.categories, bag)
  if (Array.isArray(value.businessUnits)) validateBusinessUnits(value.businessUnits, bag)
  if (Array.isArray(value.customAttributes)) validateCustomAttributes(value.customAttributes, bag)
  if (Array.isArray(value.risks)) validateRisks(value.risks, bag)
  if (Array.isArray(value.demoRequests)) validateDemoRequests(value.demoRequests, bag)
  validateControlRegister(value, bag)
  validateMatrix(value.matrix, bag)

  if (bag.errors.length > 0) return { ok: false, errors: bag.errors }
  return { ok: true, value: value as unknown as AppState }
}
