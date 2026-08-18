import { describe, expect, it } from 'vitest'
import {
  blankDemoRequestDraft,
  countDemoRequestsByStatus,
  countryName,
  countryOptions,
  createDemoRequest,
  demoRequestName,
  hasDemoRequestErrors,
  isCountryCode,
  normaliseDemoRequestDraft,
  sortDemoRequests,
  validateDemoRequestDraft,
  type DemoRequestDraft,
} from './index.ts'
import type { DemoRequest } from '../types/index.ts'

/*
 * Public demo-request intake (ARCHITECTURE.md §8.5).
 *
 * The rules are tested here rather than through the form, because in Phase 2
 * the same functions run server-side, where there is no form at all.
 */

function validDraft(overrides: Partial<DemoRequestDraft> = {}): DemoRequestDraft {
  return {
    ...blankDemoRequestDraft(),
    firstName: 'Nino',
    lastName: 'Beridze',
    email: 'nino.beridze@example.com',
    jobTitle: 'Head of Risk',
    company: 'Example Bank',
    country: 'GE',
    phone: '+995 32 200 00 00',
    solutionIds: ['solution_risk'],
    consent: true,
    ...overrides,
  }
}

const CREATE_OPTIONS = {
  id: 'demo_test_0001',
  submittedAt: '2026-08-17T09:30:00.000Z',
  language: 'en' as const,
  knownSolutionIds: ['solution_risk', 'solution_compliance'],
}

describe('demo request draft', () => {
  it('starts blank, with consent unticked', () => {
    const draft = blankDemoRequestDraft()

    // Consent that was not given is not consent — it can never default to true.
    expect(draft.consent).toBe(false)
    expect(draft.solutionIds).toEqual([])
    expect(draft.email).toBe('')
  })

  it('accepts a complete draft', () => {
    expect(validateDemoRequestDraft(validDraft())).toEqual({})
    expect(hasDemoRequestErrors({})).toBe(false)
  })

  it('reports one message key per missing required field', () => {
    const errors = validateDemoRequestDraft(blankDemoRequestDraft())

    expect(errors.firstName).toBe('demo.error.required')
    expect(errors.lastName).toBe('demo.error.required')
    expect(errors.email).toBe('demo.error.required')
    expect(errors.jobTitle).toBe('demo.error.required')
    expect(errors.company).toBe('demo.error.required')
    expect(errors.phone).toBe('demo.error.required')
    expect(errors.country).toBe('demo.error.required')
    expect(errors.solutionIds).toBe('demo.error.solutions')
    expect(errors.consent).toBe('demo.error.consent')
  })

  it('treats whitespace as empty', () => {
    const errors = validateDemoRequestDraft(validDraft({ company: '   ' }))
    expect(errors.company).toBe('demo.error.required')
  })

  it('rejects a malformed email but accepts ordinary ones', () => {
    expect(validateDemoRequestDraft(validDraft({ email: 'nino' })).email).toBe('demo.error.email')
    expect(validateDemoRequestDraft(validDraft({ email: 'nino@bank' })).email).toBe(
      'demo.error.email',
    )
    expect(
      validateDemoRequestDraft(validDraft({ email: 'nino.b+demo@risk.example.co.uk' })).email,
    ).toBeUndefined()
  })

  it('accepts phone numbers as people write them', () => {
    expect(validateDemoRequestDraft(validDraft({ phone: '(555) 010-2030' })).phone).toBeUndefined()
    expect(validateDemoRequestDraft(validDraft({ phone: '+44 147 042 2054' })).phone).toBeUndefined()
    expect(validateDemoRequestDraft(validDraft({ phone: 'call me' })).phone).toBe('demo.error.phone')
  })

  it('requires a country the picker actually offers', () => {
    expect(validateDemoRequestDraft(validDraft({ country: 'Georgia' })).country).toBe(
      'demo.error.country',
    )
    expect(validateDemoRequestDraft(validDraft({ country: 'ZZ' })).country).toBe(
      'demo.error.country',
    )
  })

  it('rejects an over-length value', () => {
    const errors = validateDemoRequestDraft(validDraft({ firstName: 'a'.repeat(200) }))
    expect(errors.firstName).toBe('demo.error.tooLong')
  })

  it('trims text and lower-cases the email', () => {
    const value = normaliseDemoRequestDraft(
      validDraft({ firstName: '  Nino ', email: '  Nino.Beridze@Example.COM ' }),
    )

    expect(value.firstName).toBe('Nino')
    expect(value.email).toBe('nino.beridze@example.com')
  })
})

describe('creating the record', () => {
  it('stores normalised values with the caller-supplied id and timestamp', () => {
    const request = createDemoRequest(validDraft({ email: 'NINO@EXAMPLE.COM ' }), CREATE_OPTIONS)

    expect(request.id).toBe('demo_test_0001')
    expect(request.submittedAt).toBe('2026-08-17T09:30:00.000Z')
    expect(request.email).toBe('nino@example.com')
    expect(request.language).toBe('en')
    expect(request.country).toBe('GE')
  })

  /*
   * A submitted form can never set its own handling state — the same
   * field-level rule that protects owner-scoped risk saves (§5.5).
   */
  it('always starts as New, unhandled, whatever the payload claims', () => {
    const crafted = {
      ...validDraft(),
      status: 'Closed',
      handledBy: 'user_super_admin',
      notes: 'planted',
    } as DemoRequestDraft

    const request = createDemoRequest(crafted, CREATE_OPTIONS)

    expect(request.status).toBe('New')
    expect(request.handledBy).toBe('')
    expect(request.handledAt).toBe('')
    expect(request.notes).toBe('')
  })

  it('drops solution references that do not exist', () => {
    const request = createDemoRequest(
      validDraft({ solutionIds: ['solution_risk', 'solution_ghost'] }),
      CREATE_OPTIONS,
    )

    expect(request.solutionIds).toEqual(['solution_risk'])
  })

  it('de-duplicates repeated selections', () => {
    const request = createDemoRequest(
      validDraft({ solutionIds: ['solution_risk', 'solution_risk'] }),
      CREATE_OPTIONS,
    )

    expect(request.solutionIds).toEqual(['solution_risk'])
  })
})

describe('reading the intake queue', () => {
  const make = (id: string, submittedAt: string, status: DemoRequest['status']): DemoRequest => ({
    ...createDemoRequest(validDraft(), { ...CREATE_OPTIONS, id, submittedAt }),
    status,
  })

  it('sorts newest first', () => {
    const requests = [
      make('demo_a', '2026-01-01T00:00:00.000Z', 'New'),
      make('demo_b', '2026-08-01T00:00:00.000Z', 'New'),
      make('demo_c', '2026-04-01T00:00:00.000Z', 'New'),
    ]

    expect(sortDemoRequests(requests).map((request) => request.id)).toEqual([
      'demo_b',
      'demo_c',
      'demo_a',
    ])
  })

  it('counts every status, including the empty ones', () => {
    const counts = countDemoRequestsByStatus([
      make('demo_a', '2026-01-01T00:00:00.000Z', 'New'),
      make('demo_b', '2026-01-02T00:00:00.000Z', 'Contacted'),
      make('demo_c', '2026-01-03T00:00:00.000Z', 'New'),
    ])

    expect(counts).toEqual({ New: 2, Contacted: 1, Qualified: 0, Closed: 0 })
  })

  it('falls back to the email when a name is missing', () => {
    const request = createDemoRequest(
      { ...validDraft(), firstName: '', lastName: '' },
      CREATE_OPTIONS,
    )

    expect(demoRequestName(request)).toBe('nino.beridze@example.com')
  })
})

describe('countries', () => {
  it('recognises ISO codes and rejects anything else', () => {
    expect(isCountryCode('GE')).toBe(true)
    expect(isCountryCode('US')).toBe(true)
    expect(isCountryCode('Georgia')).toBe(false)
    expect(isCountryCode('')).toBe(false)
  })

  it('resolves names per language and never renders blank', () => {
    expect(countryName('GE', 'en')).toBe('Georgia')
    expect(countryName('GE', 'ka')).toBe('საქართველო')
    // Falls back to the code rather than blanking an old or retired value.
    expect(countryName('QQ', 'en')).toBe('QQ')
  })

  it('offers every code, sorted by the displayed name', () => {
    const options = countryOptions('en')
    const names = options.map((option) => option.name)

    expect(options.length).toBeGreaterThan(200)
    expect([...names].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(names)
  })
})
