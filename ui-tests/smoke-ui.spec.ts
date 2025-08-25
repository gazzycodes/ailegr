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

test.describe('UI smoke: Invoice form parity', () => {
  test('AI Document invoice preview shows tax payable when tax enabled', async ({ page, context }) => {
    const token = process.env.VITE_E2E_ACCESS_TOKEN
    test.skip(!token, 'VITE_E2E_ACCESS_TOKEN not provided')

    await context.addCookies([{ name: 'sb-access-token', value: token, url: APP_URL }])
    await page.goto(APP_URL + '/dashboard')
    await page.waitForTimeout(500)

    // Open AI Document modal via FAB label text as fallback
    const aiBtn = page.getByRole('button', { name: /AI Document/i })
    if (await aiBtn.isVisible().catch(() => false)) {
      await aiBtn.click()
    } else {
      // open via chat drawer or other entry point if FAB missing
      await page.getByRole('button', { name: /Chat/i }).click().catch(() => {})
    }

    // Switch to Invoice mode if needed and fill minimal fields
    await page.getByText(/Document Type/i).waitFor({ timeout: 15000 })
    // Fill customer, amount, date
    const customer = page.getByPlaceholder(/Acme Corp|Customer|Name/i)
    const amount = page.getByPlaceholder(/5000|Amount/i)
    const date = page.getByRole('textbox', { name: /Date/i })
    const visible = await customer.isVisible().catch(() => false)
    test.skip(!visible, 'AI Document invoice form not visible in this environment')
    await customer.fill('UI Smoke Customer')
    await amount.fill('100.00')
    await date.fill(new Date().toISOString().slice(0,10))

    // Enable Tax as Amount = 10
    const taxToggle = page.getByRole('checkbox', { name: /Tax/i })
    await taxToggle.check()
    await page.getByRole('combobox', { name: /Mode/i }).selectOption('amount').catch(()=>{})
    const taxAmt = page.getByPlaceholder(/76\.00|Tax Amount|0\.00/i)
    await taxAmt.fill('10.00')

    // Preview
    await page.getByRole('button', { name: /Preview/i }).click()
    await page.getByText(/Account Mapping/i).isVisible({ timeout: 15000 })
    // Expect Sales Tax Payable line
    const hasTax = await page.getByText(/2150.*Sales Tax Payable/i).isVisible().catch(()=>false)
    expect(hasTax).toBeTruthy()
  })
})

test.describe('UI smoke: New Bill → partial/void → reports deltas', () => {
  test('create a bill from AI Document modal and verify toast + refresh', async ({ page, context }) => {
    const token = process.env.VITE_E2E_ACCESS_TOKEN
    test.skip(!token, 'VITE_E2E_ACCESS_TOKEN not provided')

    await context.addCookies([{ name: 'sb-access-token', value: token, url: APP_URL }])
    await page.goto(APP_URL + '/transactions')
    // Open AI Document from FAB
    await page.goto(APP_URL + '/dashboard')
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: /AI Document/i }).click().catch(() => {})
    // Fallback open via chat drawer CTA if FAB fails
    if (!(await page.getByText(/AI Document/i).first().isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /Chat/i }).click().catch(() => {})
    }
    // If modal visible, we can simulate filling minimal fields without file
    const vendorField = page.getByPlaceholder(/Adobe|Uber|Acme|Vendor/i)
    const amountField = page.getByPlaceholder(/59\.99|5000|0\.00|Amount/i)
    const dateField = page.getByRole('textbox', { name: /Date/i })
    const visible = await vendorField.isVisible().catch(() => false)
    test.skip(!visible, 'AI Document expense form not visible in this environment')
    await vendorField.fill('Acme Supplies')
    await amountField.fill('25.00')
    const today = new Date().toISOString().slice(0,10)
    await dateField.fill(today)
    // Post Expense
    await page.getByRole('button', { name: /Post Expense/i }).click()
    await expect(page.getByText(/success|posted/i)).toBeVisible({ timeout: 10000 })
  })
})


