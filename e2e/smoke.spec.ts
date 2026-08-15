import { expect, test } from '@playwright/test'

/*
 * M1 smoke test: the shell boots and mounts. Route, role and parity
 * coverage arrive with M5–M9 and M16 (PLAN.md).
 */
test('application shell mounts', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto('/')

  await expect(page.locator('#root')).toBeAttached()
  expect(consoleErrors).toEqual([])
})
