import { describe, expect, it } from 'vitest'
import type { User } from '../types/index.ts'
import { authenticate, findUserByEmail, normalizeEmail, resolveSessionUser } from './index.ts'

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'usr_admin',
    name: 'ERM Administrator',
    title: 'Platform Administrator',
    email: 'admin@erm.local',
    password: 'Admin#2026',
    status: 'Active',
    roleIds: ['role_admin'],
    businessUnitIds: ['bu_enterprise'],
    ...overrides,
  }
}

const USERS: User[] = [
  user(),
  user({ id: 'usr_inactive', email: 'former.staff@erm.local', password: 'Old#2026', status: 'Inactive' }),
  user({ id: 'usr_mixed', email: 'S.Pkhikidze@Aizzen.com', password: 'Admin#2026' }),
]

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Admin@ERM.Local  ')).toBe('admin@erm.local')
  })

  it('leaves an already-normalised address alone', () => {
    expect(normalizeEmail('admin@erm.local')).toBe('admin@erm.local')
  })
})

describe('findUserByEmail', () => {
  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(findUserByEmail(USERS, '  ADMIN@erm.LOCAL ')?.id).toBe('usr_admin')
  })

  it('matches a stored address that is itself mixed case', () => {
    expect(findUserByEmail(USERS, 's.pkhikidze@aizzen.com')?.id).toBe('usr_mixed')
  })

  it('returns undefined for an unknown address', () => {
    expect(findUserByEmail(USERS, 'nobody@erm.local')).toBeUndefined()
  })
})

describe('authenticate', () => {
  it('accepts correct credentials for an active user', () => {
    const result = authenticate(USERS, { email: 'admin@erm.local', password: 'Admin#2026' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.user.id).toBe('usr_admin')
  })

  it('accepts credentials whose email differs only by case or whitespace', () => {
    expect(authenticate(USERS, { email: '  Admin@ERM.Local ', password: 'Admin#2026' }).ok).toBe(true)
  })

  it('rejects a wrong password', () => {
    expect(authenticate(USERS, { email: 'admin@erm.local', password: 'wrong' }).ok).toBe(false)
  })

  it('rejects an unknown address', () => {
    expect(authenticate(USERS, { email: 'nobody@erm.local', password: 'Admin#2026' }).ok).toBe(false)
  })

  it('rejects an inactive user even with the correct password', () => {
    expect(
      authenticate(USERS, { email: 'former.staff@erm.local', password: 'Old#2026' }).ok,
    ).toBe(false)
  })

  it('rejects an empty password', () => {
    expect(authenticate(USERS, { email: 'admin@erm.local', password: '' }).ok).toBe(false)
  })

  it('is case-sensitive on the password', () => {
    expect(authenticate(USERS, { email: 'admin@erm.local', password: 'admin#2026' }).ok).toBe(false)
  })

  /*
   * Every failure returns the same reason. A caller cannot tell an unknown
   * address from a disabled account from a wrong password, so error messages
   * cannot leak which accounts exist (ARCHITECTURE.md §6.2).
   */
  it('gives one indistinguishable reason for every failure mode', () => {
    const reasons = [
      authenticate(USERS, { email: 'nobody@erm.local', password: 'x' }),
      authenticate(USERS, { email: 'admin@erm.local', password: 'wrong' }),
      authenticate(USERS, { email: 'former.staff@erm.local', password: 'Old#2026' }),
    ].map((result) => (result.ok ? 'ok' : result.reason))

    expect(new Set(reasons).size).toBe(1)
    expect(reasons[0]).toBe('invalidCredentials')
  })

  it('never returns a user on failure', () => {
    const result = authenticate(USERS, { email: 'admin@erm.local', password: 'wrong' })
    expect('user' in result).toBe(false)
  })
})

describe('resolveSessionUser', () => {
  it('resolves an active user', () => {
    expect(resolveSessionUser(USERS, 'usr_admin')?.id).toBe('usr_admin')
  })

  it('refuses a user deactivated since the session began', () => {
    expect(resolveSessionUser(USERS, 'usr_inactive')).toBeNull()
  })

  it('refuses a user deleted since the session began', () => {
    expect(resolveSessionUser(USERS, 'usr_deleted')).toBeNull()
  })

  it('returns null when signed out', () => {
    expect(resolveSessionUser(USERS, null)).toBeNull()
  })
})
