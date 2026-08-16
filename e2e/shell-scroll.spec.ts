import { expect, test } from '@playwright/test'

/*
 * The application shell owns exactly one scrollport: `.shell__main`.
 *
 * If anything escapes it the document itself scrolls, and scrolling then lifts
 * the whole shell — navigation rail included — off the bottom of the window,
 * leaving a bare strip under the page. Two things caused that:
 *
 *   - `height: 100%` on the shell, which ignores a collapsing browser toolbar
 *   - `.visually-hidden`, which is positioned but has no offsets, so with no
 *     positioned ancestor its containing block was the document and a
 *     screen-reader-only label below the fold extended the page
 *
 * Short viewports are where it shows, so this checks the small ones too.
 */

const ROUTES = [
  '/app/dashboard',
  '/app/register',
  '/app/reports',
  '/app/administration',
]

const HEIGHTS = [600, 700, 900]

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill('admin@erm.local')
  await page.getByLabel('Password').fill('Admin#2026')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/app\//)
}

/** How far the document itself can scroll. Must be zero inside the shell. */
const documentOverflow = () =>
  document.documentElement.scrollHeight - document.documentElement.clientHeight

for (const height of HEIGHTS) {
  test(`the document never scrolls behind the shell @${String(height)}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height })
    await signIn(page)

    for (const route of ROUTES) {
      await page.goto(route)
      await page.waitForTimeout(400)
      expect(await page.evaluate(documentOverflow), route).toBe(0)
    }

    // A risk with a long action list is the densest page in the product.
    await page.goto('/app/register')
    await page.evaluate(() => {
      const key = 'erm-risk-management-v3-state'
      const state = JSON.parse(localStorage.getItem(key)!)
      const action = (n: number) => ({
        id: `a${String(n)}`,
        title: 'Visibility & Governance',
        description: 'Establish unified authenticated scanning and reporting.',
        deliverable: 'Automated dashboard reporting on SLA breaches.',
        ownerId: 'usr_owner',
        dueDate: '2026-08-31',
        status: 'In Progress',
        priority: 'High',
        progress: 72,
        notes: 'Reporting model agreed; integrations continue.',
      })
      state.risks = [
        {
          id: 'risk_1', ref: 'IT-001', title: 'Sensitive information assets are mixed',
          type: 'Current', categoryId: 'cat_16', businessUnitId: 'bu_technology',
          riskOwnerId: 'usr_owner', originDate: '2025-01-15', reviewDate: '2026-09-30',
          targetDate: '2026-05-30', status: 'In Progress', responseType: 'Mitigate',
          outlook: 'Decreasing', description: 'A documented methodology is missing.',
          cause: 'c', event: 'e', consequence: 'q', statusNarrative: 'In progress.',
          inherent: { impact: 5, likelihood: 5 }, residual: { impact: 5, likelihood: 5 },
          target: { impact: 2, likelihood: 4 }, controls: [],
          actions: [1, 2, 3, 4, 5, 6, 7, 8].map(action),
          acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
          custom: {}, history: [], audit: [], updatedAt: '2026-08-16T00:00:00.000Z',
        },
      ]
      localStorage.setItem(key, JSON.stringify(state))
    })
    await page.reload()
    await page.waitForTimeout(400)
    expect(await page.evaluate(documentOverflow), '/app/register seeded').toBe(0)

    await page.locator('.register-table__title').first().click()
    await page.waitForTimeout(500)
    expect(await page.evaluate(documentOverflow), '/app/risks/:id').toBe(0)

    // Scrolling the main region to the end must not move the rail.
    const railBefore = await page.locator('.rail').evaluate((el) => el.getBoundingClientRect().bottom)
    await page.locator('.shell__main').evaluate((el) => {
      el.scrollTo(0, el.scrollHeight)
    })
    await page.waitForTimeout(200)
    const railAfter = await page.locator('.rail').evaluate((el) => el.getBoundingClientRect().bottom)
    expect(railAfter).toBe(railBefore)
    expect(await page.evaluate(documentOverflow), 'after scrolling to the end').toBe(0)
  })
}
