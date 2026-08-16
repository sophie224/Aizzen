import { expect, test } from '@playwright/test'
const OUT = '/private/tmp/claude-502/-Users-SOPHIKO-Desktop-Aizzen/2cad2133-a22c-4015-8b55-0eaed18c403a/scratchpad/shots/riskview'

/*
 * The action list fills the panel, so its grid rows must not stretch: a short
 * plan would otherwise inflate each entry and space its own fields apart.
 */
for (const count of [1, 2, 6]) {
  test(`action entries keep their content height with ${String(count)}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.goto('/login')
    await page.getByLabel('Email address').fill('admin@erm.local')
    await page.getByLabel('Password').fill('Admin#2026')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(/\/dashboard/)
    await page.goto('/register')
    await page.evaluate((n) => {
      const key = 'erm-risk-management-v3-state'
      const state = JSON.parse(localStorage.getItem(key)!)
      const action = (i: number) => ({
        id: `a${String(i)}`, title: 'Visibility & Governance',
        description: 'Establish unified authenticated scanning and reporting.',
        deliverable: 'Automated dashboard reporting on SLA breaches.',
        ownerId: 'usr_owner', dueDate: '2026-08-31', status: 'In Progress',
        priority: 'High', progress: 72, notes: 'Reporting model agreed.',
      })
      state.risks = [{
        id: 'risk_1', ref: 'IT-001', title: 'Sensitive information assets are mixed',
        type: 'Current', categoryId: 'cat_16', businessUnitId: 'bu_technology',
        riskOwnerId: 'usr_owner', originDate: '2025-01-15', reviewDate: '2026-09-30',
        targetDate: '2026-05-30', status: 'In Progress', responseType: 'Mitigate',
        outlook: 'Decreasing', description: 'A documented methodology is missing.',
        cause: 'c', event: 'e', consequence: 'q', statusNarrative: 'In progress.',
        inherent: { impact: 5, likelihood: 5 }, residual: { impact: 5, likelihood: 5 },
        target: { impact: 2, likelihood: 4 }, controls: [],
        actions: Array.from({ length: n }, (_, i) => action(i)),
        acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
        custom: {}, history: [], audit: [], updatedAt: '2026-08-16T00:00:00.000Z',
      }]
      localStorage.setItem(key, JSON.stringify(state))
    }, count)
    await page.reload()
    await page.waitForTimeout(400)
    await page.locator('.register-table__title').first().click()
    await page.waitForTimeout(600)

    /*
     * An entry may be no taller than the content inside it. If the rows
     * stretched, the entry would grow well past its body.
     */
    const gaps = await page.locator('.risk-actions__item').evaluateAll((items) =>
      items.map((item) => {
        const body = item.querySelector('.risk-actions__body') as HTMLElement
        const children = [...body.children] as HTMLElement[]
        const contentHeight =
          children.at(-1)!.getBoundingClientRect().bottom - children[0].getBoundingClientRect().top
        return Math.round(body.getBoundingClientRect().height - contentHeight)
      }),
    )
    expect(gaps.length).toBe(count)
    for (const slack of gaps) expect(slack, `slack ${String(slack)}px`).toBeLessThanOrEqual(2)

    await page.locator('.risk-actions').screenshot({ path: `${OUT}/actions-${String(count)}.png` })
  })
}
