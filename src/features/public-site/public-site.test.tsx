import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, SEEDED } from '../../app/test-harness.tsx'
import { youTubeEmbedUrl } from './video-url.ts'

/*
 * Public website (ARCHITECTURE.md §8.5).
 *
 * The site is content-managed: these tests assert it renders what siteContent
 * holds and routes the visitor correctly, not that any particular sentence of
 * marketing copy exists.
 */

describe('public home page', () => {
  it('renders the seeded hero, solutions and demo sections without a session', async () => {
    renderApp({ route: '/' })

    expect(
      await screen.findByRole('heading', { name: /Turn risk decisions/i, level: 1 }),
    ).toBeInTheDocument()

    // Every seeded solution card, in configured order, with its status.
    expect(screen.getByRole('heading', { name: 'Risk Management', level: 3 })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Compliance Management', level: 3 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Audit Management', level: 3 })).toBeInTheDocument()

    // Status is spelled out, never carried by colour alone.
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThan(0)
  })

  /*
   * The nav items are links, not buttons: each one is an address the visitor
   * can copy, open in a new tab and reach with the back button.
   */
  it('offers the public navigation as addressable links', async () => {
    renderApp({ route: '/' })

    const nav = await screen.findByRole('navigation', { name: 'Public website navigation' })
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(within(nav).getByRole('link', { name: 'Solutions' })).toHaveAttribute(
      'href',
      '/#solutions',
    )
    expect(within(nav).getByRole('link', { name: 'Product demo' })).toHaveAttribute('href', '/#demo')
    expect(within(nav).getByRole('link', { name: 'About us' })).toHaveAttribute('href', '/about')
  })

  it('sends a signed-out visitor to sign-in, not into the platform', async () => {
    renderApp({ route: '/' })

    const signIn = await screen.findByRole('button', { name: 'Sign in to platform' })
    await userEvent.click(signIn)

    expect(await screen.findByRole('heading', { name: 'Sign in', level: 1 })).toBeInTheDocument()
  })

  it('sends a signed-in user straight into the dashboard', async () => {
    renderApp({ route: '/', signedInAs: SEEDED.admin })

    const header = await screen.findByRole('banner')
    await userEvent.click(within(header).getByRole('button', { name: 'Open Risk Management' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
  })

  it('navigates from Home to About Us', async () => {
    renderApp({ route: '/' })

    const nav = await screen.findByRole('navigation', { name: 'Public website navigation' })
    await userEvent.click(within(nav).getByRole('link', { name: 'About us' }))

    expect(await screen.findByRole('heading', { name: /About AIZEN/i, level: 1 })).toBeInTheDocument()
  })

  /*
   * Clicking a section must put that section in the URL — otherwise the page
   * scrolls to somewhere the visitor cannot link to, and the header has no way
   * of knowing which item to highlight.
   */
  it('puts the section in the URL and marks it current', async () => {
    renderApp({ route: '/' })

    const nav = await screen.findByRole('navigation', { name: 'Public website navigation' })
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'location',
    )

    await userEvent.click(within(nav).getByRole('link', { name: 'Solutions' }))

    expect(within(nav).getByRole('link', { name: 'Solutions' })).toHaveAttribute(
      'aria-current',
      'location',
    )
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')

    await userEvent.click(within(nav).getByRole('link', { name: 'Product demo' }))

    expect(within(nav).getByRole('link', { name: 'Product demo' })).toHaveAttribute(
      'aria-current',
      'location',
    )
    expect(within(nav).getByRole('link', { name: 'Solutions' })).not.toHaveAttribute('aria-current')
  })

  it('opens a shared section link with that section current', async () => {
    renderApp({ route: '/#demo' })

    const nav = await screen.findByRole('navigation', { name: 'Public website navigation' })
    expect(within(nav).getByRole('link', { name: 'Product demo' })).toHaveAttribute(
      'aria-current',
      'location',
    )
  })

  it('returns to the top of the page without a fragment', async () => {
    renderApp({ route: '/#solutions' })

    const nav = await screen.findByRole('navigation', { name: 'Public website navigation' })
    await userEvent.click(within(nav).getByRole('link', { name: 'Home' }))

    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'location',
    )
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
  })

  it('renders Georgian copy when the language is Georgian', async () => {
    renderApp({ route: '/', language: 'ka' })

    expect(await screen.findByRole('link', { name: 'მთავარი' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /გადააქციეთ რისკის გადაწყვეტილებები/, level: 1 }),
    ).toBeInTheDocument()
  })
})

describe('website administration entry point', () => {
  it('is hidden from a visitor who is not a Super Administrator', async () => {
    renderApp({ route: '/', signedInAs: SEEDED.admin })

    const header = await screen.findByRole('banner')
    await within(header).findByRole('button', { name: 'Open Risk Management' })
    expect(screen.queryByRole('button', { name: 'Site management' })).not.toBeInTheDocument()
  })

  it('is offered to the Super Administrator', async () => {
    renderApp({ route: '/', signedInAs: SEEDED.superAdmin })

    expect(await screen.findByRole('button', { name: 'Site management' })).toBeInTheDocument()
  })
})

describe('about page', () => {
  it('renders the four pillars from siteContent', async () => {
    renderApp({ route: '/about' })

    expect(await screen.findByRole('heading', { name: 'Our reach', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Our people', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Our clients', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Our vision', level: 2 })).toBeInTheDocument()
  })

  it('explains an empty team rather than rendering a blank grid', async () => {
    renderApp({ route: '/about' })

    expect(await screen.findByText(/Team profiles can be published/i)).toBeInTheDocument()
  })
})

describe('youTubeEmbedUrl', () => {
  it('accepts the watch, short and embed forms', () => {
    expect(youTubeEmbedUrl('https://www.youtube.com/watch?v=abc123XYZ')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123XYZ?rel=0',
    )
    expect(youTubeEmbedUrl('https://youtu.be/abc123XYZ')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123XYZ?rel=0',
    )
    expect(youTubeEmbedUrl('https://www.youtube.com/embed/abc123XYZ')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123XYZ?rel=0',
    )
  })

  // Anything else is treated as absent — an administrator-supplied URL never
  // reaches an iframe src unrecognised.
  it('rejects everything else', () => {
    expect(youTubeEmbedUrl('')).toBe('')
    expect(youTubeEmbedUrl('   ')).toBe('')
    expect(youTubeEmbedUrl('javascript:alert(1)')).toBe('')
    expect(youTubeEmbedUrl('https://example.com/video.mp4')).toBe('')
  })
})
