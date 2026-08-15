import { createContext, useContext } from 'react'
import { appConfig } from '../../config/index.ts'
import { createAuthServiceClient, type AuthServiceClient } from '../../data/auth-service-client.ts'

/*
 * Makes the auth service injectable. When no service is configured the client
 * reports `enabled: false` and the app falls back to Phase 1 credential login.
 */

const defaultClient = createAuthServiceClient(appConfig.authServiceUrl)

export const AuthServiceContext = createContext<AuthServiceClient>(defaultClient)

export function useAuthService(): AuthServiceClient {
  return useContext(AuthServiceContext)
}
