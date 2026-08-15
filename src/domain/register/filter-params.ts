import { ASSESSMENT_TYPES, RATING_LABELS, RISK_STATUSES, RISK_TYPES, OUTLOOKS, SCALE_VALUES } from '../types/enums.ts'
import type { RiskFilters } from '../types/index.ts'

/*
 * Filter ⇄ URL encoding (CR-004).
 *
 * The dashboard puts its filter state in the query string so a filtered view
 * can be shared or bookmarked, and drill-through hands the Register the same
 * keys. One encoder, so the two sides cannot disagree about what `status=` or
 * `impact=` mean.
 *
 * Decoding is DEFENSIVE: a hand-edited or stale URL yields the filters it can
 * parse and silently drops what it cannot, rather than throwing at the user.
 */

const memberOf = <T extends string>(values: readonly T[], raw: string | null): T | undefined =>
  raw !== null && (values as readonly string[]).includes(raw) ? (raw as T) : undefined

function scaleValue(raw: string | null) {
  const parsed = Number(raw)
  return SCALE_VALUES.find((value) => value === parsed)
}

const isoDate = (raw: string | null) => (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined)

const flag = (raw: string | null) => (raw === '1' || raw === 'true' ? true : undefined)

/** Reads every recognised filter out of a query string. */
export function filtersFromParams(params: URLSearchParams): RiskFilters {
  const filters: RiskFilters = {}

  const put = <K extends keyof RiskFilters>(key: K, value: RiskFilters[K]) => {
    if (value !== undefined) filters[key] = value
  }

  put('categoryId', params.get('categoryId') ?? undefined)
  put('categoryLevel1', params.get('categoryLevel1') ?? undefined)
  put('businessUnitId', params.get('businessUnitId') ?? undefined)
  put('riskOwnerId', params.get('riskOwnerId') ?? undefined)
  put('residualRating', memberOf(RATING_LABELS, params.get('residualRating')))
  put('status', memberOf(RISK_STATUSES, params.get('status')))
  put('outlook', memberOf(OUTLOOKS, params.get('outlook')))
  put('riskType', memberOf(RISK_TYPES, params.get('riskType')))
  put('basis', memberOf(ASSESSMENT_TYPES, params.get('basis')))
  put('impact', scaleValue(params.get('impact')))
  put('likelihood', scaleValue(params.get('likelihood')))
  put('targetFrom', isoDate(params.get('targetFrom')))
  put('targetTo', isoDate(params.get('targetTo')))
  put('open', flag(params.get('open')))
  put('aboveTarget', flag(params.get('aboveTarget')))
  put('aboveAppetite', flag(params.get('aboveAppetite')))
  put('hasOverdueAction', flag(params.get('hasOverdueAction')))
  put('reviewDueSoon', flag(params.get('reviewDueSoon')))

  return filters
}

/**
 * Writes filters into a query string.
 *
 * Absent and empty values are omitted entirely, so a cleared filter leaves no
 * trace in the URL and a shared link carries only what is actually applied.
 */
export function filtersToParams(filters: RiskFilters, search = ''): URLSearchParams {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === '' || value === false) continue
    params.set(key, value === true ? '1' : String(value))
  }

  if (search.trim().length > 0) params.set('search', search.trim())
  return params
}

/** `/app/register?…` for a drill-through into exactly this population. */
export function registerLinkFor(filters: RiskFilters, search = ''): string {
  const params = filtersToParams(filters, search)
  const query = params.toString()
  return query.length > 0 ? `/app/register?${query}` : '/app/register'
}

/** True when any filter is narrowing the set. */
export function hasActiveFilters(filters: RiskFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined && value !== '' && value !== false)
}
