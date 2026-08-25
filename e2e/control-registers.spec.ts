import { expect, test } from '@playwright/test'

/*
 * Control Register and Control Deficiency Register (CR-2026), in a real
 * browser: the navigation placement the change request specifies (QA-01), a
 * framework import (QA-03), a finding raised by type-ahead (QA-12), and the
 * two touched risk screens (QA-06, §6).
 */

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill('admin@erm.local')
  await page.getByLabel('Password').fill('Admin#2026')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/dashboard/)
}

/** Seeds one risk plus one linked control through the app's own storage. */
async function seedRiskAndControl(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const key = 'erm-risk-management-v3-state'
    const state = JSON.parse(localStorage.getItem(key) ?? '{}')
    const unitId = state.businessUnits[1].id

    state.risks = [{
      id: 'risk_e2e', ref: 'TECH-900', title: 'E2E linked risk', type: 'Current',
      categoryId: state.categories[0].id, businessUnitId: unitId, riskOwnerId: state.users[1].id,
      originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2026-07-01',
      status: 'In Progress', responseType: 'Mitigate', outlook: 'Stable', description: '',
      cause: 'c', event: 'e', consequence: 'q', statusNarrative: '',
      inherent: { impact: 4, likelihood: 4 }, residual: { impact: 3, likelihood: 3 },
      target: { impact: 2, likelihood: 2 }, controls: [], actions: [],
      acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
      custom: {}, history: [], audit: [], updatedAt: '2026-01-01T00:00:00.000Z',
    }]
    state.controls = [{
      id: 'ctl_e2e', ref: '0001', source: 'Manual', frameworkId: null, frameworkVersion: '',
      businessUnitId: unitId, name: 'Quarterly privileged access review',
      objective: 'Privileged access is reviewed each quarter', ownerId: state.users[1].id,
      effectiveness: 'substantially_effective', maturity: 'defined', assurance: 'high',
      evidence: [], custom: {}, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }]
    state.controlRiskLinks = [{
      id: 'clk_e2e', riskId: 'risk_e2e', controlId: 'ctl_e2e',
      createdAt: '2026-01-01T00:00:00.000Z', actorId: 'usr_admin',
    }]
    localStorage.setItem(key, JSON.stringify(state))
  })
}

test('the registers sit under Risk Register and before Reports', async ({ page }) => {
  await signIn(page)

  const rail = page.getByRole('navigation', { name: 'Primary navigation' })
  const labels = await rail.getByRole('link').allTextContents()
  const register = labels.indexOf('Risk Register')

  expect(labels[register + 1]).toBe('Control Register')
  expect(labels[register + 2]).toBe('Control Deficiencies')
  expect(labels[register + 3]).toBe('Reports')
})

test('a framework import fills the register with its own identifiers', async ({ page }) => {
  await signIn(page)
  await page.goto('/controls')

  await page.getByRole('button', { name: 'Import from framework' }).click()
  await page.getByRole('combobox', { name: /Import into organization/ }).selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Import controls' }).click()
  await page.getByRole('button', { name: 'Close' }).last().click()

  await expect(page.getByRole('button', { name: 'Policies for information security' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'A.5.1', exact: true })).toBeVisible()
})

test('a finding maps to a control by type-ahead', async ({ page }) => {
  await signIn(page)
  await seedRiskAndControl(page)
  await page.goto('/control-deficiencies')

  await page.getByRole('button', { name: 'Add finding' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('searchbox').fill('privileged')
  await dialog.getByRole('button', { name: /Quarterly privileged access review/ }).click()
  await dialog.getByRole('textbox', { name: /Finding description/ }).fill('Evidence was not retained')
  await dialog.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByRole('cell', { name: '0001', exact: true })).toBeVisible()
})

test('a risk shows its linked controls, and the editor can change them', async ({ page }) => {
  await signIn(page)
  await seedRiskAndControl(page)

  await page.goto('/risks/risk_e2e')
  await page.getByRole('tab', { name: 'Controls' }).click()

  const panel = page.getByRole('region', { name: 'Linked controls' })
  await expect(panel).toBeVisible()
  await expect(panel.getByText('Substantially Effective')).toBeVisible()

  // The picker is additive: it sits inside the existing Controls tab.
  await page.getByRole('button', { name: /Edit/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: /Controls/ }).click()
  await expect(dialog.getByRole('heading', { name: 'Linked controls' })).toBeVisible()
  await expect(dialog.getByText('Optional — a risk can be saved with no controls linked.')).toBeVisible()
})

test('effectiveness can be changed from the register itself', async ({ page }) => {
  await signIn(page)
  await seedRiskAndControl(page)
  await page.goto('/controls')

  const cell = page.getByRole('combobox', { name: /Effectiveness: 0001/ })
  await expect(cell).toHaveValue('substantially_effective')

  await cell.selectOption('ineffective')
  await expect(page.getByRole('status').first()).toContainText('Saved')

  const stored = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('erm-risk-management-v3-state') ?? '{}')
    return {
      level: state.controls[0].effectiveness,
      // Only the one field moved, and the change is named in the trail.
      name: state.controls[0].name,
      changes: state.auditEvents[0].changes,
    }
  })
  expect(stored.level).toBe('ineffective')
  expect(stored.name).toBe('Quarterly privileged access review')
  expect(stored.changes).toEqual(['effectiveness'])

  // The risk that links this control shows the new value without being edited.
  await page.goto('/risks/risk_e2e')
  await page.getByRole('tab', { name: 'Controls' }).click()
  await expect(
    page.getByRole('region', { name: 'Linked controls' }).getByText('Ineffective'),
  ).toBeVisible()
})
