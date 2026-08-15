/*
 * Client for the Aizzen auth service (ARCHITECTURE.md §6.2).
 *
 * The service holds the Google client secret, validates ID tokens and issues
 * an HttpOnly session cookie. This client therefore never sees a token: it
 * only starts the flow and asks who the cookie resolves to.
 *
 * `credentials: 'include'` is what carries the cookie — nothing is read from
 * or written to browser storage here.
 */

export interface RemoteSession {
  authenticated: boolean
  userId?: string
}

export interface AuthServiceClient {
  /** True when an auth service is configured for this build. */
  readonly enabled: boolean
  /** Full-page navigation to the provider. Not an XHR — it is a redirect flow. */
  startGoogleSignIn(): void
  /** Resolves the current cookie to an internal user ID, or null. */
  readSession(): Promise<string | null>
  signOut(): Promise<void>
}

export function createAuthServiceClient(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): AuthServiceClient {
  const origin = baseUrl.replace(/\/$/, '')
  console.log('Auth service client configured for', baseUrl)
  return {
    enabled: origin.length > 0,

    startGoogleSignIn() {
      if (origin.length === 0) return
      window.location.assign(`${origin}/auth/google/start`)
    },

    async readSession(): Promise<string | null> {
      if (origin.length === 0) return null

      try {
        const response = await fetchImpl(`${origin}/auth/session`, { credentials: 'include' })
        if (!response.ok) return null

        const session = (await response.json()) as RemoteSession
        return session.authenticated && session.userId ? session.userId : null
      } catch {
        // A service that is down must not break local credential sign-in.
        return null
      }
    },

    async signOut(): Promise<void> {
      if (origin.length === 0) return
      try {
        await fetchImpl(`${origin}/auth/signout`, { method: 'POST', credentials: 'include' })
      } catch {
        // The local session is cleared regardless.
      }
    },
  }
}
