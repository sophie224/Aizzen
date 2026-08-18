import type { Language } from '../types/index.ts'

/*
 * Country reference list for the demo-request form.
 *
 * ISO 3166-1 alpha-2 CODES are what gets stored — a stable opaque id, exactly
 * as every other reference in the model. The display name is resolved at
 * runtime through `Intl.DisplayNames`, so the list is localised in both
 * English and ქართული without shipping (or maintaining) a second translation
 * table, and a stored request stays readable whatever language it is read in.
 */

/** Inhabited ISO 3166-1 alpha-2 regions. */
const CODES =
  'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ ' +
  'BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ ' +
  'DE DJ DK DM DO DZ EC EE EG EH ER ES ET ' +
  'FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY ' +
  'HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT ' +
  'JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ ' +
  'LA LB LC LI LK LR LS LT LU LV LY ' +
  'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ ' +
  'NA NC NE NF NG NI NL NO NP NR NU NZ OM ' +
  'PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA ' +
  'RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ ' +
  'TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
  'UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'

export const COUNTRY_CODES: readonly string[] = CODES.split(' ')

const CODE_SET = new Set(COUNTRY_CODES)

/** True when the value is one of the codes the form offers. */
export function isCountryCode(value: unknown): value is string {
  return typeof value === 'string' && CODE_SET.has(value)
}

const NAME_CACHE = new Map<Language, Intl.DisplayNames | null>()

function displayNames(language: Language): Intl.DisplayNames | null {
  if (!NAME_CACHE.has(language)) {
    let formatter: Intl.DisplayNames | null
    try {
      formatter = new Intl.DisplayNames([language === 'ka' ? 'ka' : 'en'], { type: 'region' })
    } catch {
      // An environment without the region data still has to render something.
      formatter = null
    }
    NAME_CACHE.set(language, formatter)
  }
  return NAME_CACHE.get(language) ?? null
}

/**
 * The country's name in the active language.
 *
 * Falls back to the code itself rather than blank — an unknown or retired code
 * on an old request must stay legible (ARCHITECTURE.md §9).
 */
export function countryName(code: string, language: Language): string {
  return displayNames(language)?.of(code) ?? code
}

/** The list a picker renders: codes with names, sorted for the language. */
export function countryOptions(language: Language): Array<{ code: string; name: string }> {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code, language) })).sort((a, b) =>
    a.name.localeCompare(b.name, language === 'ka' ? 'ka' : 'en'),
  )
}
