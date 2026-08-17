import { expect, test } from '@playwright/test'

/*
 * Section navigation on the public site.
 *
 * The header's items are fragment links: clicking one must put the section in
 * the URL, land the section clear of the sticky header, and light the matching
 * item. Scrolling by hand must move the URL and the highlight with it.
 */

test('a nav click puts the section in the URL and highlights it', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Public website navigation' })

  await nav.getByRole('link', { name: 'Solutions' }).click()
  await page.waitForTimeout(1200)

  expect(page.url()).toContain('/#solutions')
  await expect(nav.getByRole('link', { name: 'Solutions' })).toHaveAttribute(
    'aria-current',
    'location',
  )

  await nav.getByRole('link', { name: 'Product demo' }).click()
  await page.waitForTimeout(1200)

  expect(page.url()).toContain('/#demo')
  await expect(nav.getByRole('link', { name: 'Product demo' })).toHaveAttribute(
    'aria-current',
    'location',
  )
})

/*
 * A pasted `/#solutions` must open ON that section, offset by the header
 * allowance the stylesheet reserves (`scroll-margin-block-start`) rather than
 * flush against the top edge.
 */
test('a pasted section link opens on that section, clear of the header', async ({ page }) => {
  await page.goto('/#solutions')
  await page.waitForTimeout(1500)

  const { sectionTop, allowance } = await page.evaluate(() => {
    const section = document.getElementById('solutions')!
    return {
      sectionTop: section.getBoundingClientRect().top,
      allowance: Number.parseFloat(getComputedStyle(section).scrollMarginTop),
    }
  })

  expect(Math.abs(sectionTop - allowance)).toBeLessThan(4)
})

test('scrolling by hand moves the URL and the highlight', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Public website navigation' })

  await page.locator('#demo').evaluate((element) => {
    element.scrollIntoView({ behavior: 'auto', block: 'start' })
  })
  await page.waitForTimeout(700)

  expect(page.url()).toContain('/#demo')
  await expect(nav.getByRole('link', { name: 'Product demo' })).toHaveAttribute(
    'aria-current',
    'location',
  )

  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  })
  await page.waitForTimeout(700)

  expect(page.url()).not.toContain('#')
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'location')
})

test('the back button returns to the previous section', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Public website navigation' })

  await nav.getByRole('link', { name: 'Solutions' }).click()
  await page.waitForTimeout(1000)
  await nav.getByRole('link', { name: 'Product demo' }).click()
  await page.waitForTimeout(1000)

  await page.goBack()
  await page.waitForTimeout(1000)

  expect(page.url()).toContain('/#solutions')
  const sectionTop = await page
    .locator('#solutions')
    .evaluate((element) => element.getBoundingClientRect().top)
  expect(Math.abs(sectionTop)).toBeLessThan(160)
})
