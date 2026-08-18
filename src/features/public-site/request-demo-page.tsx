import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  blankDemoRequestDraft,
  countryOptions,
  createDemoRequest,
  hasDemoRequestErrors,
  validateDemoRequestDraft,
  type DemoRequestDraft,
  type DemoRequestErrors,
  type DemoRequestField,
} from '../../domain/demo-requests/index.ts'
import { pickLanguage, useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { PublicFooter } from './public-footer.tsx'
import { PublicHeader } from './public-header.tsx'
import { scrollToTop } from './scrolling.ts'
import { SiteIcon } from './site-icons.tsx'
import './public-site.css'
import './request-demo.css'

/*
 * Public "Request a demo" page (ARCHITECTURE.md §8.5).
 *
 * The front door for a visitor who is not a user yet. It is marketing intake
 * and nothing more: a submission creates no account, grants no permission and
 * changes no risk data. Accounts stay administrator-created, which is the same
 * rule that keeps Google sign-in from auto-provisioning anybody
 * (ARCHITECTURE.md §6.2).
 *
 * Copy — headline, description, highlights, the consent sentence and the
 * acknowledgement — is site content edited in Website Administration, so no
 * marketing sentence is hard-coded here. Field labels and validation messages
 * are chrome and come from the dictionary.
 *
 * The rules live in `domain/demo-requests`: this component collects input,
 * renders the message keys the domain returns and hands the record to the one
 * mutation transaction. It reimplements no validation of its own, and it never
 * touches storage directly.
 *
 * Phase 1 honesty: the submission is written to the same browser-local state as
 * everything else, and the page says so rather than implying a server pipeline
 * the prototype does not have.
 */

/** Reads the demo-request id the store will persist under. */
function createRequestId(): string {
  return `demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** The plain text inputs — country is a picker and consent is a checkbox. */
type TextField = Exclude<DemoRequestField, 'solutionIds' | 'consent' | 'country'>

/** Text fields, in the order they are rendered and focused. */
const TEXT_FIELDS: ReadonlyArray<{
  field: TextField
  labelKey: TranslationKey
  type: 'text' | 'email' | 'tel'
  autoComplete: string
  /** Renders full width rather than as half of a pair. */
  wide?: boolean
}> = [
  { field: 'firstName', labelKey: 'demo.field.firstName', type: 'text', autoComplete: 'given-name' },
  { field: 'lastName', labelKey: 'demo.field.lastName', type: 'text', autoComplete: 'family-name' },
  { field: 'email', labelKey: 'demo.field.email', type: 'email', autoComplete: 'email', wide: true },
  {
    field: 'jobTitle',
    labelKey: 'demo.field.jobTitle',
    type: 'text',
    autoComplete: 'organization-title',
  },
  { field: 'company', labelKey: 'demo.field.company', type: 'text', autoComplete: 'organization' },
  { field: 'phone', labelKey: 'demo.field.phone', type: 'tel', autoComplete: 'tel', wide: true },
]

export function PublicRequestDemoPage() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()

  const fieldId = useId()
  const formRef = useRef<HTMLFormElement>(null)

  const [draft, setDraft] = useState<DemoRequestDraft>(blankDemoRequestDraft)
  const [errors, setErrors] = useState<DemoRequestErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    scrollToTop(false)
  }, [])

  // 249 regions through Intl, sorted for the active language — rebuilt only
  // when the language actually changes.
  const countries = useMemo(() => countryOptions(language), [language])

  // Same element order as the loaded page, so the header survives the swap.
  const content = state?.siteContent
  if (!content) {
    return (
      <div className="aizen-public-site aizen-request-demo-page">
        <PublicHeader />
        <main id="public-main">
          <p className="aizen-public-loading">{t('state.loading')}</p>
        </main>
        <PublicFooter />
      </div>
    )
  }

  const text = (en: string, ka: string) => pickLanguage(en, ka, language)
  const solutions = [...content.solutions].sort((a, b) => a.order - b.order)
  const highlights =
    language === 'ka' && content.requestDemoHighlightsKa.length > 0
      ? content.requestDemoHighlightsKa
      : content.requestDemoHighlights

  const idFor = (name: string) => `${fieldId}-${name}`
  const errorIdFor = (name: string) => `${fieldId}-${name}-error`

  const patch = (changes: Partial<DemoRequestDraft>) => {
    setSaveError(false)
    setDraft((current) => ({ ...current, ...changes }))
  }

  const toggleSolution = (id: string) => {
    setSaveError(false)
    setDraft((current) => ({
      ...current,
      solutionIds: current.solutionIds.includes(id)
        ? current.solutionIds.filter((candidate) => candidate !== id)
        : [...current.solutionIds, id],
    }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaveError(false)

    const found = validateDemoRequestDraft(draft)
    setErrors(found)

    if (hasDemoRequestErrors(found)) {
      // Move the caret to the first problem rather than leaving the visitor to
      // hunt for it — the summary alone is not enough on a long form.
      const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
      first?.focus()
      return
    }

    const request = createDemoRequest(draft, {
      id: createRequestId(),
      submittedAt: new Date().toISOString(),
      language,
      knownSolutionIds: solutions.map((solution) => solution.id),
    })

    setSubmitting(true)
    try {
      await store.update({
        mutate: (next) => {
          // Newest first, matching how the intake queue is read.
          next.demoRequests = [request, ...next.demoRequests]
        },
        audit: {
          // No signed-in actor: the same empty actor a failed sign-in records.
          actorId: '',
          action: 'demo_request.submitted',
          entityType: 'DemoRequest',
          entityId: request.id,
          summary: `Demo request from ${request.company}`,
        },
      })
      setSubmitted(true)
      scrollToTop(false)
    } catch {
      // The draft is deliberately kept so nothing typed is lost.
      setSaveError(true)
    } finally {
      setSubmitting(false)
    }
  }

  const startAnother = () => {
    setDraft(blankDemoRequestDraft())
    setErrors({})
    setSubmitted(false)
    setSaveError(false)
  }

  const messageFor = (field: DemoRequestField): string | null => {
    const key = errors[field]
    return key ? t(key as TranslationKey) : null
  }

  const renderError = (field: DemoRequestField) => {
    const message = messageFor(field)
    if (!message) return null
    return (
      <span className="aizen-field-error" id={errorIdFor(field)}>
        {message}
      </span>
    )
  }

  return (
    <div className="aizen-public-site aizen-request-demo-page">
      <PublicHeader />

      <main id="public-main">
        <section className="aizen-request-demo">
          <div className="aizen-request-demo-copy">
            <span className="aizen-section-label">
              {text(content.requestDemoEyebrow, content.requestDemoEyebrowKa) ||
                t('demo.formTitle')}
            </span>
            <h1>{text(content.requestDemoTitle, content.requestDemoTitleKa)}</h1>
            <p>{text(content.requestDemoDescription, content.requestDemoDescriptionKa)}</p>

            {highlights.length > 0 ? (
              <ul className="aizen-request-demo-highlights">
                {highlights.map((item) => (
                  <li key={item}>
                    <SiteIcon name="check" size={16} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {content.contactEmail || content.contactPhone ? (
              <div className="aizen-request-demo-contact">
                <span>{t('demo.contactDirect')}</span>
                {content.contactEmail ? (
                  <a href={`mailto:${content.contactEmail}`}>
                    <SiteIcon name="mail" size={16} />
                    {content.contactEmail}
                  </a>
                ) : null}
                {content.contactPhone ? (
                  <a href={`tel:${content.contactPhone.replace(/[^+\d]/g, '')}`}>
                    <SiteIcon name="phone" size={16} />
                    {content.contactPhone}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="aizen-request-demo-card">
            {submitted ? (
              <div className="aizen-request-demo-success" role="status">
                <span className="aizen-request-demo-tick" aria-hidden="true">
                  <SiteIcon name="check" size={26} />
                </span>
                <h2>{t('demo.success.title')}</h2>
                <p>{text(content.requestDemoSuccess, content.requestDemoSuccessKa)}</p>
                <div className="aizen-request-demo-success-actions">
                  <Link to="/" className="aizen-btn aizen-btn--primary">
                    {t('public.nav.home')}
                  </Link>
                  <button
                    type="button"
                    className="aizen-btn aizen-btn--secondary"
                    onClick={startAnother}
                  >
                    {t('demo.success.another')}
                  </button>
                </div>
              </div>
            ) : (
              <form
                ref={formRef}
                className="aizen-request-demo-form"
                onSubmit={(event) => void handleSubmit(event)}
                noValidate
              >
                <div className="aizen-request-demo-form-head">
                  <h2>{t('demo.formTitle')}</h2>
                  <p>{t('demo.formIntro')}</p>
                </div>

                {hasDemoRequestErrors(errors) ? (
                  <p className="aizen-form-alert" role="alert">
                    {t('demo.error.summary')}
                  </p>
                ) : null}
                {saveError ? (
                  <p className="aizen-form-alert" role="alert">
                    {t('demo.error.save')}
                  </p>
                ) : null}

                <div className="aizen-field-grid">
                  {TEXT_FIELDS.map((entry) => (
                    <div
                      key={entry.field}
                      className={`aizen-field ${entry.wide ? 'aizen-field--wide' : ''}`}
                    >
                      <label htmlFor={idFor(entry.field)}>
                        {t(entry.labelKey)} <b aria-hidden="true">*</b>
                      </label>
                      <input
                        id={idFor(entry.field)}
                        name={entry.field}
                        type={entry.type}
                        autoComplete={entry.autoComplete}
                        required
                        value={draft[entry.field]}
                        onChange={(event) => {
                          patch({ [entry.field]: event.target.value })
                        }}
                        aria-invalid={errors[entry.field] !== undefined}
                        aria-describedby={
                          errors[entry.field] ? errorIdFor(entry.field) : undefined
                        }
                      />
                      {renderError(entry.field)}
                    </div>
                  ))}

                  <div className="aizen-field aizen-field--wide">
                    <label htmlFor={idFor('country')}>
                      {t('demo.field.country')} <b aria-hidden="true">*</b>
                    </label>
                    {/*
                     * The stored value is the ISO code, never the display name,
                     * so a request stays readable in either language.
                     */}
                    <select
                      id={idFor('country')}
                      name="country"
                      autoComplete="country"
                      required
                      value={draft.country}
                      onChange={(event) => {
                        patch({ country: event.target.value })
                      }}
                      aria-invalid={errors.country !== undefined}
                      aria-describedby={errors.country ? errorIdFor('country') : undefined}
                    >
                      <option value="">{t('demo.countryPlaceholder')}</option>
                      {countries.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                    {renderError('country')}
                  </div>
                </div>

                <fieldset
                  className="aizen-field-set"
                  aria-invalid={errors.solutionIds !== undefined}
                  aria-describedby={errors.solutionIds ? errorIdFor('solutionIds') : undefined}
                >
                  <legend>
                    {t('demo.field.solutions')} <b aria-hidden="true">*</b>
                  </legend>
                  <div className="aizen-choice-row">
                    {solutions.map((solution) => (
                      <label key={solution.id} className="aizen-choice">
                        <input
                          type="checkbox"
                          name="solutionIds"
                          value={solution.id}
                          checked={draft.solutionIds.includes(solution.id)}
                          onChange={() => {
                            toggleSolution(solution.id)
                          }}
                        />
                        <span>{text(solution.name, solution.nameKa)}</span>
                      </label>
                    ))}
                  </div>
                  {renderError('solutionIds')}
                </fieldset>

                <div className="aizen-field">
                  <label htmlFor={idFor('message')}>
                    {t('demo.field.message')} <i>{t('demo.optional')}</i>
                  </label>
                  <textarea
                    id={idFor('message')}
                    name="message"
                    rows={3}
                    value={draft.message}
                    onChange={(event) => {
                      patch({ message: event.target.value })
                    }}
                  />
                </div>

                <label className="aizen-consent">
                  <input
                    type="checkbox"
                    name="consent"
                    checked={draft.consent}
                    onChange={(event) => {
                      patch({ consent: event.target.checked })
                    }}
                    aria-invalid={errors.consent !== undefined}
                    aria-describedby={errors.consent ? errorIdFor('consent') : undefined}
                  />
                  <span>{text(content.requestDemoConsent, content.requestDemoConsentKa)}</span>
                </label>
                {renderError('consent')}

                <button
                  type="submit"
                  className="aizen-btn aizen-btn--primary aizen-btn--lg aizen-request-demo-submit"
                  disabled={submitting}
                >
                  {submitting ? t('demo.submitting') : t('demo.submit')}
                </button>

                <p className="aizen-request-demo-notice">{t('demo.storageNotice')}</p>
              </form>
            )}
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
