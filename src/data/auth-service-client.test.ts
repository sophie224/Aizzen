import { describe, expect, it, vi } from 'vitest'
import { createAuthServiceClient } from './auth-service-client.ts'

/*
 * Client-level tests live here rather than under src/app: this module is the
 * data layer, and the "never writes to browser storage" assertion has to read
 * localStorage — which the lint boundary permits only in src/data.
 */

describe('auth service client', () => {
  it('reports disabled when no origin is configured', () => {
    expect(createAuthServiceClient('').enabled).toBe(false)
  })

  it('sends the session cookie with the session request', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ authenticated: true, userId: 'usr_admin' }), { status: 200 })),
    )

    const client = createAuthServiceClient('https://auth.test/', fetchImpl as unknown as typeof fetch)
    expect(await client.readSession()).toBe('usr_admin')

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://auth.test/auth/session',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('returns null for an unauthenticated response', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('{}', { status: 401 })))
    const client = createAuthServiceClient('https://auth.test', fetchImpl as unknown as typeof fetch)

    expect(await client.readSession()).toBeNull()
  })

  it('degrades to null when the service is unreachable', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error('offline')))
    const client = createAuthServiceClient('https://auth.test', fetchImpl as unknown as typeof fetch)

    // A service outage must not break Phase 1 credential login.
    await expect(client.readSession()).resolves.toBeNull()
  })

  it('never writes anything to browser storage', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ authenticated: true, userId: 'usr_admin' }), { status: 200 })),
    )
    const client = createAuthServiceClient('https://auth.test', fetchImpl as unknown as typeof fetch)

    const before = { ...localStorage }
    await client.readSession()
    await client.signOut()

    expect({ ...localStorage }).toEqual(before)
  })
})
