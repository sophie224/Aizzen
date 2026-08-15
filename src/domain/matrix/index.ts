import { RATING_LABELS, SCALE_VALUES } from '../types/enums.ts'
import type { RatingLabel, ScaleValue } from '../types/enums.ts'
import type { ImpactLabel, LikelihoodLabel, RatingMatrix } from '../types/index.ts'

/*
 * Rating-matrix CONFIGURATION (CR-003).
 *
 * `src/domain/risk-engine` reads the matrix — score, rating, colour, labels.
 * This module edits and validates it: the pure transforms behind the
 * administration screen's draft, and the rules that decide whether that draft
 * may be saved.
 *
 * Nothing here touches the score. Score is Impact × Likelihood, always, and no
 * label, band or name change can affect it (ARCHITECTURE.md §7).
 */

export const SCALE_NAME_MAX_LENGTH = 40
export const LEVEL_NAME_MAX_LENGTH = 40
export const DESCRIPTION_MAX_LENGTH = 500

/** Field key plus a message key the UI resolves through i18n. */
export interface MatrixConfigIssue {
  /** Addresses one control, e.g. `impact.3.name` or `likelihood.2.percentTo`. */
  field: string
  messageKey: string
}

export interface MatrixConfigReview {
  /** Blocking — saving is refused while any of these remain. */
  readonly errors: MatrixConfigIssue[]
  /** Advisory — surfaced, but never blocking (CR-003 Task 4). */
  readonly warnings: MatrixConfigIssue[]
}

const blank = (value: string | undefined) => (value ?? '').trim().length === 0
const tooLong = (value: string | undefined, max: number) => (value ?? '').trim().length > max

/** Case-insensitive duplicate detection over the English names. */
function duplicates(names: readonly string[]): Set<number> {
  const seen = new Map<string, number>()
  const clashes = new Set<number>()

  names.forEach((name, index) => {
    const key = name.trim().toLowerCase()
    if (key.length === 0) return
    const first = seen.get(key)
    if (first === undefined) seen.set(key, index)
    else {
      clashes.add(first)
      clashes.add(index)
    }
  })

  return clashes
}

/**
 * Validates a draft configuration.
 *
 * Uniqueness is checked on the ENGLISH name only: it is the required value and
 * the fallback every locale resolves to, so two levels that differ only in
 * their Georgian translation would still read identically to most users.
 */
export function validateMatrixConfiguration(matrix: RatingMatrix): MatrixConfigReview {
  const errors: MatrixConfigIssue[] = []
  const warnings: MatrixConfigIssue[] = []

  if (blank(matrix.scaleNameEn)) {
    errors.push({ field: 'scaleName', messageKey: 'admin.matrix.error.nameRequired' })
  } else if (tooLong(matrix.scaleNameEn, SCALE_NAME_MAX_LENGTH) || tooLong(matrix.scaleNameKa, SCALE_NAME_MAX_LENGTH)) {
    errors.push({ field: 'scaleName', messageKey: 'admin.matrix.error.nameTooLong' })
  }

  // --- rating levels ---------------------------------------------------------
  const levels = RATING_LABELS.map((key) => matrix.levels?.find((level) => level.key === key))
  const levelClashes = duplicates(levels.map((level) => level?.nameEn ?? ''))

  levels.forEach((level, index) => {
    const field = `level.${RATING_LABELS[index]}.name`
    if (!level || blank(level.nameEn)) {
      errors.push({ field, messageKey: 'admin.matrix.error.nameRequired' })
      return
    }
    if (tooLong(level.nameEn, LEVEL_NAME_MAX_LENGTH) || tooLong(level.nameKa, LEVEL_NAME_MAX_LENGTH)) {
      errors.push({ field, messageKey: 'admin.matrix.error.nameTooLong' })
    }
    if (levelClashes.has(index)) {
      errors.push({ field, messageKey: 'admin.matrix.error.nameDuplicate' })
    }
  })

  // --- impact criteria -------------------------------------------------------
  const impacts = SCALE_VALUES.map((value) => matrix.impactLabels[value] as ImpactLabel | undefined)
  const impactClashes = duplicates(impacts.map((label) => label?.en ?? ''))

  SCALE_VALUES.forEach((value, index) => {
    const label = impacts[index]
    if (!label || blank(label.en)) {
      errors.push({ field: `impact.${String(value)}.name`, messageKey: 'admin.matrix.error.nameRequired' })
      return
    }
    if (tooLong(label.en, LEVEL_NAME_MAX_LENGTH) || tooLong(label.ka, LEVEL_NAME_MAX_LENGTH)) {
      errors.push({ field: `impact.${String(value)}.name`, messageKey: 'admin.matrix.error.nameTooLong' })
    }
    if (impactClashes.has(index)) {
      errors.push({ field: `impact.${String(value)}.name`, messageKey: 'admin.matrix.error.nameDuplicate' })
    }
    if (
      tooLong(label.descriptionEn, DESCRIPTION_MAX_LENGTH) ||
      tooLong(label.descriptionKa, DESCRIPTION_MAX_LENGTH)
    ) {
      errors.push({
        field: `impact.${String(value)}.description`,
        messageKey: 'admin.matrix.error.descriptionTooLong',
      })
    }
  })

  // --- likelihood criteria ---------------------------------------------------
  const likelihoods = SCALE_VALUES.map(
    (value) => matrix.likelihoodLabels[value] as LikelihoodLabel | undefined,
  )
  const likelihoodClashes = duplicates(likelihoods.map((label) => label?.en ?? ''))

  SCALE_VALUES.forEach((value, index) => {
    const label = likelihoods[index]
    const path = `likelihood.${String(value)}`

    if (!label || blank(label.en)) {
      errors.push({ field: `${path}.name`, messageKey: 'admin.matrix.error.nameRequired' })
      return
    }
    if (tooLong(label.en, LEVEL_NAME_MAX_LENGTH) || tooLong(label.ka, LEVEL_NAME_MAX_LENGTH)) {
      errors.push({ field: `${path}.name`, messageKey: 'admin.matrix.error.nameTooLong' })
    }
    if (likelihoodClashes.has(index)) {
      errors.push({ field: `${path}.name`, messageKey: 'admin.matrix.error.nameDuplicate' })
    }
    if (
      tooLong(label.descriptionEn, DESCRIPTION_MAX_LENGTH) ||
      tooLong(label.descriptionKa, DESCRIPTION_MAX_LENGTH)
    ) {
      errors.push({ field: `${path}.description`, messageKey: 'admin.matrix.error.descriptionTooLong' })
    }

    const { percentFrom, percentTo } = label
    const hasFrom = typeof percentFrom === 'number'
    const hasTo = typeof percentTo === 'number'

    // A band is all-or-nothing: half a band cannot be rendered or compared.
    if (hasFrom !== hasTo) {
      errors.push({ field: `${path}.percent`, messageKey: 'admin.matrix.error.percentIncomplete' })
    }

    if (hasFrom && (percentFrom < 0 || percentFrom > 100)) {
      errors.push({ field: `${path}.percentFrom`, messageKey: 'admin.matrix.error.percentRange' })
    }
    if (hasTo && (percentTo < 0 || percentTo > 100)) {
      errors.push({ field: `${path}.percentTo`, messageKey: 'admin.matrix.error.percentRange' })
    }
    if (hasFrom && hasTo && percentFrom > percentTo) {
      errors.push({ field: `${path}.percent`, messageKey: 'admin.matrix.error.percentOrder' })
    }

    // Text-only likelihood is legitimate; a level with neither is not.
    if (!hasFrom && !hasTo && blank(label.textEn)) {
      errors.push({ field: `${path}.percent`, messageKey: 'admin.matrix.error.bandOrText' })
    }
  })

  // --- overlap and coverage across levels ------------------------------------
  const bands = SCALE_VALUES.map((value) => ({ value, label: likelihoods[value - 1] }))
    .filter(
      (entry): entry is { value: ScaleValue; label: LikelihoodLabel } =>
        typeof entry.label?.percentFrom === 'number' && typeof entry.label.percentTo === 'number',
    )
    .map((entry) => ({
      value: entry.value,
      from: entry.label.percentFrom as number,
      to: entry.label.percentTo as number,
    }))
    .sort((a, b) => a.from - b.from)

  for (let index = 1; index < bands.length; index += 1) {
    const previous = bands[index - 1]
    const current = bands[index]
    if (current.from <= previous.to) {
      errors.push({
        field: `likelihood.${String(current.value)}.percent`,
        messageKey: 'admin.matrix.error.percentOverlap',
      })
    }
  }

  // Gaps are a judgement call, not a defect — warn, never block.
  if (bands.length > 0) {
    const covers = bands[0].from <= 0 && bands[bands.length - 1].to >= 100
    const contiguous = bands.every(
      (band, index) => index === 0 || band.from <= bands[index - 1].to + 1,
    )
    if (!covers || !contiguous) {
      warnings.push({ field: 'likelihood.coverage', messageKey: 'admin.matrix.warning.coverage' })
    }
  }

  return { errors, warnings }
}

// --- draft transforms --------------------------------------------------------

/** Replaces one cell's rating, leaving the other 24 untouched. */
export function setMatrixCell(
  matrix: RatingMatrix,
  impact: ScaleValue,
  likelihood: ScaleValue,
  rating: RatingLabel,
): RatingMatrix {
  return {
    ...matrix,
    cells: matrix.cells.map((cell) =>
      cell.impact === impact && cell.likelihood === likelihood ? { ...cell, rating } : cell,
    ),
  }
}

export function setScaleName(
  matrix: RatingMatrix,
  language: 'en' | 'ka',
  value: string,
): RatingMatrix {
  return language === 'en'
    ? { ...matrix, scaleNameEn: value }
    : { ...matrix, scaleNameKa: value }
}

/** Renames one level. The stable `key` is never touched (CR-003 Task 2). */
export function setRatingLevelName(
  matrix: RatingMatrix,
  key: RatingLabel,
  language: 'en' | 'ka',
  value: string,
): RatingMatrix {
  return {
    ...matrix,
    levels: matrix.levels.map((level) =>
      level.key === key ? { ...level, [language === 'en' ? 'nameEn' : 'nameKa']: value } : level,
    ),
  }
}

export function setRatingColor(
  matrix: RatingMatrix,
  key: RatingLabel,
  color: string,
): RatingMatrix {
  return { ...matrix, colors: { ...matrix.colors, [key]: color } }
}

export function setImpactLevel(
  matrix: RatingMatrix,
  value: ScaleValue,
  patch: Partial<ImpactLabel>,
): RatingMatrix {
  return {
    ...matrix,
    impactLabels: {
      ...matrix.impactLabels,
      [value]: { ...matrix.impactLabels[value], ...patch },
    },
  }
}

export function setLikelihoodLevel(
  matrix: RatingMatrix,
  value: ScaleValue,
  patch: Partial<LikelihoodLabel>,
): RatingMatrix {
  return {
    ...matrix,
    likelihoodLabels: {
      ...matrix.likelihoodLabels,
      [value]: { ...matrix.likelihoodLabels[value], ...patch },
    },
  }
}

/**
 * Human-readable summary of what a save changed, for the audit trail.
 *
 * Named per area rather than per field: the audit answers "what did this
 * administrator touch", and the archived version carries the exact values.
 */
export function diffMatrixConfiguration(before: RatingMatrix, after: RatingMatrix): string[] {
  const changes: string[] = []
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

  if (before.scaleNameEn !== after.scaleNameEn || before.scaleNameKa !== after.scaleNameKa) {
    changes.push(`Scale name: ${before.scaleNameEn} → ${after.scaleNameEn}`)
  }
  if (!same(before.levels, after.levels)) changes.push('Rating level names: changed')
  if (!same(before.colors, after.colors)) changes.push('Rating colours: changed')
  if (!same(before.impactLabels, after.impactLabels)) changes.push('Impact criteria: changed')
  if (!same(before.likelihoodLabels, after.likelihoodLabels)) changes.push('Likelihood criteria: changed')

  const movedCells = after.cells.filter((cell) => {
    const previous = before.cells.find(
      (candidate) => candidate.impact === cell.impact && candidate.likelihood === cell.likelihood,
    )
    return previous && previous.rating !== cell.rating
  })
  if (movedCells.length > 0) {
    changes.push(`Cell ratings: ${String(movedCells.length)} changed`)
  }

  return changes.length > 0 ? changes : ['Configuration saved']
}
