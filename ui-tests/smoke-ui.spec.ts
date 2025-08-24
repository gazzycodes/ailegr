import { test, expect } from '@playwright/test'

const APP_URL = process.env.VITE_APP_URL || 'http://localhost:5173'
const API_URL = process.env.VITE_API_URL || 'http://localhost:4000'

test.describe('UI smoke: dashboard/reports and recurring manager visibility', () => {
  test('loads dashboard after auth cookie present and charts render', async ({ page, context }) => {
    // If set in env, use a pre-baked session token; otherwise skip
    const token = process.env.VITE_E2E_ACCESS_TOKEN
    test.skip(!token, 'VITE_E2E_ACCESS_TOKEN not provided')

    await context.addCookies([{ name: 'sb-access-token', value: token, url: APP_URL }])
    await page.goto(APP_URL + '/dashboard')
    await expect(page.getByText(/Dashboard/i)).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(1000)

    // Basic checks: dashboard calls and charts present
    await expect(page.locator('svg')).toBeVisible()
  })

  test('open Reports view and ensure P&L & Balance Sheet sections appear', async ({ page, context }) => {
    const token = process.env.VITE_E2E_ACCESS_TOKEN
    test.skip(!token, 'VITE_E2E_ACCESS_TOKEN not provided')

    await context.addCookies([{ name: 'sb-access-token', value: token, url: APP_URL }])
    await page.goto(APP_URL + '/reports')
    await expect(page.getByText(/Reports/i)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Profit/i)).toBeVisible()
    await expect(page.getByText(/Balance/i)).toBeVisible()
  })

  test('open Settings -> Recurring manager appears for OWNER/ADMIN', async ({ page, context }) => {
    const token = process.env.VITE_E2E_ACCESS_TOKEN
    test.skip(!token, 'VITE_E2E_ACCESS_TOKEN not provided')

    await context.addCookies([{ name: 'sb-access-token', value: token, url: APP_URL }])
    await page.goto(APP_URL + '/settings')
    await expect(page.getByText(/Settings/i)).toBeVisible({ timeout: 15000 })
    // Heuristic: look for Recurring section heading or button
    const recurringVisible = await page.getByText(/Recurring/i).isVisible().catch(() => false)
    expect(recurringVisible).toBeTruthy()
  })
})


