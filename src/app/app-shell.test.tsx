import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickLanguage } from '../domain/localisation/index.ts'
import { dictionary, translate } from '../i18n/index.ts'
import { legacyAppTarget } from './legacy-app-path.ts'
import { renderApp, SEEDED } from './test-harness.tsx'
import { resetSessionStore } from './session/session-store.ts'

afterEach(() => {
  resetSessionStore()
  vi.restoreAllMocks()
})

// --- routing ----------------------------------------------------------------

describe('routes render', () => {
  it('renders the dashboard for an administrator', async () => {
    renderApp({ route: '/dashboard', signedInAs: SEEDED.admin })
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
  })

  it('renders the register', async () => {
    renderApp({ route: '/register', signedInAs: SEEDED.admin })
    expect(await screen.findByRole('heading', { name: 'Risk Register', level: 1 })).toBeInTheDocument()
  })

  it('renders an individual risk route with its parameter', async () => {
    // The seeded state carries no risks, so the real view resolves this ID to
    // its not-available state — which still proves the param route matched.
    // Populated-risk rendering is covered in src/features/risk-view.
    renderApp({ route: '/risks/risk_001', signedInAs: SEEDED.admin })
    expect(
      await screen.findByRole('heading', { name: 'Risk not available', level: 1 }),
    ).toBeInTheDocument()
  })

  it('renders reports', async () => {
    renderApp({ route: '/reports', signedInAs: SEEDED.admin })
    expect(await screen.findByRole('heading', { name: 'Reports', level: 1 })).toBeInTheDocument()
  })

  it('renders risk administration', async () => {
    renderApp({ route: '/administration', signedInAs: SEEDED.admin })
    expect(
      await screen.findByRole('heading', { name: 'Risk Administration', level: 1 }),
    ).toBeInTheDocument()
  })

  it('renders website administration for the super administrator', async () => {
    renderApp({ route: '/admin/site', signedInAs: SEEDED.superAdmin })
    expect(
      await screen.findByRole('heading', { name: 'Website Administration', level: 1 }),
    ).toBeInTheDocument()
  })

  // The public site is the front door: the seeded hero headline, and the
  // navigation into About Us, must render with no session at all.
  it('renders the public site without a session', async () => {
    renderApp({ route: '/' })
    expect(
      await screen.findByRole('heading', { name: /Turn risk decisions/i, level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'About us' }).length).toBeGreaterThan(0)
  })

  it('renders the public about page without a session', async () => {
    renderApp({ route: '/about' })
    expect(
      await screen.findByRole('heading', { name: /About AIZEN/i, level: 1 }),
    ).toBeInTheDocument()
  })

  it('renders a not-found page for an unknown route', async () => {
    renderApp({ route: '/nowhere', signedInAs: SEEDED.admin })
    expect(await screen.findByRole('heading', { name: 'Page not found', level: 1 })).toBeInTheDocument()
  })

  it('sends an unknown route to the public home page without a session', async () => {
    renderApp({ route: '/nowhere' })
    expect(
      await screen.findByRole('heading', { name: /Turn risk decisions/i, level: 1 }),
    ).toBeInTheDocument()
  })
})

// --- retired /app prefix ----------------------------------------------------

describe('legacy /app links', () => {
  it('redirects bare /app to the dashboard', async () => {
    renderApp({ route: '/app', signedInAs: SEEDED.admin })
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
  })

  it('redirects a prefixed page to its top-level path', async () => {
    renderApp({ route: '/app/register', signedInAs: SEEDED.admin })
    expect(await screen.findByRole('heading', { name: 'Risk Register', level: 1 })).toBeInTheDocument()
  })

  it('strips the prefix while keeping the query string and hash', () => {
    expect(legacyAppTarget('/app')).toBe('/dashboard')
    expect(legacyAppTarget('/app/')).toBe('/dashboard')
    expect(legacyAppTarget('/app/register')).toBe('/register')
    expect(legacyAppTarget('/app/risks/risk_1')).toBe('/risks/risk_1')
    expect(legacyAppTarget('/app/register', '?status=Monitoring')).toBe('/register?status=Monitoring')
    expect(legacyAppTarget('/app/dashboard', '?status=Open', '#top')).toBe('/dashboard?status=Open#top')
  })
})

// --- guards -----------------------------------------------------------------

describe('unauthenticated access', () => {
  it('redirects a protected route to sign-in rather than rendering blank', async () => {
    renderApp({ route: '/register' })
    expect(await screen.findByRole('heading', { name: /Sign in/i, level: 1 })).toBeInTheDocument()
  })

  it('redirects administration to sign-in', async () => {
    renderApp({ route: '/administration' })
    expect(await screen.findByRole('heading', { name: /Sign in/i, level: 1 })).toBeInTheDocument()
  })
})

describe('authorised but denied', () => {
  it('shows Access Denied — never a blank screen — for a risk owner on administration', async () => {
    renderApp({ route: '/administration', signedInAs: SEEDED.riskOwner })

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('heading', { name: 'Access denied', level: 1 })).toBeInTheDocument()
    expect(within(alert).getByText(/do not have permission/i)).toBeInTheDocument()
  })

  it('denies every non-administrator role access to administration', async () => {
    for (const roleUser of [SEEDED.riskManager, SEEDED.riskOwner, SEEDED.controlOwner, SEEDED.actionOwner, SEEDED.auditor]) {
      const view = renderApp({ route: '/administration', signedInAs: roleUser })
      expect(await screen.findByRole('alert'), roleUser).toBeInTheDocument()
      view.unmount()
    }
  })

  it('denies an administrator access to website administration', async () => {
    renderApp({ route: '/admin/site', signedInAs: SEEDED.admin })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('denies reports to a control owner, who holds reports: none', async () => {
    renderApp({ route: '/reports', signedInAs: SEEDED.controlOwner })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('allows an auditor to read the register', async () => {
    renderApp({ route: '/register', signedInAs: SEEDED.auditor })
    expect(await screen.findByRole('heading', { name: 'Risk Register', level: 1 })).toBeInTheDocument()
  })
})

// --- layout requirements ----------------------------------------------------

describe('shell layout', () => {
  it('places the AIZEN brand mark at the head of the navigation rail', async () => {
    renderApp({ signedInAs: SEEDED.admin })
    const nav = await screen.findByRole('navigation', { name: 'Primary navigation' })
    expect(within(nav).getByRole('img', { name: /cotton flower/i })).toBeInTheDocument()
  })

  it('shows the client logo placeholder in the header until one is uploaded', async () => {
    renderApp({ signedInAs: SEEDED.admin })
    const banner = await screen.findByRole('banner')
    expect(within(banner).getByLabelText(/Client company logo/i)).toBeInTheDocument()
  })

  it('shows the ADMINISTRATION entry point to administrators', async () => {
    renderApp({ signedInAs: SEEDED.admin })
    const nav = await screen.findByRole('navigation', { name: 'Primary navigation' })
    expect(within(nav).getByRole('link', { name: 'Administration' })).toBeInTheDocument()
  })

  it('hides the ADMINISTRATION entry point from every other role', async () => {
    for (const roleUser of [SEEDED.riskManager, SEEDED.riskOwner, SEEDED.controlOwner, SEEDED.actionOwner, SEEDED.auditor]) {
      const view = renderApp({ route: '/dashboard', signedInAs: roleUser })
      const nav = await screen.findByRole('navigation', { name: 'Primary navigation' })
      expect(within(nav).queryByRole('link', { name: 'Administration' }), roleUser).toBeNull()
      view.unmount()
    }
  })

  it('shows Website Administration only to the super administrator', async () => {
    const superView = renderApp({ signedInAs: SEEDED.superAdmin })
    const superNav = await screen.findByRole('navigation', { name: 'Primary navigation' })
    expect(within(superNav).getByRole('link', { name: 'Website Administration' })).toBeInTheDocument()
    superView.unmount()

    renderApp({ signedInAs: SEEDED.admin })
    const adminNav = await screen.findByRole('navigation', { name: 'Primary navigation' })
    expect(within(adminNav).queryByRole('link', { name: 'Website Administration' })).toBeNull()
  })

  it('hides navigation entries the role cannot reach', async () => {
    renderApp({ signedInAs: SEEDED.controlOwner })
    const nav = await screen.findByRole('navigation', { name: 'Primary navigation' })

    expect(within(nav).getByRole('link', { name: 'Risk Register' })).toBeInTheDocument()
    // Control Owner holds reports: none.
    expect(within(nav).queryByRole('link', { name: 'Reports' })).toBeNull()
  })
})

// --- accessibility ----------------------------------------------------------

describe('accessibility baseline', () => {
  it('offers a skip link as the first tab stop', async () => {
    renderApp({ signedInAs: SEEDED.admin })
    const skip = await screen.findByRole('link', { name: 'Skip to main content' })
    expect(skip).toHaveAttribute('href', '#main-content')
  })

  it('labels the primary navigation landmark', async () => {
    renderApp({ signedInAs: SEEDED.admin })
    expect(await screen.findByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument()
  })

  it('exposes banner and main landmarks', async () => {
    renderApp({ signedInAs: SEEDED.admin })
    expect(await screen.findByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('gives the language toggle an accessible name', async () => {
    renderApp({ signedInAs: SEEDED.admin })
    expect(await screen.findByRole('button', { name: 'Switch to Georgian' })).toBeInTheDocument()
  })

  it('reaches every navigation control by keyboard', async () => {
    const user = userEvent.setup()
    renderApp({ signedInAs: SEEDED.admin })
    await screen.findByRole('navigation', { name: 'Primary navigation' })

    await user.tab()
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus()

    const reachable = new Set<string>()
    for (let step = 0; step < 12; step += 1) {
      await user.tab()
      const active = document.activeElement
      if (active?.textContent) reachable.add(active.textContent.trim())
    }

    expect(reachable).toContain('Dashboard')
    expect(reachable).toContain('Risk Register')
    expect(reachable).toContain('Administration')
  })
})

// --- internationalisation ---------------------------------------------------

describe('bilingual UI', () => {
  it('renders chrome in Georgian when the language is switched', async () => {
    renderApp({ signedInAs: SEEDED.admin, language: 'ka' })

    const nav = await screen.findByRole('navigation', { name: 'ძირითადი ნავიგაცია' })
    expect(within(nav).getByRole('link', { name: 'რისკების რეესტრი' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'ადმინისტრირება' })).toBeInTheDocument()
  })

  it('switches language at runtime from the toggle', async () => {
    const user = userEvent.setup()
    renderApp({ signedInAs: SEEDED.admin })

    const toggle = await screen.findByRole('button', { name: 'Switch to Georgian' })
    expect(screen.getByRole('link', { name: 'Risk Register' })).toBeInTheDocument()

    await user.click(toggle)

    expect(screen.getByRole('link', { name: 'რისკების რეესტრი' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Risk Register' })).toBeNull()
    // The toggle's own accessible name localises with everything else.
    expect(screen.getByRole('button', { name: 'გადართვა ინგლისურზე' })).toBeInTheDocument()
  })

  it('translates page headings too, not just navigation', async () => {
    renderApp({ route: '/register', signedInAs: SEEDED.admin, language: 'ka' })
    expect(
      await screen.findByRole('heading', { name: 'რისკების რეესტრი', level: 1 }),
    ).toBeInTheDocument()
  })
})

describe('English fallback for empty Georgian', () => {
  it('falls back when a Georgian value is empty or blank', () => {
    expect(pickLanguage('Enterprise', '', 'ka')).toBe('Enterprise')
    expect(pickLanguage('Enterprise', '   ', 'ka')).toBe('Enterprise')
    expect(pickLanguage('Enterprise', 'საწარმო', 'ka')).toBe('საწარმო')
    expect(pickLanguage('Enterprise', 'საწარმო', 'en')).toBe('Enterprise')
  })

  it('never renders a blank chrome string in either language', () => {
    for (const key of Object.keys(dictionary) as (keyof typeof dictionary)[]) {
      expect(translate(key, 'en').length, key).toBeGreaterThan(0)
      expect(translate(key, 'ka').length, key).toBeGreaterThan(0)
    }
  })
})

// --- route transition -------------------------------------------------------

/**
 * jsdom does not implement `Element.scrollTo`, so it cannot be spied on — it
 * has to be installed first. That absence is also why the shell guards the
 * call rather than assuming it exists.
 */
function stubScrollTo(): { calls: unknown[]; restore: () => void } {
  const calls: unknown[] = []
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')

  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: (options: unknown) => calls.push(options),
  })

  return {
    calls,
    restore: () => {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, 'scrollTo', descriptor)
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
    },
  }
}

describe('route transition', () => {
  it('scrolls the content region to the top on navigation', async () => {
    const scroll = stubScrollTo()

    renderApp({ signedInAs: SEEDED.admin })
    await screen.findByRole('main')

    expect(scroll.calls).toContainEqual(expect.objectContaining({ top: 0 }))
    scroll.restore()
  })

  it('uses smooth scrolling by default', async () => {
    const scroll = stubScrollTo()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))

    renderApp({ signedInAs: SEEDED.admin })
    await screen.findByRole('main')

    expect(scroll.calls).toContainEqual({ top: 0, behavior: 'smooth' })
    vi.unstubAllGlobals()
    scroll.restore()
  })

  it('drops the smooth behaviour under prefers-reduced-motion', async () => {
    const scroll = stubScrollTo()
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
    }))

    renderApp({ signedInAs: SEEDED.admin })
    await screen.findByRole('main')

    expect(scroll.calls).toContainEqual({ top: 0, behavior: 'auto' })
    vi.unstubAllGlobals()
    scroll.restore()
  })
})
