// ESM script to run admin smoke posts against embedded server
// Usage: node scripts/run-admin-smokes.js --simple 10 --complex 50

import axios from 'axios'

const args = process.argv.slice(2)
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`)
  if (i >= 0) {
    const v = args[i + 1]
    if (v != null && !v.startsWith('--')) return v
    return true
  }
  return def
}

const SIMPLE_COUNT = parseInt(getArg('simple', '10'), 10) || 10
const COMPLEX_COUNT = parseInt(getArg('complex', '0'), 10) || 0
const BASE = process.env.VITE_API_URL || 'http://localhost:4000'
const JOB_KEY = process.env.AILEGR_JOB_KEY || 'dev-job-key'
const headers = { 'X-Job-Key': JOB_KEY }

const http = axios.create({ baseURL: BASE, timeout: 60000, headers })

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const rnd = () => Math.random().toString(36).slice(2, 8).toUpperCase()
const today = new Date().toISOString().slice(0, 10)

function friendlyMessage(status, code, raw) {
  const txt = String(raw || '').toLowerCase()
  if (status === 409 && code === 'DUPLICATE_INVOICE_NUMBER') return 'Invoice number already exists.'
  if (status === 409 && code === 'DUPLICATE_VENDOR_INVOICE') return 'A bill with this Vendor Invoice No. already exists.'
  if (status === 422 && code === 'VALIDATION_FAILED') return 'Please check the form and fix highlighted fields.'
  if (status === 422 && (txt.includes('amount') || txt.includes('date'))) return 'Invalid input. Please review amounts and dates.'
  if (status === 401) return 'You are not signed in. Please log in and try again.'
  if (status === 403) return 'You do not have permission to perform this action.'
  if (status === 404) return 'Not found.'
  if (status === 429) return 'You’re doing that too fast. Please try again in a moment.'
  if (status && status >= 500) return 'Something went wrong on the server. Please try again.'
  return raw || 'Something went wrong. Please try again.'
}

async function postInvoice(payload) {
  try {
    const { data } = await http.post('/api/admin/post-invoice', payload)
    return { ok: true, data }
  } catch (e) {
    const status = e?.response?.status || 0
    const code = e?.response?.data?.code || ''
    const raw = e?.response?.data?.message || e?.message || 'Error'
    return { ok: false, status, code, message: friendlyMessage(status, code, raw) }
  }
}

async function postExpense(payload) {
  try {
    const { data } = await http.post('/api/admin/post-expense', payload)
    return { ok: true, data }
  } catch (e) {
    const status = e?.response?.status || 0
    const code = e?.response?.data?.code || ''
    const raw = e?.response?.data?.message || e?.message || 'Error'
    return { ok: false, status, code, message: friendlyMessage(status, code, raw) }
  }
}

function simpleInvoice(i) {
  return {
    customerName: `SimpleC_${rnd()}`,
    amount: 100 + i,
    date: today,
    description: 'Simple INV',
    lineItems: [{ description: 'Service', amount: 100 + i }]
  }
}

function simpleExpense(i) {
  return {
    vendorName: `SimpleV_${rnd()}`,
    amount: 50 + i,
    date: today,
    description: 'Simple EXP',
    lineItems: [{ description: 'Office', amount: 50 + i }]
  }
}

function complexInvoice(k) {
  const variant = k % 10
  const base = {
    customerName: `Cx_${rnd()}`,
    date: today,
    description: 'Complex INV',
  }
  switch (variant) {
    case 0: // two lines, quantity/rate
      return {
        ...base,
        amount: 0, // engine will compute from line items
        lineItems: [
          { description: 'Consulting', amount: 0, quantity: 2, rate: 150 },
          { description: 'Support', amount: 0, quantity: 3, rate: 80 },
        ]
      }
    case 1: // tax percentage and discount
      return {
        ...base,
        amount: 300,
        taxSettings: { enabled: true, type: 'percentage', rate: 8 },
        discount: { enabled: true, amount: 20 },
        lineItems: [{ description: 'Package', amount: 300 }]
      }
    case 2: // duplicate invoice number attempt
      return {
        ...base,
        invoiceNumber: 'INV-DUP-TEST-001',
        amount: 120,
        lineItems: [{ description: 'Dup Test', amount: 120 }]
      }
    case 3: // invalid (missing date)
      return {
        customerName: `Cx_${rnd()}`,
        amount: 100,
        description: 'Missing date',
        lineItems: [{ description: 'Line', amount: 100 }]
      }
    case 4: // negative amount
      return {
        ...base,
        amount: -50,
        lineItems: [{ description: 'Bad', amount: -50 }]
      }
    case 5: // explicit account override
      return {
        ...base,
        amount: 200,
        lineItems: [{ description: 'Mapped Rev', amount: 200, accountCode: '4010' }]
      }
    case 6: // long description and random fields
      return {
        ...base,
        amount: 180,
        lineItems: [{ description: 'A'.repeat(256), amount: 180 }],
        foo: 'bar'
      }
    case 7: // subtotal mismatch (engine may accept or not)
      return {
        ...base,
        amount: 200,
        subtotal: 150,
        lineItems: [{ description: 'Sum 200', amount: 200 }]
      }
    case 8: // heavy lines
      return {
        ...base,
        amount: 0,
        lineItems: Array.from({ length: 8 }, (_, i) => ({ description: `L${i+1}`, amount: 10 + i }))
      }
    default: // weird floats
      return {
        ...base,
        amount: 123.4567,
        lineItems: [{ description: 'Float', amount: 123.4567 }]
      }
  }
}

function complexExpense(k) {
  const variant = k % 10
  const base = {
    vendorName: `Vx_${rnd()}`,
    date: today,
    description: 'Complex EXP',
  }
  switch (variant) {
    case 0: // receive inventory-like
      return { ...base, amount: 0, lineItems: [{ description: 'Paper', amount: 0, quantity: 5, rate: 4 }] }
    case 1: // duplicate vendor invoice no scenario (set the same later twice)
      return { ...base, amount: 90, vendorInvoiceNo: 'VIN-DUP-001', lineItems: [{ description: 'Supplies', amount: 90 }] }
    case 2: // missing vendor
      return { amount: 50, date: today, description: 'No vendor', lineItems: [{ description: 'Misc', amount: 50 }] }
    case 3: // negative amount
      return { ...base, amount: -10, lineItems: [{ description: 'Bad', amount: -10 }] }
    case 4: // header account override (COGS)
      return { ...base, amount: 70, accountCode: '5010', lineItems: [{ description: 'Parts', amount: 70 }] }
    case 5: // random noise
      return { ...base, amount: 40, lineItems: [{ description: 'Noise', amount: 40 }], extra: { a: 1 } }
    case 6: // many lines
      return { ...base, amount: 0, lineItems: Array.from({ length: 6 }, (_, i) => ({ description: `E${i+1}`, amount: 5 + i })) }
    case 7: // tax amount style (still AP)
      return { ...base, amount: 110, lineItems: [{ description: 'AP + Tax', amount: 110 }], taxSettings: { enabled: true, type: 'amount', amount: 10 } }
    case 8: // invalid date
      return { ...base, amount: 30, date: '2025-99-99', lineItems: [{ description: 'Bad date', amount: 30 }] }
    default: // zero amount edge
      return { ...base, amount: 0, lineItems: [{ description: 'Zero', amount: 0 }] }
  }
}

async function runSimple(count) {
  const half = Math.floor(count / 2)
  const results = []
  for (let i = 0; i < half; i++) results.push(postInvoice(simpleInvoice(i)))
  for (let i = 0; i < count - half; i++) results.push(postExpense(simpleExpense(i)))
  const settled = await Promise.all(results)
  const ok = settled.filter(r => r.ok).length
  const fail = settled.length - ok
  return { ok, fail, total: settled.length }
}

async function runComplex(count) {
  const results = []
  for (let i = 0; i < count; i++) {
    const chooseInvoice = (i % 2 === 0)
    results.push(chooseInvoice ? postInvoice(complexInvoice(i)) : postExpense(complexExpense(i)))
  }
  const settled = await Promise.all(results)
  const ok = settled.filter(r => r.ok).length
  const fail = settled.length - ok
  const errors = {}
  settled.filter(r => !r.ok).forEach(r => {
    const key = `${r.status || 0}:${r.code || 'UNKNOWN'}`
    errors[key] = (errors[key] || 0) + 1
  })
  const samples = settled.filter(r => !r.ok).slice(0, 6).map(r => ({ status: r.status, code: r.code, message: r.message }))
  return { ok, fail, total: settled.length, errors, samples }
}

async function main() {
  const simple = SIMPLE_COUNT > 0 ? await runSimple(SIMPLE_COUNT) : { ok: 0, fail: 0, total: 0 }
  const complex = COMPLEX_COUNT > 0 ? await runComplex(COMPLEX_COUNT) : { ok: 0, fail: 0, total: 0, errors: {}, samples: [] }
  const summary = { base: BASE, simple, complex }
  console.log(JSON.stringify({ type: 'ADMIN_SMOKES_SUMMARY', summary }, null, 2))
}

await main()


