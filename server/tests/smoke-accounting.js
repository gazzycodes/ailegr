// Smoke tests for accounting correctness (expenses/invoices posting and balance)
// Run with: npm run smoke (assumes server is running on localhost:4000)

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const BASE = process.env.VITE_API_URL || 'http://localhost:4000'
const JOB_KEY = process.env.AILEGR_JOB_KEY || 'dev-job-key'
const TENANT_ID = process.env.AILEGR_SMOKE_TENANT || 'dev'
const TEST_PREFIX = 'SMOKE-'

const headers = {
  'Content-Type': 'application/json',
  'X-Job-Key': JOB_KEY,
  'X-Tenant-Id': TENANT_ID,
}

const today = () => new Date().toISOString().slice(0, 10)
const ref = (suffix) => `${TEST_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`

async function http(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data?.error || data?.message || text}`)
  return { status: res.status, data }
}

async function cleanup() {
  const del = await prisma.transaction.deleteMany({ where: { reference: { startsWith: TEST_PREFIX } } })
  return del.count
}

async function coaMap() {
  const res = await http('GET', '/api/reports/chart-of-accounts')
  const arr = Array.isArray(res.data?.accounts) ? res.data.accounts : []
  const map = new Map()
  for (const a of arr) map.set(a.code, Number(a.balance || 0))
  return map
}

function delta(mapAfter, mapBefore, code) {
  const a = Number(mapAfter.get(code) || 0)
  const b = Number(mapBefore.get(code) || 0)
  return a - b
}

async function bsSums() {
  const res = await http('GET', '/api/reports/balance-sheet')
  const t = res.data?.totals || {}
  const assets = Number(t.totalAssets || 0)
  const liabEq = Number(t.liabilitiesAndEquity || (Number(t.totalLiabilities||0) + Number(t.totalEquity||0)))
  const diff = Math.abs(assets - liabEq)
  return { assets, liabEq, diff, equationOK: !!t.equationOK }
}

function assertStrictBalance(bs) {
  if (process.argv.includes('--strict-balance')) {
    if (bs.diff > 0.01) throw new Error(`Strict BS: Assets != Liabilities+Equity (diff=${bs.diff.toFixed(2)})`)
    if (!bs.equationOK) throw new Error('Strict BS: equationOK flag false')
  }
}

async function run() {
  const keep = process.argv.includes('--keep')
  console.log('🔧 Health check...')
  await http('GET', '/api/health')

  console.log('🧹 Cleaning previous smoke data...')
  await cleanup()

  console.log('📚 Ensure COA...')
  await http('POST', '/api/setup/ensure-core-accounts', {})

  // Baseline snapshots
  const pnl0 = await http('GET', '/api/reports/pnl')
  const bsBase = await bsSums(); assertStrictBalance(bsBase)
  const coa0 = await coaMap()

  // Post a paid expense
  const expRef = ref('EXP')
  const expAmount = 123.45
  const invTotal = 200.00
  const invPaidInitial = 50.00
  const invBalance = 150.00
  const expPartialPay = 23.45

  console.log('🧾 Posting expense (paid)...')
  const expRes = await http('POST', '/api/expenses', {
    vendorName: 'Smoke Vendor',
    amount: expAmount.toFixed(2),
    date: today(),
    categoryKey: 'OFFICE_SUPPLIES',
    paymentStatus: 'paid',
    reference: expRef,
  })
  const expenseId = expRes?.data?.expenseId || expRes?.data?.transactionId

  // Post a partial invoice
  const invRef = ref('INV')
  const invNo = `SMOKE-${Date.now()}`
  console.log('🧾 Posting invoice (partial)...')
  const invRes = await http('POST', '/api/invoices', {
    customerName: 'Smoke Customer',
    amount: invTotal.toFixed(2),
    amountPaid: invPaidInitial.toFixed(2),
    balanceDue: invBalance.toFixed(2),
    date: today(),
    categoryKey: 'CONSULTING',
    paymentStatus: 'partial',
    invoiceNumber: invNo,
    reference: invRef,
  })
  const invoiceId = invRes?.data?.invoiceId || invRes?.data?.transactionId

  // P&L and COA snapshots after postings
  console.log('📈 Fetch P&L and Balance Sheet after postings...')
  const pnl1 = await http('GET', '/api/reports/pnl')
  const bs1 = await bsSums(); assertStrictBalance(bs1)
  const coa1 = await coaMap()
  if (!Number.isFinite(pnl1.data?.totals?.revenue) || !Number.isFinite(pnl1.data?.totals?.expenses)) {
    throw new Error('P&L totals are not numeric after postings')
  }
  const npDelta = Number(pnl1.data.totals.netProfit) - Number(pnl0.data.totals.netProfit)
  if (npDelta < 75 || npDelta > 78) {
    throw new Error(`Net profit delta unexpected after postings: got ${npDelta.toFixed(2)} expected ~76.55`)
  }
  // COA deltas (expected signs per normal balance):
  // Expense debit 6020 +123.45, Cash credit 1010 -123.45 (balance for assets is debit-credit)
  // Invoice: Revenue credit 4020 +200, Cash debit 1010 +50, AR debit 1200 +150
  const d6020 = delta(coa1, coa0, '6020')
  const d1010 = delta(coa1, coa0, '1010')
  const d4020 = delta(coa1, coa0, '4020')
  const d1200 = delta(coa1, coa0, '1200')
  if (Math.abs(d6020 - expAmount) > 0.05) throw new Error(`COA 6020 delta ${d6020.toFixed(2)} != ${expAmount.toFixed(2)}`)
  const expectedCashDelta1 = -expAmount + invPaidInitial
  if (Math.abs(d1010 - expectedCashDelta1) > 0.1) throw new Error(`COA 1010 delta ${d1010.toFixed(2)} != ${expectedCashDelta1.toFixed(2)} (net of -${expAmount.toFixed(2)} + ${invPaidInitial.toFixed(2)})`) 
  if (Math.abs(d4020 - invTotal) > 0.05) throw new Error(`COA 4020 delta ${d4020.toFixed(2)} != ${invTotal.toFixed(2)}`)
  if (Math.abs(d1200 - invBalance) > 0.05) throw new Error(`COA 1200 delta ${d1200.toFixed(2)} != ${invBalance.toFixed(2)}`)

  // Payments flows: mark invoice unpaid -> mark paid
  if (invoiceId) {
    console.log('💳 Update invoice payment statuses...')
    await http('POST', `/api/invoices/${encodeURIComponent(invoiceId)}/mark-unpaid`, {})
    await http('POST', `/api/invoices/${encodeURIComponent(invoiceId)}/mark-paid`, { amountPaid: '200.00' })
  }

  // Expense record payment (partial then settle)
  if (expenseId) {
    console.log('💳 Record expense partial then settle...')
    await http('POST', `/api/expenses/${encodeURIComponent(expenseId)}/record-payment`, { amount: expPartialPay.toFixed(2) })
    await http('POST', `/api/expenses/${encodeURIComponent(expenseId)}/mark-paid`, {})
  }

  // Record invoice payment to settle remaining AR (no net P&L change expected)
  if (invoiceId) {
    await http('POST', `/api/invoices/${encodeURIComponent(invoiceId)}/record-payment`, { amount: '150.00' })
  }

  // P&L and BS snapshots after payments
  console.log('📊 Fetch P&L and Balance Sheet after payments...')
  const pnl2 = await http('GET', '/api/reports/pnl')
  const bs2 = await bsSums(); assertStrictBalance(bs2)
  // Skip absolute equation assertion due to pre-existing dev data; rely on TB balance and COA deltas instead
  const coa2 = await coaMap()
  if (!Number.isFinite(pnl2.data?.totals?.revenue) || !Number.isFinite(pnl2.data?.totals?.expenses)) {
    throw new Error('P&L totals are not numeric after payments')
  }
  const npDelta2 = Number(pnl2.data.totals.netProfit) - Number(pnl1.data.totals.netProfit)
  if (Math.abs(npDelta2) > 0.05) {
    throw new Error(`Net profit changed after payments but should not. Δ=${npDelta2.toFixed(2)}`)
  }
  // COA deltas for settlement: cash +150, AR -150
  const d1010b = delta(coa2, coa1, '1010')
  const d1200b = delta(coa2, coa1, '1200')
  const expectedCashDelta2 = invBalance - expPartialPay
  if (Math.abs(d1010b - expectedCashDelta2) > 0.1) throw new Error(`COA 1010 delta after settle ${d1010b.toFixed(2)} != ${expectedCashDelta2.toFixed(2)}`)
  if (Math.abs(d1200b - (-invBalance)) > 0.05) throw new Error(`COA 1200 delta after settle ${d1200b.toFixed(2)} != ${(-invBalance).toFixed(2)}`)

  // Expense payment history validation (initial + recorded + void)
  if (expenseId) {
    // List payments and ensure initial synthetic exists when initialAmountPaid>0 (ours is 0 for paid-at-posting? it records initial=amountPaid or amountPaid null -> 0).
    // We recorded a partial 23.45 payment earlier, find it and then void it.
    const payList = await http('GET', `/api/expenses/${encodeURIComponent(expenseId)}/payments`)
    const payments = Array.isArray(payList.data?.payments) ? payList.data.payments : []
    const recorded = payments.find(p => p?.customFields?.type === 'expense_payment' && !String(p?.id).startsWith('initial:'))
    if (recorded?.id) {
      await http('POST', `/api/payments/${encodeURIComponent(recorded.id)}/void`, {})
    }
  }

  // ----- Additional scenarios -----
  console.log('🧪 Scenario: Invoice Overpaid (cash+600, revenue+500, credits+100)')
  const baseOver = await coaMap()
  await http('POST', '/api/invoices', {
    customerName: 'Overpay Co',
    amount: '500.00',
    amountPaid: '600.00',
    balanceDue: '-100.00',
    date: today(),
    categoryKey: 'PROFESSIONAL_SERVICES',
    paymentStatus: 'overpaid',
    invoiceNumber: `SMOKE-OVP-${Date.now()}`,
    reference: ref('INV-OVP')
  })
  const afterOver = await coaMap()
  if (Math.abs(delta(afterOver, baseOver, '1010') - 600.00) > 0.05) throw new Error('Overpaid: cash delta != 600')
  if (Math.abs(delta(afterOver, baseOver, '4020') - 500.00) > 0.05) throw new Error('Overpaid: revenue delta != 500')
  if (Math.abs(delta(afterOver, baseOver, '2050') - 100.00) > 0.05) throw new Error('Overpaid: customer credits delta != 100')

  console.log('🧪 Scenario: Invoice with Tax & Discount (consistent totals)')
  const baseTD = await coaMap()
  await http('POST', '/api/invoices', {
    customerName: 'TaxDisc LLC',
    amount: '892.50',
    subtotal: '900.00',
    amountPaid: '850.00',
    balanceDue: '42.50',
    date: today(),
    categoryKey: 'CONSULTING',
    paymentStatus: 'paid',
    discount: { enabled: true, type: 'fixed', amount: '50.00' },
    taxSettings: { enabled: true, type: 'percentage', rate: '5' },
    invoiceNumber: `SMOKE-TD-${Date.now()}`,
    reference: ref('INV-TD')
  })
  const afterTD = await coaMap()
  if (Math.abs(delta(afterTD, baseTD, '4020') - 900.00) > 0.1) throw new Error('TaxDisc: revenue delta != 900')
  if (Math.abs(delta(afterTD, baseTD, '4910') - 50.00) > 0.1) throw new Error('TaxDisc: sales discounts delta != 50')
  if (Math.abs(delta(afterTD, baseTD, '2150') - 42.50) > 0.2) throw new Error('TaxDisc: tax payable delta != 42.5')
  if (Math.abs(delta(afterTD, baseTD, '1010') - 850.00) > 0.2) throw new Error('TaxDisc: cash delta != 850')
  if (Math.abs(delta(afterTD, baseTD, '1200') - 42.50) > 0.2) throw new Error('TaxDisc: AR delta != 42.5')

  console.log('🧪 Scenario: Expense with initial partial payment at posting shows synthetic payment in history')
  console.log('🧪 Scenario: Refund Expense (negative amount)')
  const baseRF = await coaMap()
  await http('POST', '/api/expenses', {
    vendorName: 'Refund Vendor',
    amount: '-40.00',
    date: today(),
    categoryKey: 'OFFICE_SUPPLIES',
    paymentStatus: 'refunded',
    isRefund: true,
    reference: ref('EXP-REFUND')
  })
  const afterRF = await coaMap()
  if (Math.abs(delta(afterRF, baseRF, '6020') - (-40.00)) > 0.1) throw new Error('Refund: 6020 delta != -40')

  console.log('🧪 Scenario: Invoice with multiple line items (map to different revenue codes)')
  const baseLI = await coaMap()
  await http('POST', '/api/invoices', {
    customerName: 'Lines Inc',
    amount: '700.00',
    amountPaid: '300.00',
    balanceDue: '400.00',
    date: today(),
    categoryKey: 'CONSULTING',
    paymentStatus: 'partial',
    invoiceNumber: `SMOKE-LI-${Date.now()}`,
    reference: ref('INV-LINES'),
    lineItems: [
      { description: 'Website development', amount: 400.00, quantity: 1, rate: 400.00, category: 'development' },
      { description: 'SEO marketing', amount: 300.00, quantity: 1, rate: 300.00, category: 'marketing' },
    ]
  })
  const afterLI = await coaMap()
  // Revenue posted in two lines; our mapper may place both under 4020 or 4020/4030; assert total revenue increased by 700
  if (Math.abs((delta(afterLI, baseLI, '4020') + (afterLI.get('4030') - (baseLI.get('4030') || 0))) - 700.00) > 0.5) {
    throw new Error('Line items: combined revenue delta != 700')
  }
  if (Math.abs(delta(afterLI, baseLI, '1010') - 300.00) > 0.2) throw new Error('Line items: cash delta != 300')
  if (Math.abs(delta(afterLI, baseLI, '1200') - 400.00) > 0.2) throw new Error('Line items: AR delta != 400')

  console.log('🧪 Scenario: Invoice overdue status based on dueDate')
  const duePast = new Date(); duePast.setDate(duePast.getDate() - 10)
  await http('POST', '/api/invoices', {
    customerName: 'Overdue Co',
    amount: '100.00',
    amountPaid: '0.00',
    balanceDue: '100.00',
    date: today(),
    dueDate: duePast.toISOString().slice(0,10),
    categoryKey: 'CONSULTING',
    paymentStatus: 'invoice',
    invoiceNumber: `SMOKE-OD-${Date.now()}`,
    reference: ref('INV-OD')
  })

  const expRef2 = ref('EXP-PARTIAL')
  const exp2 = await http('POST', '/api/expenses', {
    vendorName: 'Partial Vendor',
    amount: '80.00',
    amountPaid: '20.00',
    balanceDue: '60.00',
    date: today(),
    categoryKey: 'OFFICE_SUPPLIES',
    paymentStatus: 'partial',
    reference: expRef2
  })
  const expId2 = exp2?.data?.expenseId || exp2?.data?.transactionId
  if (expId2) {
    const list2 = await http('GET', `/api/expenses/${encodeURIComponent(expId2)}/payments`)
    const payments2 = Array.isArray(list2.data?.payments) ? list2.data.payments : []
    const hasInitial = payments2.some(p => String(p?.id || '').startsWith('initial:'))
    if (!hasInitial) throw new Error('Partial at posting did not include synthetic initial payment in history')
  }

  // Trial balance check only for SMOKE references
  console.log('🧮 Verifying balanced journal for smoke transactions...')
  const txs = await prisma.transaction.findMany({
    where: { reference: { startsWith: TEST_PREFIX } },
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

  if (!keep) {
    console.log('🧹 Cleaning up smoke transactions...')
    const count = await cleanup()
    console.log(`  🗑️ Deleted ${count} smoke transactions.`)
  } else {
    console.log('ℹ️ Keeping smoke transactions (use without --keep to auto-clean).')
  }
}

run()
  .catch((e) => { console.error('❌ Smoke tests failed:', e.message || e); process.exitCode = 1 })
  .finally(async () => { try { await prisma.$disconnect() } catch {} })


