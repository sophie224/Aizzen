import { expect, test } from '@playwright/test'
const OUT = '/private/tmp/claude-502/-Users-SOPHIKO-Desktop-Aizzen/2cad2133-a22c-4015-8b55-0eaed18c403a/scratchpad/shots/charts'

for (const width of [1280, 1440]) {
  test(`dashboard filters fit one row @${String(width)}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/login')
    await page.getByLabel('Email address').fill('admin@erm.local')
    await page.getByLabel('Password').fill('Admin#2026')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(/\/app\//)
    await page.goto('/app/dashboard')
    await page.waitForTimeout(600)

    const rows = await page.locator('.dash-filters label').evaluateAll((nodes) => {
      const tops = nodes.map((node) => Math.round(node.getBoundingClientRect().top))
      return { count: nodes.length, rows: new Set(tops).size }
    })
    expect(rows.count).toBe(8)
    expect(rows.rows, 'filter rows').toBe(1)

    // Nothing clipped inside a control.
    const clipped = await page.locator('.dash-filters select, .dash-filters input').evaluateAll((nodes) =>
      nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).length,
    )
    expect(clipped).toBe(0)

    await page.locator('.dash-filters').screenshot({ path: `${OUT}/filters-${String(width)}.png` })
  })
}
