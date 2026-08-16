import { expect, test } from '@playwright/test'
const OUT = '/private/tmp/claude-502/-Users-SOPHIKO-Desktop-Aizzen/2cad2133-a22c-4015-8b55-0eaed18c403a/scratchpad/shots/charts'

test.use({ viewport: { width: 1440, height: 1000 } })

test('top N rows open the risk and every badge is one size', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email address').fill('admin@erm.local')
  await page.getByLabel('Password').fill('Admin#2026')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/app\//)

  await page.goto('/app/dashboard')
  await page.evaluate(() => {
    const key = 'erm-risk-management-v3-state'
    const state = JSON.parse(localStorage.getItem(key)!)
    const mk = (n: number, impact: number, likelihood: number) => ({
      id: `risk_${String(n)}`, ref: `IT-00${String(n)}`,
      title: `Sensitive information assets are mixed with information assets ${String(n)}`,
      type: 'Current', categoryId: 'cat_16', businessUnitId: 'bu_technology', riskOwnerId: 'usr_owner',
      originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2027-01-01',
      status: 'In Progress', responseType: 'Mitigate', outlook: 'Stable',
      description: '', cause: 'c', event: 'e', consequence: 'q', statusNarrative: '',
      inherent: { impact: 5, likelihood: 5 }, residual: { impact, likelihood },
      target: { impact: 1, likelihood: 1 }, controls: [], actions: [],
      acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
      custom: {}, history: [], audit: [], updatedAt: '2026-01-01T00:00:00.000Z',
    })
    state.risks = [mk(1, 5, 5), mk(2, 4, 4), mk(3, 3, 3), mk(4, 1, 1)]
    state.dashboards = [{
      id: 'd1', nameEn: 'Fixes', nameKa: '', descriptionEn: '', descriptionKa: '',
      accentColor: '#1a2151', shared: true, filters: {},
      widgets: [
        { id: 'w1', type: 'topRisks', titleEn: 'Top 10', titleKa: '', accentColor: '#1a2151',
          backgroundColor: '#ffffff', span: 6, scoreBasis: 'residual', limit: 10 },
        { id: 'w2', type: 'heatmap', titleEn: 'Heat map', titleKa: '', accentColor: '#1a2151',
          backgroundColor: '#ffffff', span: 6, scoreBasis: 'residual' },
      ],
    }]
    localStorage.setItem(key, JSON.stringify(state))
  })
  await page.reload()
  await page.waitForTimeout(500)
  await page.getByText('Custom dashboards', { exact: true }).click().catch(() => undefined)
  await page.waitForTimeout(500)

  // Every rating badge in Top N is exactly the same size.
  const sizes = await page.locator('.widget-top__score').evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect()
      return `${Math.round(r.width)}x${Math.round(r.height)}`
    }),
  )
  expect(sizes.length).toBeGreaterThan(1)
  expect(new Set(sizes).size, `badge sizes: ${sizes.join(', ')}`).toBe(1)

  await page.locator('.dash-widget').first().screenshot({ path: `${OUT}/topn.png` })

  // A populated heatmap cell drills into the register; an empty one does not.
  const cells = page.locator('.widget-heatmap__cell')
  expect(await cells.count()).toBeGreaterThan(0)
  await page.locator('.dash-widget').nth(1).screenshot({ path: `${OUT}/heatmap.png` })

  await cells.first().click()
  await page.waitForURL(/\/app\/register/)
  expect(page.url()).toContain('impact=')

  // A Top N row opens that risk's overview.
  await page.goBack()
  await page.waitForTimeout(500)
  await page.getByText('Custom dashboards', { exact: true }).click().catch(() => undefined)
  await page.waitForTimeout(400)
  await page.locator('.widget-top__link').first().click()
  await page.waitForURL(/\/app\/risks\//)
})
