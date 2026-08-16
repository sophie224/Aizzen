/*
 * Application configuration — the storage-adapter selection point.
 *
 * The PRD requires three interchangeable storage configurations sharing one
 * data contract, "selectable through configuration without requiring changes
 * to the application's business logic" (ARCHITECTURE.md §4). This module is
 * that seam: switching adapters must touch only this file and src/data.
 *
 * NO SECRETS. Everything here ships to the browser in the bundle. The Google
 * client secret, AWS credentials and API tokens live server-side, in
 * environment variables or a secrets manager (ARCHITECTURE.md §6.2, §11).
 */

export const STORAGE_ADAPTERS = ['local', 'onPremiseApi', 'awsApi'] as const
export type StorageAdapterName = (typeof STORAGE_ADAPTERS)[number]

export interface AppConfig {
  /**
   * Origin of the Aizzen auth service. Empty disables Google sign-in and the
   * app falls back to Phase 1 credential login. Public by design — the client
   * secret lives only on the service.
   */
  authServiceUrl: string
  /** Which AppRepository implementation to construct. */
  storageAdapter: StorageAdapterName
  /**
   * Public API origin for the two API-backed adapters. Ignored by `local`.
   * The AWS configuration points here too — the browser never addresses S3
   * directly, and no AWS credential reaches the frontend.
   */
  apiBaseUrl: string
}

function readAdapter(value: string | undefined): StorageAdapterName {
  const candidate = (value ?? 'local') as StorageAdapterName
  return STORAGE_ADAPTERS.includes(candidate) ? candidate : 'local'
}

/**
 * Resolved from Vite environment variables:
 *   VITE_STORAGE_ADAPTER = local | onPremiseApi | awsApi   (default: local)
 *   VITE_API_BASE_URL    = https://…                        (API adapters only)
 */
/**
 * Product version, shown on the sign-in brand panel exactly as the v7 build
 * showed it. One constant, so the badge can never drift from what ships.
 */
export const APP_VERSION = '3.3'

export const appConfig: AppConfig = {
  storageAdapter: readAdapter(import.meta.env.VITE_STORAGE_ADAPTER as string | undefined),
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '',
  authServiceUrl: (import.meta.env.VITE_AUTH_SERVICE_URL as string | undefined) ?? '',
}
