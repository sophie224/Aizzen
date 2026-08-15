import { describe, expect, it } from 'vitest'

/*
 * Verifies the M1 test harness itself: jsdom environment, jest-dom matchers
 * and the setup file are all wired up. Feature tests arrive from M2 onward.
 */
describe('toolchain', () => {
  it('runs in a jsdom environment', () => {
    expect(typeof document).toBe('object')
    expect(document.body).toBeDefined()
  })

  it('registers jest-dom matchers', () => {
    const element = document.createElement('div')
    element.textContent = 'aizzen'
    document.body.append(element)

    expect(element).toBeInTheDocument()
    expect(element).toHaveTextContent('aizzen')
  })
})
