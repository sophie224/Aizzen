/*
 * Auth service configuration (ARCHITECTURE.md §6.2).
 *
 * NO SECRET IS EVER COMMITTED. Everything sensitive arrives through the
 * environment; the repository carries only variable names and defaults that
 * are safe to publish.
 */

export interface AuthServiceConfig {
  port: number
  /** Origin the SPA is served from; used for CORS and post-login redirects. */
  appOrigin: string
  /** Public origin of this service, used to build the OAuth redirect URI. */
  serviceOrigin: string

  google: {
    clientId: string
    /** Never reaches the browser. Absent in test runs against the mock issuer. */
    clientSecret: string
    /** OIDC discovery document. Overridable so tests point at a local mock. */
    discoveryUrl: string
  }

  session: {
    /** Signs the session cookie. Must be set in any real deployment. */
    secret: string
    cookieName: string
    /** Seconds. */
    maxAge: number
    /** Off only for local HTTP development. */
    secure: boolean
  }

  /**
   * Path to a JSON export of AppState, used as the internal user directory.
   *
   * PHASE 1 BRIDGE. The authoritative directory still lives in the browser's
   * AppState, so the service reads a snapshot exported from Administration →
   * Data Tools. Both must agree on user IDs, which they do when the snapshot
   * comes from the same state. M17/M18 collapse the two when the API owns
   * AppState outright.
   */
  userDirectoryPath: string

  rateLimit: {
    max: number
    /** Milliseconds. */
    windowMs: number
  }
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (value === undefined) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function loadConfig(overrides: Partial<AuthServiceConfig> = {}): AuthServiceConfig {
  const isProduction = process.env.NODE_ENV === 'production'

  return {
    port: Number(process.env.PORT ?? 5170),
    appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:5173',
    serviceOrigin: process.env.SERVICE_ORIGIN ?? 'http://localhost:5170',

    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      discoveryUrl:
        process.env.OIDC_DISCOVERY_URL ?? 'https://accounts.google.com/.well-known/openid-configuration',
    },

    session: {
      // A weak default is tolerable only outside production; required there.
      secret: isProduction
        ? required('SESSION_SECRET')
        : (process.env.SESSION_SECRET ?? 'development-only-session-secret-change-me'),
      cookieName: process.env.SESSION_COOKIE_NAME ?? 'aizzen_session',
      maxAge: Number(process.env.SESSION_MAX_AGE ?? 60 * 60 * 8),
      secure: process.env.SESSION_COOKIE_SECURE !== 'false' && isProduction,
    },

    userDirectoryPath: process.env.USER_DIRECTORY_PATH ?? 'fixtures/legacy-state.json',

    rateLimit: {
      max: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
      windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 60_000),
    },

    ...overrides,
  }
}
