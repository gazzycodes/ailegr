// Recurring-only smoke tests: dry-run, commit, pause/resume, idempotency, COA deltas
// Run with: npm run smoke:recurring (assumes server is running on localhost:4000)

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const BASE = process.env.VITE_API_URL || 'http://localhost:4000'
const JOB_KEY = process.env.AILEGR_JOB_KEY || 'dev-job-key'
const TENANT_ID = process.env.AILEGR_SMOKE_TENANT || 'dev'
const TEST_PREFIX = 'SMOKE-REC-'

const headers = {
  'Content-Type': 'application/json',
  'X-Job-Key': JOB_KEY,
  'X-Tenant-Id': TENANT_ID,
}

function todayYMD() {
  return new Date().toISOString().slice(0, 10)
}

async function http(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data?.error || data?.message || text}`)
  return { status: res.status, data }
}

async function coaMap() {
  const res = await http('GET', '/api/reports/chart-of-accounts')
  const arr = Array.isArray(res.data?.accounts) ? res.data.accounts : []
  const map = new Map()
  for (const a of arr) map.set(String(a.code), Number(a.balance || 0))
  return map
}

async function bootstrapTenantAndSwitch() {
  const prefer = process.env.AILEGR_SMOKE_TENANT || ''
  const cronOn = String(process.env.AILEGR_RECURRING_CRON || '').toLowerCase() === 'true'
  // Create an isolated tenant when cron is on or when non-dev requested
  if (cronOn || (prefer && prefer !== 'dev')) {
    const name = `Smoke ${Date.now()}-${Math.random().toString(36).slice(2,6)}`
    const res = await http('POST', '/api/setup/bootstrap-tenant', { tenantName: name, role: 'OWNER', userId: 'smoke-runner' })
    const newId = res?.data?.tenantId
    if (newId) {
      headers['X-Tenant-Id'] = newId
      return newId
    }
  }
  return headers['X-Tenant-Id']
}

function delta(mapAfter, mapBefore, code) {
  const a = Number(mapAfter.get(String(code)) || 0)
  const b = Number(mapBefore.get(String(code)) || 0)
  return a - b
}

async function createExpenseRule(tag) {
  const start = todayYMD()
  const body = {
    type: 'EXPENSE',
    cadence: 'MONTHLY',
    startDate: start,
    dayOfMonth: new Date().getDate(),
    nextRunAt: `${start}T00:00:00.000Z`,
    payload: {
      vendorName: `${TEST_PREFIX}Vendor-${tag}`,
      amount: '50.00',
      categoryKey: 'OFFICE_SUPPLIES',
      paymentStatus: 'paid',
      description: 'Recurring expense smoke',
      __testTag: tag,
    },
  }
  const res = await http('POST', '/api/recurring', body)
  return res?.data?.rule?.id
}

async function createInvoiceRule(tag) {
  const start = todayYMD()
  const body = {
    type: 'INVOICE',
    cadence: 'MONTHLY',
    startDate: start,
    dayOfMonth: new Date().getDate(),
    nextRunAt: `${start}T00:00:00.000Z`,
    payload: {
      customerName: `${TEST_PREFIX}Customer-${tag}`,
      amount: '200.00',
      amountPaid: '100.00',
      balanceDue: '100.00',
      categoryKey: 'CONSULTING',
      paymentStatus: 'partial',
      description: 'Recurring invoice smoke',
      __testTag: tag,
    },
  }
  const res = await http('POST', '/api/recurring', body)
  return res?.data?.rule?.id
}

const argv = process.argv.slice(2)
const keepData = String(process.env.KEEP_SMOKE_DATA || '').toLowerCase() === 'true' || argv.includes('--keep') || argv.includes('--no-cleanup')

async function run() {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`

  console.log('🔧 Health check...')
  await http('GET', '/api/health')

  console.log('📚 Ensure COA...')
  await http('POST', '/api/setup/ensure-core-accounts', {})

  // Isolate tenant when needed (cron on)
  await bootstrapTenantAndSwitch()

  console.log('🛠️ Create recurring rules (expense + invoice)...')
  const expenseRuleId = await createExpenseRule(tag)
  const invoiceRuleId = await createInvoiceRule(tag)
  if (!expenseRuleId || !invoiceRuleId) throw new Error('Failed to create recurring rules')

  // Baseline snapshot
  const coa0 = await coaMap()

  console.log('🧪 Dry-run both rules (no DB writes)...')
  const dryExp = await http('POST', '/api/recurring/run', { dryRun: true, ruleId: expenseRuleId })
  const dryInv = await http('POST', '/api/recurring/run', { dryRun: true, ruleId: invoiceRuleId })
  const de = Array.isArray(dryExp.data?.results) ? dryExp.data.results.find(r => r.id === expenseRuleId) : null
  const di = Array.isArray(dryInv.data?.results) ? dryInv.data.results.find(r => r.id === invoiceRuleId) : null
  if (!(de?.simulate?.entries?.length)) throw new Error('Dry-run expense did not produce entries')
  if (!(di?.simulate?.entries?.length)) throw new Error('Dry-run invoice did not produce entries')

  console.log('🏁 Commit run for both rules...')
  const c1 = await http('POST', '/api/recurring/run', { ruleId: expenseRuleId })
  const c2 = await http('POST', '/api/recurring/run', { ruleId: invoiceRuleId })
  const ce = Array.isArray(c1.data?.results) ? c1.data.results.find(r => r.id === expenseRuleId) : null
  const ci = Array.isArray(c2.data?.results) ? c2.data.results.find(r => r.id === invoiceRuleId) : null
  if (!ce?.posted) throw new Error('Expense commit did not return posted id')
  if (!ci?.posted) throw new Error('Invoice commit did not return posted id')

  console.log('📈 Validate COA deltas after first commit...')
  const coa1 = await coaMap()
  const d6020a = delta(coa1, coa0, '6020')
  const d1010a = delta(coa1, coa0, '1010')
  const d4020a = delta(coa1, coa0, '4020')
  const d1200a = delta(coa1, coa0, '1200')
  const approxEq = (a, b, tol = 0.2) => Math.abs(Number(a) - Number(b)) <= tol
  if (!approxEq(d6020a, 50.00)) throw new Error(`COA 6020 delta ${d6020a.toFixed(2)} != 50.00`)
  if (!approxEq(d1010a, 50.00, 0.5)) throw new Error(`COA 1010 delta ${d1010a.toFixed(2)} != 50.00 (cash net of -50 + 100)`) 
  if (!approxEq(d4020a, 200.00, 0.5)) throw new Error(`COA 4020 delta ${d4020a.toFixed(2)} != 200.00`)
  if (!approxEq(d1200a, 100.00, 0.5)) throw new Error(`COA 1200 delta ${d1200a.toFixed(2)} != 100.00`)

  console.log('⏸️ Pause invoice rule, advance expense nextRunAt to yesterday (avoid idempotency), run due rules (no ruleId)...')
  await http('POST', `/api/recurring/${encodeURIComponent(invoiceRuleId)}/pause`, {})
  const yesterdayISO = new Date(Date.now() - 24*60*60*1000).toISOString()
  // Snapshot base counts to make the check robust against background scheduler
  const baseExpCnt = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${expenseRuleId}-` } } })
  const baseInvCnt = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${invoiceRuleId}-` } } })
  // Backdate both nextRunAt and startDate to guarantee eligibility
  await http('PUT', `/api/recurring/${encodeURIComponent(expenseRuleId)}`, { startDate: yesterdayISO, nextRunAt: yesterdayISO })
  // Attempt up to 3 runs to account for scheduler timing (also try direct rule run)
  let expPosted = false
  for (let i = 0; i < 3; i++) {
    const runAny = await http('POST', '/api/recurring/run', {})
    const rAny = Array.isArray(runAny.data?.results) ? runAny.data.results.find(r => r.id === expenseRuleId) : null
    if (rAny?.posted) { expPosted = true; break }
    const expCntBefore = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${expenseRuleId}-` } } })
    const runOne = await http('POST', '/api/recurring/run', { ruleId: expenseRuleId })
    const rOne = Array.isArray(runOne.data?.results) ? runOne.data.results.find(r => r.id === expenseRuleId) : null
    if (rOne?.posted) { expPosted = true; break }
    const expCnt = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${expenseRuleId}-` } } })
    if (expCnt > expCntBefore) { expPosted = true; break }
  }
  // Inspect state if did not run
  const rulesList = await http('GET', '/api/recurring')
  const expRule = (Array.isArray(rulesList.data?.rules) ? rulesList.data.rules : []).find(r => r.id === expenseRuleId)
  if (expRule) {
    console.log('DEBUG exp rule after backdate:', { isActive: expRule.isActive, nextRunAt: expRule.nextRunAt, lastRunAt: expRule.lastRunAt })
  } else {
    console.log('DEBUG exp rule not found in active list; possibly filtered by tenant or inactive')
  }
  const dryAll = await http('POST', '/api/recurring/run', { dryRun: true })
  console.log('DEBUG dryRun eligible results ids:', (Array.isArray(dryAll.data?.results) ? dryAll.data.results.map(r => r.id) : []))
  const expCntAfter = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${expenseRuleId}-` } } })
  const invCntAfter = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${invoiceRuleId}-` } } })
  if (!expPosted && !(expCntAfter > baseExpCnt)) throw new Error('Expected expense rule to run when due')
  if (invCntAfter !== baseInvCnt) throw new Error('Invoice rule should be paused and not run')

  console.log('▶️ Resume invoice, set nextRunAt to yesterday (avoid idempotency), run due rules again...')
  await http('POST', `/api/recurring/${encodeURIComponent(invoiceRuleId)}/resume`, {})
  await http('PUT', `/api/recurring/${encodeURIComponent(invoiceRuleId)}`, { nextRunAt: yesterdayISO })
  const baseInvCnt2 = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${invoiceRuleId}-` } } })
  let invPosted = false
  for (let i = 0; i < 3; i++) {
    const runAny2 = await http('POST', '/api/recurring/run', {})
    const rAny2 = Array.isArray(runAny2.data?.results) ? runAny2.data.results.find(r => r.id === invoiceRuleId) : null
    if (rAny2?.posted) { invPosted = true; break }
    const runOne2 = await http('POST', '/api/recurring/run', { ruleId: invoiceRuleId })
    const rOne2 = Array.isArray(runOne2.data?.results) ? runOne2.data.results.find(r => r.id === invoiceRuleId) : null
    if (rOne2?.posted) { invPosted = true; break }
  }
  const invCntAfter2 = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${invoiceRuleId}-` } } })
  if (!invPosted && !(invCntAfter2 > baseInvCnt2)) throw new Error('Expected invoice rule to run after resume')

  console.log('📈 Validate COA deltas after second commit (should approximately double)...')
  const coa2 = await coaMap()
  const d6020b = delta(coa2, coa0, '6020')
  const d1010b = delta(coa2, coa0, '1010')
  const d4020b = delta(coa2, coa0, '4020')
  const d1200b = delta(coa2, coa0, '1200')
  const cronEnabled = String(process.env.AILEGR_RECURRING_CRON || '').toLowerCase() === 'true'
  if (cronEnabled) {
    // With background cron, totals may exceed exactly-double. Enforce at-least expectations.
    if (d6020b < 100.00 - 0.5) throw new Error(`COA 6020 total too low under cron (${d6020b.toFixed(2)} < 100)`) 
    if (d1010b < 100.00 - 1.0) throw new Error(`COA 1010 total too low under cron (${d1010b.toFixed(2)} < 100)`) 
    if (d4020b < 400.00 - 1.0) throw new Error(`COA 4020 total too low under cron (${d4020b.toFixed(2)} < 400)`) 
    if (d1200b < 200.00 - 1.0) throw new Error(`COA 1200 total too low under cron (${d1200b.toFixed(2)} < 200)`) 
  } else {
    if (!approxEq(d6020b, 100.00, 0.5)) throw new Error(`COA 6020 delta total ${d6020b.toFixed(2)} != 100.00`)
    if (!approxEq(d1010b, 100.00, 1.0)) throw new Error(`COA 1010 delta total ${d1010b.toFixed(2)} != 100.00`)
    if (!approxEq(d4020b, 400.00, 1.0)) throw new Error(`COA 4020 delta total ${d4020b.toFixed(2)} != 400.00`)
    if (!approxEq(d1200b, 200.00, 1.0)) throw new Error(`COA 1200 delta total ${d1200b.toFixed(2)} != 200.00`)
  }

  console.log('🔮 Preview upcoming occurrences...')
  await http('GET', `/api/recurring/${encodeURIComponent(expenseRuleId)}/occurrences?count=3`)
  await http('GET', `/api/recurring/${encodeURIComponent(invoiceRuleId)}/occurrences?count=3`)

  console.log('🧮 Verifying balanced journal for transactions produced by these rules...')
  const txs = await prisma.transaction.findMany({
    where: { OR: [
      { reference: { startsWith: `REC-${expenseRuleId}-` } },
      { reference: { startsWith: `REC-${invoiceRuleId}-` } },
    ]},
    select: { id: true }
  })
  const ids = txs.map(t => t.id)
  const entries = ids.length ? await prisma.transactionEntry.findMany({
    where: { transactionId: { in: ids } },
    select: { amount: true, debitAccountId: true, creditAccountId: true }
  }) : []
  const debit = entries.filter(e => e.debitAccountId).reduce((s,e)=> s + Number(e.amount), 0)
  const credit = entries.filter(e => e.creditAccountId).reduce((s,e)=> s + Number(e.amount), 0)
  const diff = Math.abs(debit - credit)
  if (diff > 0.01) throw new Error(`Unbalanced journal: debits=${debit.toFixed(2)} credits=${credit.toFixed(2)} diff=${diff.toFixed(2)}`)
  console.log(`  ✅ Balanced: debit=${debit.toFixed(2)} credit=${credit.toFixed(2)}`)

  // Strict balance sheet check if flag provided
  if (process.argv.includes('--strict-balance')) {
    const bs = await http('GET', '/api/reports/balance-sheet')
    const t = bs.data?.totals || {}
    const assets = Number(t.totalAssets || 0)
    const liabEq = Number(t.liabilitiesAndEquity || (Number(t.totalLiabilities||0) + Number(t.totalEquity||0)))
    const diff = Math.abs(assets - liabEq)
    if (diff > 0.01) throw new Error(`Strict BS: Assets != Liabilities+Equity (diff=${diff.toFixed(2)})`)
    if (!t.equationOK) throw new Error('Strict BS: equationOK flag false')
  }

  // ----- Additional timeframe scenarios -----
  function lastDayOfPrevMonth() {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); d.setDate(0); // last day of previous month
    const yyyy = d.getFullYear(); const mm = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  function isoDaysAgo(n) { return new Date(Date.now() - n*24*60*60*1000).toISOString() }

  console.log('🧪 EOM monthly expense, backdated across multiple months (robust loop until 3 posts)...')
  const eomStart = lastDayOfPrevMonth()
  const eomRes = await http('POST', '/api/recurring', {
    type: 'EXPENSE', cadence: 'MONTHLY', startDate: eomStart, nextRunAt: `${eomStart}T00:00:00.000Z`,
    payload: { vendorName: `${TEST_PREFIX}EOM`, amount: '30.00', categoryKey: 'OFFICE_SUPPLIES', paymentStatus: 'paid', __options: { endOfMonth: true } }
  })
  const eomId = eomRes?.data?.rule?.id
  if (!eomId) throw new Error('Failed to create EOM rule')
  // Backdate far enough and loop runs until 3 postings occur (handles month-end edge cases)
  await http('PUT', `/api/recurring/${encodeURIComponent(eomId)}`, { nextRunAt: isoDaysAgo(120) })
  const baseCount = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${eomId}-` } } })
  const coaE0 = await coaMap()
  const targetPosts = 3
  for (let i = 0; i < 12; i++) {
    await http('POST', '/api/recurring/run', { ruleId: eomId })
    const cnt = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${eomId}-` } } })
    if (cnt - baseCount >= targetPosts) break
  }
  const coaE3 = await coaMap()
  const d6020e = delta(coaE3, coaE0, '6020')
  if (Math.abs(d6020e - (30.00 * targetPosts)) > 2.0) throw new Error(`EOM: 6020 delta ${d6020e.toFixed(2)} != ~${(30*targetPosts).toFixed(2)} after ${targetPosts} runs`)

  console.log('🧪 Nth-weekday monthly invoice (3rd Friday), single commit...')
  const nthRes = await http('POST', '/api/recurring', {
    type: 'INVOICE', cadence: 'MONTHLY', startDate: todayYMD(), nextRunAt: isoDaysAgo(1),
    payload: { customerName: `${TEST_PREFIX}NthFri`, amount: '300.00', amountPaid: '0.00', balanceDue: '300.00', categoryKey: 'CONSULTING', paymentStatus: 'invoice', __options: { nthWeek: 3, nthWeekday: 5 } }
  })
  const nthId = nthRes?.data?.rule?.id
  if (!nthId) throw new Error('Failed to create nth-weekday rule')
  const coaN0 = await coaMap()
  await http('POST', '/api/recurring/run', { ruleId: nthId })
  const coaN1 = await coaMap()
  const drN4020 = delta(coaN1, coaN0, '4020')
  const drN1200 = delta(coaN1, coaN0, '1200')
  if (Math.abs(drN4020 - 300.00) > 0.5) throw new Error('Nth-weekday: revenue delta != 300')
  if (Math.abs(drN1200 - 300.00) > 0.5) throw new Error('Nth-weekday: AR delta != 300')

  // ----- Additional cadence coverage: DAILY, WEEKLY, ANNUAL -----
  function daysBetween(isoA, ymdB) {
    const a = new Date(isoA)
    const b = new Date(`${ymdB}T00:00:00.000Z`)
    return Math.round((a.getTime() - b.getTime()) / (24*60*60*1000))
  }

  console.log('🧪 DAILY cadence: commit and assert nextRunAt advances by +1 day...')
  const dailyRes = await http('POST', '/api/recurring', {
    type: 'EXPENSE', cadence: 'DAILY', startDate: todayYMD(), nextRunAt: isoDaysAgo(1),
    payload: { vendorName: `${TEST_PREFIX}Daily`, amount: '5.00', categoryKey: 'OFFICE_SUPPLIES', paymentStatus: 'paid' }
  })
  const dailyId = dailyRes?.data?.rule?.id
  const dailyBefore = await prisma.recurringRule.findUnique({ where: { id: dailyId }, select: { nextRunAt: true } })
  const dailyRunDateYmd = new Date(dailyBefore.nextRunAt).toISOString().slice(0,10)
  const baseDailyCnt = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${dailyId}-` } } })
  for (let i = 0; i < 6; i++) {
    await http('POST', '/api/recurring/run', {})
    const c = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${dailyId}-` } } })
    if (c > baseDailyCnt) break
    await new Promise(r => setTimeout(r, 300))
  }
  const dailyAfter = await prisma.recurringRule.findUnique({ where: { id: dailyId }, select: { nextRunAt: true } })
  const dDelta = daysBetween(new Date(dailyAfter.nextRunAt).toISOString(), dailyRunDateYmd)
  if (dDelta !== 1) throw new Error(`DAILY: nextRunAt not +1 day (delta=${dDelta})`)

  console.log('🧪 WEEKLY cadence: commit and assert nextRunAt advances by 1..7 days to target weekday...')
  const targetWeekday = new Date().getDay()
  const weeklyRes = await http('POST', '/api/recurring', {
    type: 'INVOICE', cadence: 'WEEKLY', startDate: todayYMD(), nextRunAt: isoDaysAgo(1), weekday: targetWeekday,
    payload: { customerName: `${TEST_PREFIX}Weekly`, amount: '40.00', amountPaid: '0.00', balanceDue: '40.00', categoryKey: 'CONSULTING', paymentStatus: 'invoice' }
  })
  const weeklyId = weeklyRes?.data?.rule?.id
  const weeklyBefore = await prisma.recurringRule.findUnique({ where: { id: weeklyId }, select: { nextRunAt: true } })
  const weeklyRunDateYmd = new Date(weeklyBefore.nextRunAt).toISOString().slice(0,10)
  const baseWeeklyCnt = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${weeklyId}-` } } })
  for (let i = 0; i < 6; i++) {
    await http('POST', '/api/recurring/run', {})
    const c = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${weeklyId}-` } } })
    if (c > baseWeeklyCnt) break
    await new Promise(r => setTimeout(r, 300))
  }
  const weeklyAfter = await prisma.recurringRule.findUnique({ where: { id: weeklyId }, select: { nextRunAt: true } })
  const wDelta = daysBetween(new Date(weeklyAfter.nextRunAt).toISOString(), weeklyRunDateYmd)
  if (!(wDelta >= 1 && wDelta <= 7)) throw new Error(`WEEKLY: nextRunAt delta should be 1..7 days (got ${wDelta})`)

  console.log('🧪 ANNUAL cadence: commit and assert nextRunAt advances by ~365/366 days (+1 year)...')
  const annualRes = await http('POST', '/api/recurring', {
    type: 'EXPENSE', cadence: 'ANNUAL', startDate: todayYMD(), nextRunAt: isoDaysAgo(1),
    payload: { vendorName: `${TEST_PREFIX}Annual`, amount: '15.00', categoryKey: 'OFFICE_SUPPLIES', paymentStatus: 'paid' }
  })
  const annualId = annualRes?.data?.rule?.id
  const annualBefore = await prisma.recurringRule.findUnique({ where: { id: annualId }, select: { nextRunAt: true } })
  const annualRunDateYmd = new Date(annualBefore.nextRunAt).toISOString().slice(0,10)
  const baseAnnualCnt = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${annualId}-` } } })
  for (let i = 0; i < 6; i++) {
    await http('POST', '/api/recurring/run', {})
    const c = await prisma.transaction.count({ where: { reference: { startsWith: `REC-${annualId}-` } } })
    if (c > baseAnnualCnt) break
    await new Promise(r => setTimeout(r, 300))
  }
  const annualAfter = await prisma.recurringRule.findUnique({ where: { id: annualId }, select: { nextRunAt: true } })
  const aDelta = daysBetween(new Date(annualAfter.nextRunAt).toISOString(), annualRunDateYmd)
  if (!(aDelta >= 365 && aDelta <= 366)) throw new Error(`ANNUAL: nextRunAt delta should be ~365/366 days (got ${aDelta})`)

  console.log('🧪 pauseUntil skip, then unpause to run...')
  const pauseRes = await http('POST', '/api/recurring', {
    type: 'EXPENSE', cadence: 'MONTHLY', startDate: todayYMD(), nextRunAt: todayYMD() + 'T00:00:00.000Z',
    payload: { vendorName: `${TEST_PREFIX}Pause`, amount: '10.00', categoryKey: 'OFFICE_SUPPLIES', paymentStatus: 'paid', __options: { pauseUntil: new Date(Date.now() + 24*60*60*1000).toISOString().slice(0,10) } }
  })
  const pauseId = pauseRes?.data?.rule?.id
  const runPause = await http('POST', '/api/recurring/run', {})
  const pauseEntry = (runPause.data?.results || []).find(r => r.id === pauseId)
  if (!(pauseEntry && pauseEntry.skipped)) throw new Error('pauseUntil: expected skipped entry')
  // Unpause by setting pauseUntil to yesterday and backdate nextRunAt
  await http('PUT', `/api/recurring/${encodeURIComponent(pauseId)}`, { payload: { vendorName: `${TEST_PREFIX}Pause`, amount: '10.00', categoryKey: 'OFFICE_SUPPLIES', paymentStatus: 'paid', __options: { pauseUntil: new Date(Date.now() - 24*60*60*1000).toISOString().slice(0,10) } } })
  await http('PUT', `/api/recurring/${encodeURIComponent(pauseId)}`, { nextRunAt: isoDaysAgo(1) })
  const runPause2 = await http('POST', '/api/recurring/run', {})
  const pauseEntry2 = (runPause2.data?.results || []).find(r => r.id === pauseId)
  if (!(pauseEntry2 && (pauseEntry2.posted || (!pauseEntry2.dryRun && !pauseEntry2.error)))) throw new Error('pauseUntil: expected rule to run after unpause')

  console.log('🧪 endDate enforcement (past end -> deactivate) ...')
  const endRes = await http('POST', '/api/recurring', {
    type: 'EXPENSE', cadence: 'MONTHLY', startDate: todayYMD(), endDate: new Date(Date.now() - 24*60*60*1000).toISOString(), nextRunAt: new Date().toISOString(),
    payload: { vendorName: `${TEST_PREFIX}End`, amount: '12.34', categoryKey: 'OFFICE_SUPPLIES', paymentStatus: 'paid' }
  })
  const endId = endRes?.data?.rule?.id
  const runEnd = await http('POST', '/api/recurring/run', {})
  const endEntry = (runEnd.data?.results || []).find(r => r.id === endId)
  if (!(endEntry && endEntry.skipped && /end/i.test(String(endEntry.reason || '')))) throw new Error('endDate: expected Past endDate skip')

  console.log('🧪 Overpaid invoice recurring -> customer credits...')
  const ovpRes = await http('POST', '/api/recurring', {
    type: 'INVOICE', cadence: 'MONTHLY', startDate: todayYMD(), nextRunAt: isoDaysAgo(1),
    payload: { customerName: `${TEST_PREFIX}Overpay`, amount: '100.00', amountPaid: '150.00', balanceDue: '-50.00', categoryKey: 'CONSULTING', paymentStatus: 'overpaid' }
  })
  const ovpId = ovpRes?.data?.rule?.id
  const coaO0 = await coaMap()
  await http('POST', '/api/recurring/run', { ruleId: ovpId })
  const coaO1 = await coaMap()
  const d2050 = delta(coaO1, coaO0, '2050')
  if (Math.abs(d2050 - 50.00) > 0.5) throw new Error('Overpaid recurring: customer credits delta != 50')

  console.log('🧪 Auto-resume via resumeOn for inactive rule...')
  const resOn = await http('POST', '/api/recurring', {
    type: 'EXPENSE', cadence: 'MONTHLY', startDate: todayYMD(), nextRunAt: isoDaysAgo(2), isActive: false,
    payload: { vendorName: `${TEST_PREFIX}ResumeOn`, amount: '22.00', categoryKey: 'OFFICE_SUPPLIES', paymentStatus: 'paid', __options: { resumeOn: new Date(Date.now() - 24*60*60*1000).toISOString().slice(0,10) } }
  })
  const resOnId = resOn?.data?.rule?.id
  const runResOn = await http('POST', '/api/recurring/run', {})
  const resOnEntry = (runResOn.data?.results || []).find(r => r.id === resOnId)
  if (!(resOnEntry && (resOnEntry.posted || (!resOnEntry.dryRun && !resOnEntry.error)))) throw new Error('resumeOn: expected auto-resumed rule to run')

  if (!keepData) {
    console.log('🧹 Cleaning up transactions and rules...')
    const delTx = await prisma.transaction.deleteMany({ where: { OR: [
      { reference: { startsWith: `REC-${expenseRuleId}-` } },
      { reference: { startsWith: `REC-${invoiceRuleId}-` } },
      { reference: { startsWith: `REC-${eomId}-` } },
      { reference: { startsWith: `REC-${nthId}-` } },
      { reference: { startsWith: `REC-${pauseId}-` } },
      { reference: { startsWith: `REC-${ovpId}-` } },
      { reference: { startsWith: `REC-${resOnId}-` } },
      { reference: { startsWith: `REC-${dailyId}-` } },
      { reference: { startsWith: `REC-${weeklyId}-` } },
      { reference: { startsWith: `REC-${annualId}-` } },
    ]}})
    await prisma.recurringRule.deleteMany({ where: { id: { in: [expenseRuleId, invoiceRuleId, eomId, nthId, pauseId, endId, ovpId, resOnId, dailyId, weeklyId, annualId].filter(Boolean) } } })
    console.log(`  🗑️ Deleted ${delTx.count} transactions; removed rules.`)
  } else {
    console.log('🔒 KEEP_SMOKE_DATA=true or --keep: preserving smoke data (no cleanup).')
  }

  console.log('🎉 Recurring smoke completed successfully')
}

run()
  .catch((e) => { console.error('❌ Recurring smoke failed:', e.message || e); process.exitCode = 1 })
  .finally(async () => { try { await prisma.$disconnect() } catch {} })


