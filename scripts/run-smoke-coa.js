// Smoke test runner for COA mapping across AP/AR
// Usage: node scripts/run-smoke-coa.js [BASE_URL]
// BASE_URL defaults to http://localhost:4000

const BASE = process.argv[2] || 'http://localhost:4000'
const ADMIN_HEADERS = { 'X-Job-Key': process.env.AILEGR_JOB_KEY || 'dev-job-key' }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function post(path, body, admin=false) {
  const headers = { 'Content-Type': 'application/json', ...(admin ? ADMIN_HEADERS : {}) }
  const res = await fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  return res.json()
}

async function run() {
  const today = new Date().toISOString().slice(0,10)
  const tests = []
  const AP = '/api/admin/post-expense'
  const AR = '/api/admin/post-invoice'

  // AP scenarios
  tests.push({ name: 'AP Telecom 6160', path: AP, payload: { vendorName: 'AT&T Business', amount: 129.99, date: today, paymentStatus: 'paid', description: 'Business fiber internet plan', suggestedAccountCode: '6160' } })
  tests.push({ name: 'AP Bank Fees 6015', path: AP, payload: { vendorName: 'Stripe Processing', amount: 23.12, date: today, paymentStatus: 'paid', description: 'Stripe merchant fees', suggestedAccountCode: '6015' } })
  tests.push({ name: 'AP Cloud Hosting 6240', path: AP, payload: { vendorName: 'Amazon Web Services', amount: 350.00, date: today, paymentStatus: 'paid', description: 'EC2 and S3 usage', suggestedAccountCode: '6240' } })
  tests.push({ name: 'AP Processor Fees 6230', path: AP, payload: { vendorName: 'PayPal', amount: 18.55, date: today, paymentStatus: 'paid', description: 'PayPal transaction fees', suggestedAccountCode: '6230' } })
  tests.push({ name: 'AP Insurance 6115', path: AP, payload: { vendorName: 'Acme Insurance', amount: 200.00, date: today, paymentStatus: 'unpaid', description: 'General liability', suggestedAccountCode: '6115' } })
  tests.push({ name: 'AP Training 6170', path: AP, payload: { vendorName: 'Udemy', amount: 120.00, date: today, paymentStatus: 'paid', description: 'Course enrollment', suggestedAccountCode: '6170' } })
  tests.push({ name: 'AP Meals 6180', path: AP, payload: { vendorName: 'Starbucks', amount: 13.75, date: today, paymentStatus: 'paid', description: 'Client coffee meeting', suggestedAccountCode: '6180' } })
  tests.push({ name: 'AP Rent 6070', path: AP, payload: { vendorName: 'WeWork', amount: 800.00, date: today, paymentStatus: 'unpaid', description: 'Office rent', categoryKey: 'RENT' } })
  tests.push({ name: 'AP SaaS 6030', path: AP, payload: { vendorName: 'Notion', amount: 16.00, date: today, paymentStatus: 'paid', description: 'Notion subscription', categoryKey: 'SOFTWARE' } })
  tests.push({ name: 'AP Utilities 6080', path: AP, payload: { vendorName: 'ConEd', amount: 210.00, date: today, paymentStatus: 'paid', description: 'Electric utility', categoryKey: 'UTILITIES' } })
  tests.push({ name: 'AP COGS 5010', path: AP, payload: { vendorName: 'SupplyCo', amount: 500.00, date: today, paymentStatus: 'paid', description: 'Raw materials', categoryKey: 'COGS' } })

  // AR scenarios
  const inv = (n) => `INV-${Date.now()}-${n}`
  tests.push({ name: 'AR Mixed Lines 4020/4030/4040', path: AR, payload: { customerName: 'Acme Corp', amount: 3600, date: today, description: 'Professional services', paymentStatus: 'invoice', invoiceNumber: inv(1), lineItems: [ { description: 'Web development sprint', amount: 2000, accountCode: '4020' }, { description: 'SEO monthly', amount: 1200, accountCode: '4030' }, { description: 'Support plan', amount: 400, accountCode: '4040' } ] } })
  tests.push({ name: 'AR Subscription 4050', path: AR, payload: { customerName: 'Globex', amount: 300, date: today, description: 'SaaS monthly', paymentStatus: 'invoice', invoiceNumber: inv(2), lineItems: [ { description: 'Subscription - Pro plan', amount: 300, accountCode: '4050' } ] } })
  tests.push({ name: 'AR License 4060', path: AR, payload: { customerName: 'Initech', amount: 1500, date: today, description: 'License fee', paymentStatus: 'invoice', invoiceNumber: inv(3), lineItems: [ { description: 'Perpetual license', amount: 1500, accountCode: '4060' } ] } })
  tests.push({ name: 'AR Training 4070 partial', path: AR, payload: { customerName: 'Hooli', amount: 1000, date: today, description: 'Onsite training', paymentStatus: 'partial', amountPaid: 300, dueDate: today, invoiceNumber: inv(4), lineItems: [ { description: 'Training workshop', amount: 1000, accountCode: '4070' } ] } })

  const results = []
  for (const t of tests) {
    try {
      const r = await post(t.path, t.payload, true)
      results.push({ name: t.name, path: t.path, ok: true, id: r.transactionId || r.expenseId || r.invoiceId || null, details: { paymentStatus: r.paymentStatus, accounts: r.accounts, entries: r.entries?.map(e => ({ type: e.debitAccountId ? 'debit' : 'credit', amount: e.amount })) } })
      await sleep(50)
    } catch (e) {
      results.push({ name: t.name, path: t.path, ok: false, error: e.message })
    }
  }

  console.log(JSON.stringify({ base: BASE, ran: tests.length, results }, null, 2))
}

run().catch(e => { console.error(e); process.exit(1) })


