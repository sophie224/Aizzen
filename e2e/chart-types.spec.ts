import { expect, test } from '@playwright/test'

const OUT = '/private/tmp/claude-502/-Users-SOPHIKO-Desktop-Aizzen/2cad2133-a22c-4015-8b55-0eaed18c403a/scratchpad/shots/charts'

const TYPES = ['column', 'columnStacked', 'columnPct', 'bar', 'barStacked', 'barPct', 'line', 'area', 'pie', 'doughnut'] as const

test('every chart type renders from register data', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/login')
  await page.getByLabel('Email address').fill('admin@erm.local')
  await page.getByLabel('Password').fill('Admin#2026')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/dashboard/)

  await page.goto('/dashboard')
  await page.evaluate(() => {
    const key = 'erm-risk-management-v3-state'
    const state = JSON.parse(localStorage.getItem(key)!)
    const mk = (n: number, status: string, impact: number, likelihood: number) => ({
      id: `risk_${String(n)}`, ref: `IT-00${String(n)}`, title: `Risk ${String(n)}`, type: 'Current',
      categoryId: 'cat_16', businessUnitId: 'bu_technology', riskOwnerId: 'usr_owner',
      originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2027-01-01',
      status, responseType: 'Mitigate', outlook: 'Stable',
      description: '', cause: 'c', event: 'e', consequence: 'q', statusNarrative: '',
      inherent: { impact: 5, likelihood: 5 }, residual: { impact, likelihood },
      target: { impact: 1, likelihood: 1 }, controls: [], actions: [],
      acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
      custom: {}, history: [], audit: [], updatedAt: '2026-01-01T00:00:00.000Z',
    })
    state.risks = [
      mk(1, 'In Progress', 1, 1), mk(2, 'In Progress', 1, 2), mk(3, 'In Progress', 3, 3),
      mk(4, 'In Progress', 3, 4), mk(5, 'In Progress', 5, 5), mk(6, 'In Progress', 5, 4),
      mk(7, 'Monitoring', 1, 1), mk(8, 'Monitoring', 3, 3), mk(9, 'Monitoring', 5, 5),
      mk(10, 'Draft', 1, 1), mk(11, 'Draft', 1, 2),
    ]
    // One distribution widget, grouped by status and broken down by rating.
    state.dashboards = [{
      id: 'dash_charts', nameEn: 'Charts', nameKa: '', descriptionEn: '', descriptionKa: '',
      accentColor: '#1a2151', shared: true, filters: {},
      widgets: [{
        id: 'w1', type: 'distribution', titleEn: 'Risks by status and rating', titleKa: '',
        accentColor: '#1a2151', backgroundColor: '#ffffff', span: 12,
        grouping: 'status', breakdown: 'rating', chartType: 'columnStacked',
      }],
    }]
    localStorage.setItem(key, JSON.stringify(state))
  })
  await page.reload()
  await page.waitForTimeout(700)

  // Custom dashboards tab, then edit mode.
  await page.getByText('Custom dashboards', { exact: true }).click().catch(() => undefined)
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Edit dashboard' }).click()
  await page.waitForTimeout(400)

  for (const type of TYPES) {
    await page.getByRole('radio', { name: new RegExp(type === 'bar' ? '^Clustered bar$' : '.', 'i') }).first().isVisible().catch(() => undefined)
    await page.locator(`input[type="radio"][name="w1-chart"]`).nth(TYPES.indexOf(type) + 1).check()
    await page.waitForTimeout(250)

    const chart = page.locator('.widget-chart').first()
    await expect(chart, type).toBeVisible()

    // Something was actually plotted.
    const drawn = await chart.evaluate(
      (node) => node.querySelectorAll('.chart-bars__segment, .chart-line path, .chart-round path').length,
    )
    expect(drawn, type).toBeGreaterThan(0)

    /*
     * Every category is named and every category total is printed. A chart
     * that shows only coloured shapes is unreadable and fails §9.
     */
    const named = await chart.evaluate(
      (node) => node.querySelectorAll('.chart-bars__label, .chart-axis__tick, .widget-chart__legend li').length,
    )
    expect(named, `${type} labels`).toBeGreaterThan(0)

    if (!['pie', 'doughnut', 'line', 'area'].includes(type)) {
      const totals = await chart.evaluate((node) =>
        [...node.querySelectorAll('.chart-bars__total')].map((n) => n.textContent?.trim()),
      )
      expect(totals.length, `${type} totals`).toBeGreaterThan(0)
      expect(totals.every((value) => value !== ''), `${type} totals non-empty`).toBe(true)
    }
    await page.locator('.dash-widget').first().screenshot({ path: `${OUT}/${type}.png` })
  }
})
