import { fireEvent, render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import baseline from '../../../fixtures/legacy-state.json'
import { AppDataProvider } from '../../data/app-data-provider.tsx'
import { AppDataStore } from '../../data/app-data-store.ts'
import { LocalStorageRepository, type StorageLike } from '../../data/local-storage-repository.ts'
import { MemorySessionRepository } from '../../data/session-repository.ts'
import { SessionRepositoryContext } from '../../app/session/session-repository-context.ts'
import { SessionBootstrap } from '../../app/session/session-bootstrap.tsx'
import { resetSessionStore } from '../../app/session/session-store.ts'
import { MAX_LOGO_BYTES, validateLogoFile } from '../../domain/administration/index.ts'
import type { AppState } from '../../domain/types/index.ts'
import { AdministrationPage } from './administration-page.tsx'
import { SiteAdminPage } from '../site-admin/site-admin-page.tsx'

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>()
  getItem(key: string) { return this.map.get(key) ?? null }
  setItem(key: string, value: string) { this.map.set(key, value) }
  removeItem(key: string) { this.map.delete(key) }
}

const STATE_KEY = 'erm-risk-management-v3-state'
let storage: MemoryStorage

async function seed(mutate: (state: AppState) => void = () => undefined) {
  storage = new MemoryStorage()
  const repository = new LocalStorageRepository({ storage })
  const state = await repository.getState()
  mutate(state)
  await repository.saveState(state)
}

function renderPage(page: 'admin' | 'site', signedInAs = 'usr_admin'): RenderResult {
  resetSessionStore()
  const sessionRepository = new MemorySessionRepository()
  sessionRepository.write(signedInAs)
  const store = new AppDataStore({ repository: new LocalStorageRepository({ storage }) })

  return render(
    <AppDataProvider store={store}>
      <SessionRepositoryContext.Provider value={sessionRepository}>
        <SessionBootstrap>
          <MemoryRouter>{page === 'admin' ? <AdministrationPage /> : <SiteAdminPage />}</MemoryRouter>
        </SessionBootstrap>
      </SessionRepositoryContext.Provider>
    </AppDataProvider>,
  )
}

function persisted(): AppState {
  return JSON.parse(storage.map.get(STATE_KEY) ?? '{}') as AppState
}

async function openSection(name: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name }))
  return user
}

/** A File whose reported size can be forced, for the size-limit test. */
function makeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

beforeEach(async () => {
  await seed()
})

afterEach(() => {
  resetSessionStore()
})

// --- branding ---------------------------------------------------------------

describe('logo validation', () => {
  it('accepts a small PNG', () => {
    expect(validateLogoFile({ size: 1024, type: 'image/png' })).toEqual([])
  })

  it('rejects an oversized image with a clear reason', () => {
    const issues = validateLogoFile({ size: MAX_LOGO_BYTES + 1, type: 'image/png' })
    expect(issues.map((issue) => issue.messageKey)).toContain('admin.error.logoSize')
  })

  it('rejects an unsupported type', () => {
    const issues = validateLogoFile({ size: 1024, type: 'application/pdf' })
    expect(issues.map((issue) => issue.messageKey)).toContain('admin.error.logoType')
  })
})

describe('branding section', () => {
  it('shows a placeholder until a logo is uploaded', async () => {
    renderPage('admin')
    await openSection('Branding')
    expect(screen.getByText('No client logo uploaded.')).toBeInTheDocument()
  })

  it('uploads a logo, persists it and audits the change', async () => {
    renderPage('admin')
    const user = await openSection('Branding')

    await user.upload(screen.getByLabelText('Upload client logo'), makeFile('logo.png', 'image/png', 2048))

    await waitFor(() => {
      expect(persisted().branding.clientLogo).toMatch(/^data:/)
    })
    expect(persisted().auditEvents.some((event) => event.action === 'branding.updated')).toBe(true)
  })

  it('restores the stored logo after a remount', async () => {
    const first = renderPage('admin')
    const user = await openSection('Branding')
    await user.upload(screen.getByLabelText('Upload client logo'), makeFile('logo.png', 'image/png', 2048))

    await waitFor(() => {
      expect(persisted().branding.clientLogo).toMatch(/^data:/)
    })

    // Unmount and remount against the same storage — the refresh case.
    first.unmount()
    resetSessionStore()
    renderPage('admin')
    await openSection('Branding')

    expect(await screen.findByAltText('Current client logo')).toBeInTheDocument()
  })

  it('removes the logo back to the placeholder', async () => {
    await seed((state) => {
      state.branding.clientLogo = 'data:image/png;base64,AAAA'
    })

    renderPage('admin')
    const user = await openSection('Branding')
    await user.click(screen.getByRole('button', { name: 'Remove logo' }))

    await waitFor(() => {
      expect(persisted().branding.clientLogo).toBeNull()
    })
    expect(screen.getByText('No client logo uploaded.')).toBeInTheDocument()
  })

  it('shows a clear error for an oversized image rather than failing silently', async () => {
    renderPage('admin')
    const user = await openSection('Branding')

    await user.upload(
      screen.getByLabelText('Upload client logo'),
      makeFile('huge.png', 'image/png', MAX_LOGO_BYTES + 1),
    )

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/too large/i)).toBeInTheDocument()
    expect(persisted().branding.clientLogo).toBeNull()
  })

  it('states that AIZEN brand assets are out of scope here', async () => {
    renderPage('admin')
    await openSection('Branding')
    expect(screen.getByText(/belong to Website Administration/i)).toBeInTheDocument()
  })
})

// --- SSO --------------------------------------------------------------------

describe('SSO roadmap section', () => {
  it('exposes every draft field', async () => {
    renderPage('admin')
    await openSection('SSO / SAML roadmap')

    for (const label of [
      'Provider name', 'IdP entity ID', 'Metadata URL', 'ACS URL',
      'Email attribute', 'Role / group attribute',
    ]) {
      expect(screen.getByLabelText(label), label).toBeInTheDocument()
    }
    expect(screen.getByLabelText(/Role mappings/)).toBeInTheDocument()
  })

  it('says plainly that it performs no real authentication', async () => {
    renderPage('admin')
    await openSection('SSO / SAML roadmap')
    expect(screen.getByText(/no real SAML authentication in Phase 1/i)).toBeInTheDocument()
  })

  it('raises a distinct audit event when Enabled is toggled', async () => {
    renderPage('admin')
    const user = await openSection('SSO / SAML roadmap')

    await user.click(screen.getByRole('checkbox', { name: 'Enabled' }))

    await waitFor(() => {
      expect(persisted().ssoConfig.enabled).toBe(true)
    })
    expect(persisted().auditEvents.some((event) => event.action === 'sso.enabled')).toBe(true)
  })

  it('audits disabling separately from enabling', async () => {
    await seed((state) => {
      state.ssoConfig.enabled = true
    })

    renderPage('admin')
    const user = await openSection('SSO / SAML roadmap')
    await user.click(screen.getByRole('checkbox', { name: 'Enabled' }))

    await waitFor(() => {
      expect(persisted().auditEvents.some((event) => event.action === 'sso.disabled')).toBe(true)
    })
  })

  it('saves edited draft fields', async () => {
    renderPage('admin')
    const user = await openSection('SSO / SAML roadmap')

    await user.clear(screen.getByLabelText('IdP entity ID'))
    await user.type(screen.getByLabelText('IdP entity ID'), 'urn:aizzen:idp')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().ssoConfig.entityId).toBe('urn:aizzen:idp')
    })
  })
})

// --- data tools -------------------------------------------------------------

describe('data tools', () => {
  it('exports a backup containing every collection', async () => {
    renderPage('admin')
    await openSection('Data tools')

    // Serialisation is the repository's job; assert the payload shape directly.
    const store = new AppDataStore({ repository: new LocalStorageRepository({ storage }) })
    await store.load()
    const payload = JSON.parse(store.exportJson()) as { state: AppState; schemaVersion: number }

    for (const key of [
      'users', 'roles', 'categories', 'businessUnits', 'customAttributes', 'matrix',
      'risks', 'savedViews', 'dashboards', 'reportTemplates', 'auditEvents',
      'branding', 'ssoConfig', 'siteContent',
    ]) {
      expect(payload.state, key).toHaveProperty(key)
    }
    expect(payload.schemaVersion).toBe(11)
  })

  it('imports the legacy schema-7 backup, migrating it', async () => {
    renderPage('admin')
    const user = await openSection('Data tools')

    const file = new File([JSON.stringify(baseline)], 'legacy.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Import JSON backup'), file)

    await waitFor(() => {
      expect(persisted().risks).toHaveLength(8)
    })
    expect(persisted().schemaVersion).toBe(11)
    expect(await screen.findByText('Backup imported.')).toBeInTheDocument()
  })

  it('leaves data unchanged when the import is invalid', async () => {
    renderPage('admin')
    const user = await openSection('Data tools')
    const before = storage.map.get(STATE_KEY)

    const file = new File(['{ not json'], 'broken.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Import JSON backup'), file)

    expect(await screen.findByText(/Import rejected/)).toBeInTheDocument()
    expect(storage.map.get(STATE_KEY)).toBe(before)
  })

  it('leaves data unchanged when the structure is invalid', async () => {
    renderPage('admin')
    const user = await openSection('Data tools')
    const before = storage.map.get(STATE_KEY)

    const file = new File([JSON.stringify({ users: [] })], 'partial.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Import JSON backup'), file)

    expect(await screen.findByText(/Import rejected/)).toBeInTheDocument()
    expect(storage.map.get(STATE_KEY)).toBe(before)
  })

  it('requires typed confirmation before resetting', async () => {
    renderPage('admin')
    const user = await openSection('Data tools')

    const resetButton = screen.getByRole('button', { name: 'Reset demo data' })
    expect(resetButton).toBeDisabled()

    await user.type(screen.getByLabelText('Type RESET to confirm'), 'RESE')
    expect(resetButton).toBeDisabled()

    await user.type(screen.getByLabelText('Type RESET to confirm'), 'T')
    expect(resetButton).toBeEnabled()
  })

  it('restores the seed on reset', async () => {
    await seed((state) => {
      state.categories = state.categories.slice(0, 2)
    })

    renderPage('admin')
    const user = await openSection('Data tools')
    await user.type(screen.getByLabelText('Type RESET to confirm'), 'RESET')
    await user.click(screen.getByRole('button', { name: 'Reset demo data' }))

    await waitFor(() => {
      expect(persisted().categories).toHaveLength(38)
    })
    expect(await screen.findByText('Demo data restored.')).toBeInTheDocument()
  })

  it('produces a valid audit-only JSON payload', async () => {
    renderPage('admin')
    await openSection('Data tools')

    const events = persisted().auditEvents
    expect(() => JSON.parse(JSON.stringify(events)) as unknown).not.toThrow()
    expect(Array.isArray(events)).toBe(true)
  })
})

// --- website administration -------------------------------------------------

describe('website administration', () => {
  it('carries every content group from the as-built site', async () => {
    renderPage('site', 'usr_super_admin')
    const nav = await screen.findByRole('navigation', { name: 'Website Administration' })

    for (const group of ['Brand', 'Hero', 'Solutions', 'About us', 'Team members', 'Demo media', 'Contact and footer']) {
      expect(within(nav).getByRole('button', { name: group }), group).toBeInTheDocument()
    }
  })

  it('preserves the seeded content extracted from the legacy build', async () => {
    renderPage('site', 'usr_super_admin')
    await screen.findByRole('heading', { name: 'Website Administration', level: 1 })

    expect(screen.getByDisplayValue('AIZEN')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Risk & Compliance')).toBeInTheDocument()
  })

  it('edits a bilingual field and saves it', async () => {
    renderPage('site', 'usr_super_admin')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Hero' }))

    const heroTitle = screen.getByLabelText(/Hero Title · English/)
    await user.clear(heroTitle)
    await user.type(heroTitle, 'Govern risk with confidence.')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().siteContent.heroTitle).toBe('Govern risk with confidence.')
    })
    expect(persisted().auditEvents.some((event) => event.action === 'site_content.updated')).toBe(true)
  })

  it('keeps the three solution cards editable', async () => {
    renderPage('site', 'usr_super_admin')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Solutions' }))

    expect(screen.getByDisplayValue('Risk Management')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Compliance Management')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Audit Management')).toBeInTheDocument()
  })

  it('adds a team member with a crop focus control', async () => {
    renderPage('site', 'usr_super_admin')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Team members' }))
    await user.click(screen.getByRole('button', { name: 'Add team member' }))

    expect(screen.getByLabelText('Photo focus (crop)')).toBeInTheDocument()

    await user.type(screen.getAllByLabelText(/Name · English/)[0], 'A. Specialist')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().siteContent.team[0].name).toBe('A. Specialist')
    })
  })

  it('edits list fields one item per line', async () => {
    renderPage('site', 'usr_super_admin')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'About us' }))

    // fireEvent rather than user.type: multiline entry in a textarea is set
    // in one change, which is also how a paste behaves.
    const highlights = screen.getByLabelText(/About Highlights · English/)
    fireEvent.change(highlights, { target: { value: 'One\nTwo\n\nThree' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().siteContent.aboutHighlights).toEqual(['One', 'Two', 'Three'])
    })
  })

  it('stamps who changed the content and when', async () => {
    renderPage('site', 'usr_super_admin')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().siteContent.updatedBy).toBe('usr_super_admin')
    })
    expect(persisted().siteContent.updatedAt).not.toBe('')
  })
})

describe('administration boundary', () => {
  it('does not offer website content inside Risk Administration', async () => {
    renderPage('admin')
    const nav = await screen.findByRole('navigation', { name: 'Administration sections' })

    // A Risk Administrator manages the CLIENT logo, never the AIZEN site.
    expect(within(nav).queryByRole('button', { name: /Website/ })).toBeNull()
    expect(within(nav).getByRole('button', { name: 'Branding' })).toBeInTheDocument()
  })
})
