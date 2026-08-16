import { test } from '@playwright/test'

/*
 * Design Uplift §16.1 — the screenshot matrix.
 *
 * Every in-scope page, both locales, both required viewports. Run with
 * STAGE=before, make the change, run with STAGE=after, and compare.
 */

const OUT =
  '/private/tmp/claude-502/-Users-SOPHIKO-Desktop-Aizzen/2cad2133-a22c-4015-8b55-0eaed18c403a/scratchpad/shots/uplift'
const STAGE = process.env.STAGE ?? 'after'

const PUBLIC = [
  { name: 'home', path: '/' },
  { name: 'about', path: '/about' },
  { name: 'login', path: '/login' },
]

const APP = [
  { name: 'dashboard', path: '/app/dashboard' },
  { name: 'register', path: '/app/register' },
  { name: 'reports', path: '/app/reports' },
  { name: 'administration', path: '/app/administration' },
]

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill('admin@erm.local')
  await page.getByLabel('Password').fill('Admin#2026')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/app\//)
}

for (const width of [1280, 1440]) {
  for (const target of PUBLIC) {
    test(`${STAGE} public ${target.name} @${String(width)}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(target.path)
      await page.waitForTimeout(700)
      await page.screenshot({
        path: `${OUT}/${STAGE}-${target.name}-${String(width)}.png`,
        fullPage: true,
      })
    })
  }

  for (const locale of ['en', 'ka'] as const) {
    test(`${STAGE} app ${locale} @${String(width)}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await signIn(page)
      if (locale === 'ka') {
        await page.getByRole('button', { name: 'Switch to Georgian' }).click()
        await page.waitForTimeout(300)
      }

      /*
       * Navigate by rail POSITION, not by label: in Georgian the link text is
       * Georgian, so an English regex would never match. The rail order is
       * Dashboard, Register, Reports; Administration sits in the foot.
       */
      for (const [index, target] of APP.entries()) {
        const link =
          target.name === 'administration'
            ? page.locator('.rail__admin-link').first()
            : page.locator('.rail__link').nth(index)
        await link.click()
        await page.waitForTimeout(600)
        await page.screenshot({
          path: `${OUT}/${STAGE}-${target.name}-${locale}-${String(width)}.png`,
          fullPage: true,
        })
      }
    })
  }
}
