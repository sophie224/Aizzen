import { useId, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAppData } from '../../data/app-data-context.ts'
import { isSuperAdministrator } from '../../domain/permissions/index.ts'
import { useTranslation } from '../../i18n/index.ts'
import { useAuthService } from '../session/auth-service-context.ts'
import { useAuth } from '../session/use-auth.ts'
import { useCurrentUser } from '../session/use-current-user.ts'
import './sign-in.css'

/*
 * Phase 1 sign-in (ARCHITECTURE.md §6.1).
 *
 * Credentials are demo-only and verified against AppState in plain text — a
 * documented Phase 1 limitation, not production authentication. The
 * "Sign in with Google" button and its server-side token validation arrive in
 * M15, at which point this form becomes the local break-glass path.
 */

interface LocationState {
  from?: string
}

export function SignInPage() {
  const { t, language } = useTranslation()
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

  const demoAccounts = state?.users.filter((candidate) => candidate.status === 'Active') ?? []

  return (
    <main className="sign-in">
      <div className="sign-in__card panel">
        <h1>{t('session.title')}</h1>

        {/*
         * A denied Google sign-in returns here with ?error=denied. The message
         * is generic and never says whether the address is registered.
         */}
        {new URLSearchParams(location.search).get('error') === 'denied' ? (
          <p role="alert" className="sign-in__error">{t('session.googleDenied')}</p>
        ) : null}

        {authService.enabled ? (
          <>
            <button
              type="button"
              className="sign-in__google"
              onClick={() => {
                // Full-page redirect: the flow runs server-side from here.
                authService.startGoogleSignIn()
              }}
            >
              {t('session.google')}
            </button>
            <p className="sign-in__divider">{t('session.or')}</p>
          </>
        ) : null}

        <form onSubmit={(event) => void handleSubmit(event)} noValidate>
          <div className="sign-in__field">
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

          <div className="sign-in__field">
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
            <p id={errorId} role="alert" className="sign-in__error">
              {error}
            </p>
          ) : null}

          <button type="submit" className="sign-in__submit" disabled={submitting}>
            {submitting ? t('state.loading') : t('session.signIn')}
          </button>
        </form>

        <p className="panel__meta sign-in__notice">{t('session.phase1Notice')}</p>

        {/*
         * Demo account list. Mirrors the v7 build: selecting an account fills
         * the form, it does NOT bypass the credential check — the same
         * authenticate() call runs either way.
         */}
        {demoAccounts.length > 0 ? (
          <details className="sign-in__demo">
            <summary>{t('session.demoAccounts')}</summary>
            <ul>
              {demoAccounts.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(candidate.email)
                      setPassword(candidate.password)
                      setError('')
                    }}
                  >
                    <span className="sign-in__demo-name">{candidate.name}</span>
                    <span className="panel__meta">
                      {language === 'ka' ? candidate.title : candidate.title} · {candidate.email}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </main>
  )
}
