import { describe, expect, it } from 'vitest'
import { buildAuthDirectory } from '../scripts/build-auth-directory.ts'
import { createSeedUsers } from '../src/data/seed/organisation.ts'
import { buildApp } from './app.ts'
import { isGoogleClientConfigured, loadConfig } from './config.ts'
import { authorizeGoogleIdentity, loadDirectory } from './directory.ts'

/*
 * The committed dev snapshot IS the guest list Google sign-in checks
 * (ARCHITECTURE.md §6.2). It previously pointed at the frozen v7 parity
 * fixture, whose users carry different addresses and IDs, so every seeded
 * administrator was refused with `noInternalUser`. These tests fail the moment
 * the snapshot and the seed drift apart again.
 */
describe('auth service user directory snapshot', () => {
  it('is the configured default', () => {
    expect(loadConfig().userDirectoryPath).toBe('fixtures/auth-directory.dev.json')
  })

  it('matches the seed on every email and ID', async () => {
    const snapshot = await loadDirectory('fixtures/auth-directory.dev.json')

    expect(snapshot.users.map((user) => [user.id, user.email, user.status])).toEqual(
      createSeedUsers().map((user) => [user.id, user.email, user.status]),
    )
  })

  it('is byte-identical to a fresh generation', async () => {
    const snapshot = await loadDirectory('fixtures/auth-directory.dev.json')

    expect(snapshot.users).toEqual(buildAuthDirectory().users)
  })

  it('never carries the Phase 1 demo passwords', async () => {
    const snapshot = await loadDirectory('fixtures/auth-directory.dev.json')

    for (const user of snapshot.users) {
      expect(user).not.toHaveProperty('password')
    }
  })

  it('admits a verified seeded administrator', async () => {
    const directory = await loadDirectory('fixtures/auth-directory.dev.json')

    const outcome = authorizeGoogleIdentity(
      { sub: 'google-sub-1', email: 'S.Pkhikidze@Aizzen.com', emailVerified: true },
      directory,
    )

    expect(outcome).toEqual({
      ok: true,
      user: expect.objectContaining({ id: 'usr_admin_sp' }),
      linkSub: true,
    })
  })

  it('still refuses an address that is not in the directory', async () => {
    const directory = await loadDirectory('fixtures/auth-directory.dev.json')

    const outcome = authorizeGoogleIdentity(
      { sub: 'google-sub-2', email: 'stranger@aizzen.com', emailVerified: true },
      directory,
    )

    expect(outcome).toEqual({ ok: false, reason: 'noInternalUser' })
  })
})

/*
 * A missing client ID used to reach Google as `client_id=`, which answers
 * `Error 400: invalid_request — Missing required parameter: client_id`. That
 * message blames the OAuth consent screen for a purely local fault: the
 * service started without its environment file.
 */
describe('google client configuration guard', () => {
  it('treats an unset client ID as unconfigured', () => {
    const config = loadConfig({ google: { clientId: '', clientSecret: '', discoveryUrl: '' } })

    expect(isGoogleClientConfigured(config)).toBe(false)
  })

  it('treats the .env.example placeholder as unconfigured', () => {
    const config = loadConfig({
      google: { clientId: 'your-google-client-id', clientSecret: 'x', discoveryUrl: '' },
    })

    expect(isGoogleClientConfigured(config)).toBe(false)
  })

  it('accepts a real client ID', () => {
    const config = loadConfig({
      google: { clientId: '1234.apps.googleusercontent.com', clientSecret: 'x', discoveryUrl: '' },
    })

    expect(isGoogleClientConfigured(config)).toBe(true)
  })

  it('refuses to start a flow it cannot finish, naming the variable', async () => {
    const app = await buildApp({
      config: loadConfig({ google: { clientId: '', clientSecret: '', discoveryUrl: '' } }),
      onAudit: () => {},
    })

    const response = await app.inject({ method: 'GET', url: '/auth/google/start' })
    await app.close()

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ error: 'google_sign_in_unconfigured' })
    expect(response.json().message).toContain('GOOGLE_CLIENT_ID')
  })
})
