import { useId, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { APP_VERSION } from '../../config/index.ts'
import { useAppData } from '../../data/app-data-context.ts'
import { isSuperAdministrator } from '../../domain/permissions/index.ts'
import { scaleName } from '../../domain/risk-engine/index.ts'
import { pickLanguage, useTranslation } from '../../i18n/index.ts'
import { BrandMark } from '../../ui/brand-mark.tsx'
import { IconChevronLeft, IconChevronRight, IconShield, IconWarning } from '../../ui/icons.tsx'
import { initialsOf } from '../../ui/initials.ts'
import { useAuthService } from '../session/auth-service-context.ts'
import { useAuth } from '../session/use-auth.ts'
import { useCurrentUser } from '../session/use-current-user.ts'
import './sign-in.css'

/*
 * Phase 1 sign-in (ARCHITECTURE.md §6.1).
 *
 * The two-panel layout is ported from the v7 build (legacy/app.html
 * `LoginPage`): a dark brand panel carrying the product story, and a light
 * form panel carrying the credential form, the local-security notice, the
 * Phase 2 SSO placeholder and the demo directory.
 *
 * Credentials are demo-only and verified against AppState in plain text — a
 * documented Phase 1 limitation, not production authentication. The
 * "Sign in with Google" button and its server-side token validation arrive in
 * M15, at which point this form becomes the local break-glass path.
 *
 * Heading levels are the one deliberate difference from v7: the page's h1 is
 * "Sign in" rather than the marketing headline, because signing in is what the
 * page is for. Size comes from CSS, so the layout is unchanged.
 */

interface LocationState {
  from?: string
}

export function SignInPage() {
  const { t, language, setLanguage } = useTranslation()
  const { state } = useAppData()
  const { user } = useCurrentUser()
  const { signIn } = useAuth()
  const authService = useAuthService()
  const navigate = useNavigate()
  const location = useLocation()

  const emailId = useId()
  const passwordId = useId()
  const errorId = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Already signed in — go where they were heading, or to the default landing.
  if (user) {
    const from = (location.state as LocationState | null)?.from
    return <Navigate to={from ?? (isSuperAdministrator(user) ? '/admin/site' : '/dashboard')} replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    const result = await signIn({ email, password })
    setSubmitting(false)

    if (!result.ok) {
      // One generic message: never reveal whether the address is registered.
      setError(t('session.invalidCredentials'))
      setPassword('')
      return
    }

    const from = (location.state as LocationState | null)?.from
    navigate(from ?? (isSuperAdministrator(result.user) ? '/admin/site' : '/dashboard'), {
      replace: true,
    })
  }

  const site = state?.siteContent
  const brandName = site?.brandName ?? 'AIZEN'
  const brandDescriptor = pickLanguage(
    site?.brandDescriptor ?? 'Risk & Compliance',
    site?.brandDescriptorKa ?? '',
    language,
  )

  // The scale name is read from the configured matrix, never hard-coded here.
  const scale = state ? `${scaleName(state.matrix, language)} ${t('admin.matrix.suffix')}` : ''

  const demoAccounts = state?.users.filter((candidate) => candidate.status === 'Active') ?? []
  const googleDenied = new URLSearchParams(location.search).get('error') === 'denied'

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand-top">
          <span className="login-wordmark">
            <BrandMark label={t('app.brandAlt')} className="login-wordmark__mark" />
            <span className="login-wordmark__text">
              <strong>{brandName}</strong>
              <small>{brandDescriptor}</small>
            </span>
          </span>
          <span className="login-version">v{APP_VERSION}</span>
        </div>

        <div className="login-brand-copy">
          <span className="login-eyebrow">
            {t('session.brand.eyebrow')}
            {scale ? ` · ${scale}` : ''}
          </span>
          {/* Display copy, not the page heading — see the note above. */}
          <p className="login-brand-title">{t('session.brand.title')}</p>
          <p className="login-brand-body">{t('session.brand.body')}</p>

          <div className="login-phase-grid">
            <article>
              <strong>01</strong>
              <span>{t('session.brand.phaseOne')}</span>
            </article>
            <article>
              <strong>02</strong>
              <span>{t('session.brand.phaseTwo')}</span>
            </article>
          </div>
        </div>

        <p className="login-brand-footer">
          <span>PLAN</span>
          <i aria-hidden="true" />
          <span>MANAGE</span>
          <i aria-hidden="true" />
          <span>GROW</span>
        </p>
      </section>

      <section className="login-form-panel">
        <div className="login-form-wrap">
          <div className="login-form-topline">
            <button
              type="button"
              className="login-back"
              onClick={() => {
                navigate('/')
              }}
            >
              <IconChevronLeft size={16} />
              {t('session.backToWebsite')}
            </button>

            <div className="login-language" role="group" aria-label={t('language.label')}>
              <button
                type="button"
                className={language === 'en' ? 'active' : ''}
                aria-pressed={language === 'en'}
                onClick={() => {
                  setLanguage('en')
                }}
              >
                EN
              </button>
              <button
                type="button"
                className={language === 'ka' ? 'active' : ''}
                aria-pressed={language === 'ka'}
                onClick={() => {
                  setLanguage('ka')
                }}
              >
                KA
              </button>
            </div>
          </div>

          <div className="login-heading">
            <span className="login-mini-brand">
              <BrandMark label="" />
            </span>
            <span>
              <small>{t('session.offlinePrototype')}</small>
              <h1>{t('session.signIn')}</h1>
            </span>
          </div>

          {/*
           * A denied Google sign-in returns here with ?error=denied. The message
           * is generic and never says whether the address is registered.
           */}
          {googleDenied ? (
            <p role="alert" className="login-error">
              <IconWarning size={16} />
              {t('session.googleDenied')}
            </p>
          ) : null}

          {authService.enabled ? (
            <>
              <button
                type="button"
                className="login-google"
                onClick={() => {
                  // Full-page redirect: the flow runs server-side from here.
                  authService.startGoogleSignIn()
                }}
              >
                {t('session.google')}
              </button>
              <p className="login-divider">{t('session.or')}</p>
            </>
          ) : null}

          <form className="login-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <div className="login-field">
              <label htmlFor={emailId}>{t('session.email')}</label>
              <input
                id={emailId}
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                }}
                aria-invalid={error.length > 0}
                aria-describedby={error ? errorId : undefined}
              />
            </div>

            <div className="login-field">
              <label htmlFor={passwordId}>{t('session.password')}</label>
              <input
                id={passwordId}
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                }}
                aria-invalid={error.length > 0}
                aria-describedby={error ? errorId : undefined}
              />
            </div>

            {error ? (
              <p id={errorId} role="alert" className="login-error">
                <IconWarning size={16} />
                {error}
              </p>
            ) : null}

            <button type="submit" className="login-submit" disabled={submitting}>
              {submitting ? t('state.loading') : t('session.signIn')}
            </button>
          </form>

          <div className="login-security-note">
            <IconShield size={18} />
            <p>{t('session.localSecurityNotice')}</p>
          </div>

          {/* Phase 2 enterprise SSO, shown as a disabled placeholder in Phase 1. */}
          <div className="login-sso">
            <span>
              <strong>Microsoft 365 / Okta</strong>
              <small>{t('session.phase2Sso')}</small>
            </span>
            <button type="button" disabled>
              SAML SSO
            </button>
          </div>

          {/*
           * Demo directory. Mirrors the v7 build: selecting an account fills
           * the form, it does NOT bypass the credential check — the same
           * authenticate() call runs either way.
           */}
          {demoAccounts.length > 0 ? (
            <div className="login-demo">
              <p className="login-demo__title">
                <span>{t('session.demoAccounts')}</span>
                <i aria-hidden="true" />
              </p>
              <div className="login-demo__list">
                {demoAccounts.map((candidate) => {
                  const role = state?.roles.find((entry) => candidate.roleIds.includes(entry.id))

                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      className="login-demo__account"
                      title={role ? pickLanguage(role.nameEn, role.nameKa, language) : undefined}
                      onClick={() => {
                        setEmail(candidate.email)
                        setPassword(candidate.password)
                        setError('')
                      }}
                    >
                      <span className="login-demo__avatar" aria-hidden="true">
                        {initialsOf(candidate.name)}
                      </span>
                      <span className="login-demo__identity">
                        <strong>{candidate.name}</strong>
                        <small>{candidate.email}</small>
                      </span>
                      <IconChevronRight size={16} />
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}
