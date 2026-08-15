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

  it('offers the public navigation on every public page', async () => {
    renderApp({ route: '/' })

    const nav = await screen.findByRole('navigation', { name: 'Public website navigation' })
    expect(within(nav).getByRole('button', { name: 'Home' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Solutions' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Product demo' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'About us' })).toBeInTheDocument()
  })

  it('sends a signed-out visitor to sign-in, not into the platform', async () => {
    renderApp({ route: '/' })

    const signIn = await screen.findByRole('button', { name: 'Sign in to platform' })
    await userEvent.click(signIn)

    expect(await screen.findByRole('heading', { name: 'Sign in to Aizzen' })).toBeInTheDocument()
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
    await userEvent.click(within(nav).getByRole('button', { name: 'About us' }))

    expect(await screen.findByRole('heading', { name: /About AIZEN/i, level: 1 })).toBeInTheDocument()
  })

  it('renders Georgian copy when the language is Georgian', async () => {
    renderApp({ route: '/', language: 'ka' })

    expect(await screen.findByRole('button', { name: 'მთავარი' })).toBeInTheDocument()
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
