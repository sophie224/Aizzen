import type { DemoRequest, DemoRequestStatus, Language } from '../types/index.ts'
import { isCountryCode } from './countries.ts'

/*
 * Public demo-request intake — pure domain logic.
 *
 * No React, no I/O, no clock and no randomness: the caller supplies the id and
 * the timestamp, which is what lets the same rules run unchanged behind the
 * Phase 2 intake endpoint, where they become the authoritative check. The
 * Phase 1 form is a convenience, not a trust boundary — a server must validate
 * again regardless of what the browser sent.
 */

/** What the form holds while the visitor is typing. */
export interface DemoRequestDraft {
  firstName: string
  lastName: string
  email: string
  jobTitle: string
  company: string
  country: string
  phone: string
  solutionIds: string[]
  message: string
  consent: boolean
}

/** The fields a validation message can be attached to. */
export type DemoRequestField = Exclude<keyof DemoRequestDraft, 'message'>

/**
 * One message key per rejected field, keyed by field so the form can render it
 * against the input it belongs to rather than as a wall of text at the top.
 */
export type DemoRequestErrors = Partial<Record<DemoRequestField, string>>

/** Longest accepted value per free-text field — a submission is not an essay. */
const MAX_LENGTHS: Record<keyof DemoRequestDraft, number> = {
  firstName: 80,
  lastName: 80,
  email: 254,
  jobTitle: 120,
  company: 160,
  country: 80,
  phone: 40,
  solutionIds: 0,
  message: 2000,
  consent: 0,
}

/**
 * Deliberately permissive: one `@`, something either side, a dot in the
 * domain. Anything stricter rejects addresses that are perfectly valid, and
 * the only authoritative test of an address is sending mail to it.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/** Digits, spaces and the punctuation phone numbers are actually written with. */
const PHONE_PATTERN = /^[+()\-.\s\d]{6,}$/

export function blankDemoRequestDraft(): DemoRequestDraft {
  return {
    firstName: '',
    lastName: '',
    email: '',
    jobTitle: '',
    company: '',
    country: '',
    phone: '',
    solutionIds: [],
    message: '',
    // Never pre-ticked: consent that was not given is not consent.
    consent: false,
  }
}

/** Trims every text field and lower-cases the email. */
export function normaliseDemoRequestDraft(draft: DemoRequestDraft): DemoRequestDraft {
  return {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    email: draft.email.trim().toLowerCase(),
    jobTitle: draft.jobTitle.trim(),
    company: draft.company.trim(),
    country: draft.country.trim(),
    phone: draft.phone.trim(),
    solutionIds: [...new Set(draft.solutionIds)],
    message: draft.message.trim(),
    consent: draft.consent,
  }
}

/**
 * Checks a draft and returns a message key per rejected field.
 *
 * Returns keys rather than sentences so the form renders them in the active
 * language — the domain layer stays free of presentation.
 */
export function validateDemoRequestDraft(draft: DemoRequestDraft): DemoRequestErrors {
  const value = normaliseDemoRequestDraft(draft)
  const errors: DemoRequestErrors = {}

  const required: DemoRequestField[] = [
    'firstName',
    'lastName',
    'email',
    'jobTitle',
    'company',
    'country',
    'phone',
  ]
  for (const field of required) {
    const text = value[field] as string
    if (text.length === 0) errors[field] = 'demo.error.required'
    else if (text.length > MAX_LENGTHS[field]) errors[field] = 'demo.error.tooLong'
  }

  if (!errors.email && !EMAIL_PATTERN.test(value.email)) errors.email = 'demo.error.email'
  if (!errors.phone && !PHONE_PATTERN.test(value.phone)) errors.phone = 'demo.error.phone'
  // The picker only offers ISO codes; anything else was not typed by a visitor.
  if (!errors.country && !isCountryCode(value.country)) errors.country = 'demo.error.country'
  if (value.solutionIds.length === 0) errors.solutionIds = 'demo.error.solutions'
  if (!value.consent) errors.consent = 'demo.error.consent'

  return errors
}

export function hasDemoRequestErrors(errors: DemoRequestErrors): boolean {
  return Object.keys(errors).length > 0
}

export interface CreateDemoRequestOptions {
  /** `demo_<timestamp>_<random>`, minted by the caller. */
  id: string
  /** UTC ISO 8601, read from the caller's clock. */
  submittedAt: string
  language: Language
  /** Ids that exist on the site right now; anything else is dropped. */
  knownSolutionIds: readonly string[]
}

/**
 * Builds the record to persist.
 *
 * `status` always starts at `New` and `handledBy`/`handledAt` always start
 * empty — a submitted form can never set its own handling state, which is the
 * same field-level rule that protects owner-scoped risk saves
 * (ARCHITECTURE.md §5.5). Unknown solution ids are dropped rather than stored,
 * so a crafted payload cannot plant a dangling reference.
 */
export function createDemoRequest(
  draft: DemoRequestDraft,
  options: CreateDemoRequestOptions,
): DemoRequest {
  const value = normaliseDemoRequestDraft(draft)
  const known = new Set(options.knownSolutionIds)

  return {
    id: options.id,
    submittedAt: options.submittedAt,

    firstName: value.firstName,
    lastName: value.lastName,
    email: value.email,
    jobTitle: value.jobTitle,
    company: value.company,
    country: value.country,
    phone: value.phone,
    solutionIds: value.solutionIds.filter((id) => known.has(id)),
    message: value.message,
    consent: value.consent,
    language: options.language,

    status: 'New',
    handledBy: '',
    handledAt: '',
    notes: '',
  }
}

/** Display name; falls back to the email when a name somehow arrived empty. */
export function demoRequestName(request: DemoRequest): string {
  const name = `${request.firstName} ${request.lastName}`.trim()
  return name.length > 0 ? name : request.email
}

/** Newest first — the order an intake queue is worked in. */
export function sortDemoRequests(requests: readonly DemoRequest[]): DemoRequest[] {
  return [...requests].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
}

/** How many requests sit in each handling state. Derived, never stored. */
export function countDemoRequestsByStatus(
  requests: readonly DemoRequest[],
): Record<DemoRequestStatus, number> {
  const counts: Record<DemoRequestStatus, number> = {
    New: 0,
    Contacted: 0,
    Qualified: 0,
    Closed: 0,
  }
  for (const request of requests) counts[request.status] += 1
  return counts
}

export { COUNTRY_CODES, countryName, countryOptions, isCountryCode } from './countries.ts'
