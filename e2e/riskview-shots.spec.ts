import { test } from '@playwright/test'

const OUT = '/private/tmp/claude-502/-Users-SOPHIKO-Desktop-Aizzen/2cad2133-a22c-4015-8b55-0eaed18c403a/scratchpad/shots/riskview'
const STAGE = process.env.STAGE ?? 'before'

const LONG = 'Lack of a documented methodology and process for data classification across environments. Confidentiality breaches, regulatory fines, licence impact, revenue loss and reputational damage. The information architecture methodology is being formalised. Delivery is dependent on the cloud migration programme.'

const ACTION = (n: number) => ({
  id: `a${String(n)}`, title: 'Visibility & Governance',
  description: 'Establish unified authenticated scanning and reporting for on-premise and cloud environments.',
  deliverable: 'Automated dashboard reporting on SLA breaches and unresolved critical vulnerabilities.',
  ownerId: 'usr_owner', dueDate: '2026-08-31', status: 'In Progress', priority: 'High',
  progress: 72, notes: 'Reporting model agreed; integrations continue.',
})

const RISK = {
  id: 'risk_1', ref: 'IT-001',
  title: 'Sensitive information assets are mixed with information assets of lesser criticality',
  type: 'Current', categoryId: 'cat_16', businessUnitId: 'bu_technology', riskOwnerId: 'usr_owner',
  originDate: '2025-01-15', reviewDate: '2026-09-30', targetDate: '2026-05-30',
  status: 'In Progress', responseType: 'Mitigate', outlook: 'Decreasing',
  description: LONG,
  cause: 'Lack of a documented methodology and process for data classification across environments.',
  event: 'Lack of a documented methodology and process for data classification across environments.',
  consequence: 'Confidentiality breaches, regulatory fines, licence impact, revenue loss and reputational damage.',
  statusNarrative: 'The information architecture methodology is being formalised. Delivery is dependent on the cloud migration programme.',
  inherent: { impact: 5, likelihood: 5 }, residual: { impact: 5, likelihood: 5 }, target: { impact: 2, likelihood: 4 },
  controls: [{ id: 'c1', title: 'DLP', ownerId: 'usr_owner', performer: 'Security', description: '', frequency: 'Monthly', intendedOutcome: '', evidenceLocation: '', keyControl: true, type: 'Corrective', automation: 'Manual', status: 'Not Assessed' }],
  actions: [ACTION(1), ACTION(2), ACTION(3), ACTION(4), ACTION(5), ACTION(6)],
  acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
  custom: {},
  history: [
    { id: 'h1', date: '2025-03-31', inherent: { impact: 5, likelihood: 5 }, residual: { impact: 4, likelihood: 4 }, target: { impact: 2, likelihood: 2 }, actorId: 'usr_owner', matrixVersion: 1 },
    { id: 'h2', date: '2025-12-31', inherent: { impact: 5, likelihood: 5 }, residual: { impact: 3, likelihood: 4 }, target: { impact: 2, likelihood: 2 }, actorId: 'usr_owner', matrixVersion: 1 },
    { id: 'h3', date: '2026-07-31', inherent: { impact: 5, likelihood: 5 }, residual: { impact: 3, likelihood: 4 }, target: { impact: 2, likelihood: 2 }, actorId: 'usr_owner', matrixVersion: 1 },
  ],
  audit: [], updatedAt: '2026-08-16T00:00:00.000Z',
}

for (const width of [1280, 1440]) {
  for (const locale of ['en', 'ka'] as const) {
    test(`${STAGE} risk overview ${locale} @${String(width)}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1500 })
      await page.goto('/login')
      await page.getByLabel('Email address').fill('admin@erm.local')
      await page.getByLabel('Password').fill('Admin#2026')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForURL(/\/dashboard/)
      await page.goto('/register')
      await page.evaluate((risk) => {
        const key = 'erm-risk-management-v3-state'
        const state = JSON.parse(localStorage.getItem(key)!)
        state.risks = [risk]
        localStorage.setItem(key, JSON.stringify(state))
      }, RISK)
      await page.reload()
      await page.waitForTimeout(500)
      if (locale === 'ka') {
        await page.getByRole('button', { name: 'Switch to Georgian' }).click()
        await page.waitForTimeout(200)
      }
      await page.locator('.register-table__title').first().click()
      await page.waitForTimeout(600)
      await page.screenshot({ path: `${OUT}/${STAGE}-overview-${locale}-${String(width)}.png` })

      /*
       * Design rules §8: the action list must scroll inside its panel rather
       * than pushing the rest of the overview down, and every panel except
       * assessment history must offer an edit affordance.
       */
      const scroll = await page
        .locator('.risk-actions__list')
        .evaluate((el) => el.scrollHeight > el.clientHeight + 1)
        .catch(() => null)
      console.log('ACTIONS-SCROLL', JSON.stringify(scroll))

      const historyEdit = await page.locator('.risk-history .risk-view__edit').count()
      console.log('HISTORY-EDIT', historyEdit)

      // The two columns of the split must end level, however many actions there are.
      const level = await page.evaluate(() => {
        const slot = document.querySelector('.risk-view__actions-slot')
        const aside = document.querySelector('.risk-view__aside')
        if (!slot || !aside) return null
        return {
          actions: Math.round(slot.getBoundingClientRect().bottom),
          aside: Math.round(aside.getBoundingClientRect().bottom),
        }
      })
      console.log('COLUMN-BOTTOMS', JSON.stringify(level))

      // Is the action list actually scrolling, and how far down does it go?
      await page.locator('.shell__main').evaluate((el) => { el.scrollTo(0, el.scrollHeight) })
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${OUT}/${STAGE}-overview-bottom-${locale}-${String(width)}.png` })
    })
  }
}
