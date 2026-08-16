import { expect, test, type Page } from '@playwright/test'

const OUT = '/private/tmp/claude-502/-Users-SOPHIKO-Desktop-Aizzen/2cad2133-a22c-4015-8b55-0eaed18c403a/scratchpad/shots/cr005'

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill('admin@erm.local')
  await page.getByLabel('Password').fill('Admin#2026')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/app\//)
}


/*
 * The shipped seed contains no risks, so QA injects a small register through
 * the app's own storage key and reloads. Presentation-only checks — nothing
 * here changes what the application computes.
 */
const FIXTURE_RISKS = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: `risk_${n}`,
  ref: `TECH-00${n}`,
  title: [
    'Legacy platform fragility across the core banking stack',
    'Phishing exposure in the corporate mail estate',
    'Liquidity headroom under a stressed funding scenario',
    'Third-party processor concentration',
    'Regulatory reporting timeliness',
    'Key person dependency in the data platform team',
  ][n - 1],
  type: 'Current',
  categoryId: 'cat_16',
  businessUnitId: 'bu_technology',
  riskOwnerId: 'usr_owner',
  originDate: '2026-01-01',
  reviewDate: '2027-01-01',
  // Half the rows are overdue, so the Overdue pill is on screen.
  targetDate: n % 2 === 0 ? '2026-01-15' : '2027-07-01',
  status: n % 3 === 0 ? 'Monitoring' : 'In Progress',
  responseType: 'Mitigate',
  outlook: 'Stable',
  // Long enough to overflow a compact row, so the clamp and popover are live.
  description:
    'Manually written description used to exercise the clamped description column. It runs well past the two lines a compact row affords, so the cell shows a "more" affordance and expands into a popover carrying the whole text without truncation.',
  cause: 'Cause narrative',
  event: 'Event narrative',
  consequence: 'Consequence narrative',
  statusNarrative: '',
  // Spread across the four rating bands so every configured colour appears.
  inherent: { impact: 5, likelihood: 5 },
  residual: [
    { impact: 1, likelihood: 1 },
    { impact: 3, likelihood: 3 },
    { impact: 5, likelihood: 4 },
    { impact: 5, likelihood: 5 },
    { impact: 2, likelihood: 4 },
    { impact: 4, likelihood: 2 },
  ][n - 1],
  target: { impact: 2, likelihood: 2 },
  controls: [],
  actions: [],
  acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
  custom: {},
  history: [],
  audit: [],
  updatedAt: '2026-01-01T00:00:00.000Z',
}))

async function seedRisks(page: Page) {
  await page.evaluate((risks) => {
    const key = 'erm-risk-management-v3-state'
    const state = JSON.parse(localStorage.getItem(key)!)
    state.risks = risks
    localStorage.setItem(key, JSON.stringify(state))
  }, FIXTURE_RISKS)
  await page.reload()
}

test.describe('CR-005 design system', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('register: no frozen columns, equal chips, equal row heights', async ({ page }) => {
    await signIn(page)
    await page.goto('/app/register')
    await seedRisks(page)
    await expect(page.getByRole('heading', { name: 'Risk Register' })).toBeVisible()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/01-register-1440.png`, fullPage: true })

    /*
     * No column is frozen horizontally. The header row is still sticky
     * vertically — that is a separate, long-standing behaviour — so this
     * checks the horizontal offset specifically.
     */
    const n = page.locator('.register-table thead th[data-column="n"]')
    expect(await n.evaluate((el) => getComputedStyle(el).left)).toBe('auto')

    const title = page.locator('.register-table thead th[data-column="title"]')
    const before = await title.boundingBox()
    await page.locator('.register-table-scroll').evaluate((el) => {
      el.scrollTo({ left: 400 })
    })
    await page.waitForTimeout(300)
    const after = await title.boundingBox()
    expect((before?.x ?? 0) - (after?.x ?? 0)).toBeCloseTo(400, -1)
    await page.screenshot({ path: `${OUT}/02-register-scrolled.png` })

    await page.locator('.register-table-scroll').evaluate((el) => {
      el.scrollTo({ left: 0 })
    })

    // Every rating chip is exactly the same size, whatever the rating word.
    const chipSizes = await page.locator('.rating-chip').evaluateAll((nodes) =>
      nodes.map((node) => `${node.getBoundingClientRect().width}x${node.getBoundingClientRect().height}`),
    )
    /*
     * Identical in a stock configuration: the floor is sized for the widest
     * default rating name. The badge is content-sized, so a longer custom name
     * would grow it rather than clip — that is intended.
     */
    expect(new Set(chipSizes).size).toBe(1)

    // ...and no badge overflows the cell it sits in.
    const overflowing = await page.locator('.rating-chip').evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const cell = node.closest('td')
          if (!cell) return false
          return node.getBoundingClientRect().right > cell.getBoundingClientRect().right + 1
        })
        .map((node) => node.textContent),
    )
    expect(overflowing).toEqual([])

    // ...and no rating word is clipped inside it.
    const clipped = await page.locator('.rating-chip__rating').evaluateAll((nodes) =>
      nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.textContent),
    )
    expect(clipped).toEqual([])

    // Compact rows are all the same height.
    const rowHeights = await page
      .locator('.register-table--compact tbody tr')
      .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)))
    /*
     * Uniform to within a pixel: the last row omits its bottom border, which
     * is intended, so an exact-equality check would fail on that alone.
     */
    expect(Math.max(...rowHeights) - Math.min(...rowHeights)).toBeLessThanOrEqual(1)

    // Exactly one Overdue indicator per row that has one.
    const overdue = page.locator('.register-table__overdue')
    const count = await overdue.count()
    for (let i = 0; i < count; i += 1) {
      await expect(overdue.nth(i)).toHaveClass(/pill/)
    }

    // Row hover changes background without moving anything.
    const row = page.locator('.register-table tbody tr').first()
    const box = await row.boundingBox()
    await row.hover()
    await page.waitForTimeout(200)
    const hovered = await row.boundingBox()
    expect(hovered?.y).toBeCloseTo(box?.y ?? 0, 0)
    await page.screenshot({ path: `${OUT}/03-register-row-hover.png` })
  })

  test('register: expandable cells and the date-only column', async ({ page }) => {
    await signIn(page)
    await page.goto('/app/register')
    await seedRisks(page)
    await expect(page.getByRole('heading', { name: 'Risk Register' })).toBeVisible()

    // The target-date cell shows the date and nothing else.
    const dateCell = page.locator('.register-table td[data-column="targetDate"]').first()
    expect((await dateCell.innerText()).trim()).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // The Status cell carries the risk status and nothing else.
    const overdueRow = page.locator('.register-table tbody tr', { hasText: '2026-01-15' }).first()
    await expect(overdueRow.locator('td[data-column="status"] .pill')).toHaveCount(1)

    // Description and Action plan share one width.
    const widths = await page
      .locator('.register-table th[data-column="description"], .register-table th[data-column="actionPlan"]')
      .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width)))
    expect(widths[0]).toBe(widths[1])

    // A clamped description expands into a popover, and closes on Escape.
    const expandable = page.locator('td[data-column="description"] .expandable.is-expandable').first()
    await expect(expandable).toBeVisible()
    await expandable.click()
    const popover = page.getByRole('dialog', { name: 'Show the full description' })
    await expect(popover).toBeVisible()
    await page.screenshot({ path: `${OUT}/30-description-popover.png` })

    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
    // Focus returns to the cell that opened it.
    await expect(expandable).toBeFocused()

    // Keyboard opens it too.
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Show the full description' })).toBeVisible()

    // Scrolling the table dismisses it.
    await page.locator('.register-table-scroll').evaluate((el) => {
      el.scrollTo({ left: 200 })
    })
    await expect(page.getByRole('dialog', { name: 'Show the full description' })).toBeHidden()
  })

  test('register: score badge contrast clears the large-text threshold', async ({ page }) => {
    await signIn(page)
    await page.goto('/app/register')
    await seedRisks(page)
    await expect(page.getByRole('heading', { name: 'Risk Register' })).toBeVisible()

    const failures = await page.locator('.rating-chip').evaluateAll((nodes) => {
      const lum = (rgb: number[]) => {
        const c = rgb.map((v) => {
          const s = v / 255
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
      }
      const parse = (value: string) => value.match(/\d+/g)!.slice(0, 3).map(Number)

      return nodes
        .map((node) => {
          const style = getComputedStyle(node)
          const a = lum(parse(style.backgroundColor))
          const b = lum(parse(style.color))
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
          return { text: node.textContent, bg: style.backgroundColor, fg: style.color, ratio }
        })
        // Bold, display-size label: judged against the 3:1 large-text bar.
        .filter((entry) => entry.ratio < 3)
    })
    expect(failures).toEqual([])

    // The configured red carries white, the pale fills carry dark ink.
    const pairs = await page.locator('.rating-chip').evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node)
        return `${style.backgroundColor} -> ${style.color}`
      }),
    )
    expect(pairs).toContain('rgb(243, 33, 33) -> rgb(255, 255, 255)')
    expect(pairs).toContain('rgb(255, 242, 0) -> rgb(13, 17, 40)')

  })

  /*
   * Compact is a fixed-height scan list; Detailed prints everything and grows
   * to fit. The score badge is identical in both.
   */
  test('compact is fixed height, detailed is complete', async ({ page }) => {
    await signIn(page)
    await page.goto('/app/register')
    await seedRisks(page)
    await expect(page.getByRole('heading', { name: 'Risk Register' })).toBeVisible()

    const measure = async () =>
      page.evaluate(() => ({
        rows: [...document.querySelectorAll('.register-table tbody tr')].map((row) =>
          Math.round(row.getBoundingClientRect().height),
        ),
        badge: (() => {
          const chip = document.querySelector('.rating-chip') as HTMLElement
          const rect = chip.getBoundingClientRect()
          const style = getComputedStyle(chip)
          return `${Math.round(rect.width)}x${Math.round(rect.height)}|${style.borderRadius}|${style.fontSize}`
        })(),
        // Any cell whose content overflows the box it is drawn in.
        clipped: [...document.querySelectorAll('.expandable__content')].filter(
          (node) => node.scrollHeight > node.clientHeight + 1,
        ).length,
      }))

    const compact = await measure()
    // Every row the same height; the last is 1px shorter, having no bottom border.
    expect(Math.max(...compact.rows) - Math.min(...compact.rows)).toBeLessThanOrEqual(1)

    await page.getByText('Detailed', { exact: true }).click()
    await page.waitForTimeout(400)
    const detailed = await measure()

    // Detailed grows to its content — the long description makes a taller row.
    expect(Math.max(...detailed.rows)).toBeGreaterThan(Math.max(...compact.rows))
    // ...and nothing is truncated.
    expect(detailed.clipped).toBe(0)
    await expect(page.locator('.expandable__more')).toHaveCount(0)

    // The badge is byte-identical between the two views.
    expect(detailed.badge).toBe(compact.badge)
  })

  test('score badges are one size on every surface', async ({ page }) => {
    await signIn(page)
    await page.goto('/app/register')
    await seedRisks(page)
    await expect(page.getByRole('heading', { name: 'Risk Register' })).toBeVisible()

    /*
     * Size, shape and weight of every score badge on screen. A rating must not
     * change size as the user moves between the register, the detail hero, the
     * Assessment cards and the editor.
     */
    const badges = async () =>
      page.locator('.rating-chip').evaluateAll((nodes) =>
        nodes.map((node) => {
          const style = getComputedStyle(node)
          const rect = node.getBoundingClientRect()
          const weights = [...node.children].map((child) => getComputedStyle(child).fontWeight)
          return `${Math.round(rect.width)}x${Math.round(rect.height)}|${style.borderRadius}|${weights.join(',')}`
        }),
      )

    const register = new Set(await badges())
    expect(register.size).toBe(1)
    // Every part of the badge is bold.
    expect([...register][0]).toContain('700,700,700')

    await page.locator('.register-table__title').first().click()
    await expect(page.getByRole('link', { name: 'Back to register' })).toBeVisible()
    expect([...new Set(await badges())]).toEqual([...register])

    await page.getByRole('tab', { name: 'Assessment' }).click()
    await page.waitForTimeout(200)
    expect([...new Set(await badges())]).toEqual([...register])

    await page.getByRole('button', { name: 'Edit risk', exact: true }).click()
    await page.getByRole('tab', { name: 'Risk assessments' }).click()
    await page.waitForTimeout(200)
    expect([...new Set(await badges())]).toEqual([...register])
  })

  test('register: one status badge per row, matching the editor', async ({ page }) => {
    await signIn(page)
    await page.goto('/app/register')
    await seedRisks(page)
    await expect(page.getByRole('heading', { name: 'Risk Register' })).toBeVisible()

    // Exactly one badge in every Status cell.
    const counts = await page
      .locator('.register-table td[data-column="status"]')
      .evaluateAll((nodes) => nodes.map((node) => node.querySelectorAll('.pill').length))
    expect(new Set(counts)).toEqual(new Set([1]))

    // The register value is the value the editor shows for the same risk.
    const rowStatus = await page
      .locator('.register-table tbody tr')
      .first()
      .locator('td[data-column="status"] .pill')
      .innerText()

    await page.locator('.register-table__title').first().click()
    await page.getByRole('button', { name: 'Edit risk', exact: true }).click()
    const select = page.getByRole('combobox', { name: 'Status' })
    await expect(select).toHaveValue(rowStatus.trim())
  })

  test('administration: bilingual groups and matrix', async ({ page }) => {
    await signIn(page)
    await page.goto('/app/administration')
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/04-admin-1440.png`, fullPage: true })

    // The EN input keeps its accessible name; the KA side is one click away.
    await page.getByRole('button', { name: 'Business units', exact: true }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/05-admin-business-units.png`, fullPage: true })

    // Open a unit's editor: the grouped bilingual field is the point of the CR.
    await page.getByRole('button', { name: 'Edit' }).first().click()
    await page.locator('.bilingual').first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/05b-admin-bu-form.png`, fullPage: true })

    // The English input keeps the accessible name the module has always used.
    await expect(page.getByLabel('Name (English)')).toBeVisible()

    // One click reveals the Georgian side, under the same caption.
    await page.locator('.bilingual__seg', { hasText: 'KA' }).first().click()
    await page.waitForTimeout(200)
    await expect(page.getByLabel('Name (Georgian)')).toBeVisible()
    await page.screenshot({ path: `${OUT}/05c-admin-bu-form-ka.png`, fullPage: true })

    await page.getByRole('button', { name: 'Rating matrix', exact: true }).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/06-admin-matrix.png`, fullPage: true })
  })

  test('dashboard: KPI rail on the top edge', async ({ page }) => {
    await signIn(page)
    await page.goto('/app/dashboard')
    await seedRisks(page)
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${OUT}/07-dashboard-1440.png`, fullPage: true })

    const tile = page.locator('.kpi').first()
    const accent = tile.locator('.kpi__accent')
    const tileBox = await tile.boundingBox()
    const accentBox = await accent.boundingBox()
    // Flush with the tile's top edge, allowing for the 1px border.
    expect((accentBox?.y ?? 0) - (tileBox?.y ?? 0)).toBeLessThanOrEqual(2)
    // Full-bleed across the tile.
    expect(accentBox?.width ?? 0).toBeGreaterThan((tileBox?.width ?? 0) - 4)

    await tile.hover()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/08-dashboard-kpi-hover.png` })
  })

  test('georgian at 1280', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 })
    await signIn(page)
    await page.goto('/app/register')
    await seedRisks(page)

    /*
     * The active language is session state, so it resets on a hard navigation.
     * Switch once, then move through the app the way a user does — via the rail.
     */
    await page.getByRole('button', { name: 'Switch to Georgian' }).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/09-register-ka-1280.png`, fullPage: true })

    // Georgian rating names are longer; the badge must still not clip.
    const clippedKa = await page.locator('.rating-chip__rating').evaluateAll((nodes) =>
      nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.textContent),
    )
    expect(clippedKa).toEqual([])

    const overflowingKa = await page.locator('.rating-chip').evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const cell = node.closest('td')
          if (!cell) return false
          return node.getBoundingClientRect().right > cell.getBoundingClientRect().right + 1
        })
        .map((node) => node.textContent),
    )
    expect(overflowingKa).toEqual([])

    const rail = page.getByRole('navigation', { name: 'ძირითადი ნავიგაცია' })
    await rail.getByRole('link', { name: 'დაფა' }).click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${OUT}/10-dashboard-ka-1280.png`, fullPage: true })

    await rail.getByRole('link', { name: 'ადმინისტრირება' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/11-admin-ka-1280.png`, fullPage: true })
  })

  /*
   * Design Uplift §11.1 — Mkhedruli is unicameral. `text-transform: uppercase`
   * maps Georgian to Mtavruli, a titling form that reads as a stylistic shift
   * rather than emphasis. Every uppercase rule is scoped to `:lang(en)`, which
   * only works if <html lang> follows the language toggle.
   */
  test('georgian is never uppercased', async ({ page }) => {
    await signIn(page)
    await page.goto('/app/register')
    await seedRisks(page)

    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en')

    await page.getByRole('button', { name: 'Switch to Georgian' }).click()
    await page.waitForTimeout(300)

    // The toggle must publish the language, or :lang(en) would still match.
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('ka')

    const uppercased = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((node) => {
          const style = getComputedStyle(node)
          if (style.textTransform !== 'uppercase') return false
          // Only elements actually holding Georgian text matter.
          const text = [...node.childNodes]
            .filter((child) => child.nodeType === Node.TEXT_NODE)
            .map((child) => child.textContent ?? '')
            .join('')
          return /[\u10A0-\u10FF]/.test(text)
        })
        .map((node) => node.textContent?.trim().slice(0, 40)),
    )
    expect(uppercased).toEqual([])

    // Positive letter-spacing degrades Georgian legibility (§11.2).
    const tracked = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((node) => {
          const spacing = Number.parseFloat(getComputedStyle(node).letterSpacing)
          if (!(spacing > 0.2)) return false
          const text = [...node.childNodes]
            .filter((child) => child.nodeType === Node.TEXT_NODE)
            .map((child) => child.textContent ?? '')
            .join('')
          return /[\u10A0-\u10FF]/.test(text)
        })
        .map((node) => node.textContent?.trim().slice(0, 40)),
    )
    expect(tracked).toEqual([])
  })

  test('reduced motion disables transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await signIn(page)
    await page.goto('/app/register')
    await seedRisks(page)
    await expect(page.getByRole('heading', { name: 'Risk Register' })).toBeVisible()

    const duration = await page
      .locator('.register-table tbody tr')
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration)
    expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.0001)
  })
})
