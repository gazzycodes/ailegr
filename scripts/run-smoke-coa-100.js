// Comprehensive 100-case COA smoke tests (AP + AR best/worst cases)
// Usage: node scripts/run-smoke-coa-100.js [BASE_URL]
// BASE_URL defaults to http://localhost:4000

const BASE = process.argv[2] || 'http://localhost:4000'
const ADMIN_HEADERS = { 'X-Job-Key': process.env.AILEGR_JOB_KEY || 'dev-job-key' }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function post(path, body) {
  const headers = { 'Content-Type': 'application/json', ...ADMIN_HEADERS }
  const res = await fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  return res.json()
}

function today() { return new Date().toISOString().slice(0,10) }
function inv(n) { return `INV-${Date.now()}-${n}` }

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

function amount(n) { return Math.round(n * 100) / 100 }

function genApBase(name, overrides={}) {
  return { name, path: '/api/admin/post-expense', payload: {
    vendorName: overrides.vendorName || pick(['Acme Co', 'Globex', 'Umbrella', 'Wayne Ent', 'Soylent', 'Initrode']),
    amount: overrides.amount ?? amount(Math.random() * 1000 + 10),
    date: overrides.date || today(),
    paymentStatus: overrides.paymentStatus || pick(['paid','unpaid','partial']),
    amountPaid: overrides.amountPaid,
    description: overrides.description || pick(['General expense','Monthly charge','Annual plan','Usage fees','Subscription','Supplies purchase']),
    suggestedAccountCode: overrides.suggestedAccountCode,
    categoryKey: overrides.categoryKey,
    splitByLineItems: overrides.splitByLineItems,
    lineItems: overrides.lineItems,
    subtotal: overrides.subtotal,
    taxAmount: overrides.taxAmount,
    dueDays: overrides.dueDays,
    dueDate: overrides.dueDate,
  } }
}

function genArBase(name, overrides={}) {
  return { name, path: '/api/admin/post-invoice', payload: {
    customerName: overrides.customerName || pick(['Acme Corp', 'Globex', 'Initech', 'Hooli', 'Vandelay', 'Stark Industries']),
    amount: overrides.amount ?? amount(Math.random() * 5000 + 200),
    date: overrides.date || today(),
    description: overrides.description || pick(['Professional services','Product sale','Subscription','Support plan','Training services']),
    paymentStatus: overrides.paymentStatus || pick(['invoice','paid','partial']),
    amountPaid: overrides.amountPaid,
    invoiceNumber: overrides.invoiceNumber || inv(Math.floor(Math.random()*1e6)),
    lineItems: overrides.lineItems,
    subtotal: overrides.subtotal,
    discountAmount: overrides.discountAmount,
    taxAmount: overrides.taxAmount,
    dueDays: overrides.dueDays,
    dueDate: overrides.dueDate,
  } }
}

function apCases() {
  const t = today()
  const cases = []
  // Guided valid mappings (AI suggested code)
  cases.push(genApBase('AP Telecom 6160 (AI)', { vendorName: 'AT&T', amount: 129.99, paymentStatus: 'paid', description: 'Fiber internet', suggestedAccountCode: '6160' }))
  cases.push(genApBase('AP Cloud Hosting 6240 (HEURISTIC)', { vendorName: 'AWS', amount: 350.00, paymentStatus: 'paid', description: 'Cloud hosting EC2 S3, cloud hosting bill' }))
  cases.push(genApBase('AP Processor Fees 6230 (HEURISTIC)', { vendorName: 'Stripe', amount: 18.55, paymentStatus: 'paid', description: 'payment processor fees monthly' }))
  cases.push(genApBase('AP Insurance 6115 (AI)', { vendorName: 'Acme Insurance', amount: 200.00, paymentStatus: 'unpaid', description: 'General liability policy', suggestedAccountCode: '6115' }))
  cases.push(genApBase('AP Training 6170 (AI)', { vendorName: 'Udemy', amount: 120.00, paymentStatus: 'paid', description: 'Course enrollment', suggestedAccountCode: '6170' }))
  cases.push(genApBase('AP Meals 6180 (AI)', { vendorName: 'Starbucks', amount: 13.75, paymentStatus: 'paid', description: 'Client meeting coffee', suggestedAccountCode: '6180' }))
  cases.push(genApBase('AP Rent 6070 (CATEGORY)', { vendorName: 'WeWork', amount: 800.00, paymentStatus: 'unpaid', description: 'Office rent', categoryKey: 'RENT' }))
  cases.push(genApBase('AP SaaS 6030 (CATEGORY)', { vendorName: 'Notion', amount: 16.00, paymentStatus: 'paid', description: 'Notion subscription', categoryKey: 'SOFTWARE' }))
  cases.push(genApBase('AP Utilities 6080 (CATEGORY)', { vendorName: 'ConEd', amount: 210.00, paymentStatus: 'paid', description: 'Electric utility', categoryKey: 'UTILITIES' }))
  cases.push(genApBase('AP COGS 5010 (CATEGORY)', { vendorName: 'SupplyCo', amount: 500.00, paymentStatus: 'paid', description: 'Raw materials', categoryKey: 'COGS' }))

  // Worst cases / fallbacks
  cases.push(genApBase('AP Unknown code fallback → 6999', { vendorName: 'Unknown Vendor', amount: 42.42, paymentStatus: 'paid', description: 'Misc unknown', suggestedAccountCode: '9999' }))
  cases.push(genApBase('AP No hint fallback → 6999', { vendorName: 'Mystery Inc', amount: 19.99, paymentStatus: 'paid', description: 'N/A' }))
  cases.push(genApBase('AP Negative amount (expect error)', { vendorName: 'Glitch Inc', amount: -10, paymentStatus: 'paid', description: 'Invalid negative' }))
  cases.push(genApBase('AP Zero amount (expect error)', { vendorName: 'Zero Inc', amount: 0, paymentStatus: 'paid', description: 'Zero charge' }))

  // Split by line items with QTY/RATE
  cases.push(genApBase('AP Split lines SaaS + Fees', {
    vendorName: 'Stripe + Notion', paymentStatus: 'paid', splitByLineItems: true,
    subtotal: 38.55, taxAmount: 0, amount: 38.55,
    lineItems: [
      { description: 'Notion subscription', quantity: 1, rate: 16.00, amount: 16.00, accountCode: '6030' },
      { description: 'Stripe processing fees', quantity: 1, rate: 22.55, amount: 22.55, accountCode: '6230' },
    ]
  }))

  // Many randomized valid expense types across typical OPEX
  const opex = [
    { code: '6020', desc: 'Office supplies' },
    { code: '6040', desc: 'Postage & Shipping' },
    { code: '6060', desc: 'Repairs & Maintenance' },
    { code: '6100', desc: 'Legal & Compliance fees' },
    { code: '6120', desc: 'Advertising & Marketing' },
    { code: '6140', desc: 'Travel - Airfare & Hotels' },
    { code: '6150', desc: 'Vehicle & Fuel' },
    { code: '6190', desc: 'Employee benefits' },
    { code: '6200', desc: 'Office Cleaning' },
    { code: '6210', desc: 'IT Equipment' },
    { code: '6220', desc: 'Contractor services' },
  ]
  for (let i = 0; i < 30; i++) {
    const item = pick(opex)
    cases.push(genApBase(`AP OPEX ${item.code} #${i+1}`, {
      vendorName: pick(['OfficeMax','Home Depot','LegalZoom','Facebook Ads','Delta Airlines','Chevron','Gusto','Cleaning Co','BestBuy','Freelancer X']),
      amount: amount(Math.random()*800 + 5),
      paymentStatus: pick(['paid','unpaid']),
      description: item.desc,
      suggestedAccountCode: item.code
    }))
  }

  // Mix in some partial payments and due term variations
  for (let i = 0; i < 10; i++) {
    const amt = amount(Math.random()*1000 + 100)
    const paid = amount(amt * Math.random())
    cases.push(genApBase(`AP Partial ${i+1}`, {
      vendorName: pick(['Vendor A','Vendor B','Vendor C']),
      amount: amt,
      paymentStatus: 'partial',
      amountPaid: paid,
      description: pick(['Phase 1 retainer','Milestone billing','Partial shipment']),
      suggestedAccountCode: pick(['6070','6080','6030','6160','6115','6170','6180'])
    }))
  }

  // A few with tax + dueDays
  for (let i = 0; i < 6; i++) {
    const amt = amount(Math.random()*500 + 50)
    const tax = amount(amt * 0.08)
    cases.push(genApBase(`AP Taxed ${i+1}`, {
      vendorName: pick(['City Services','State Board','Vendor Taxed']),
      amount: amount(amt + tax),
      subtotal: amt,
      taxAmount: tax,
      paymentStatus: pick(['paid','unpaid']),
      dueDays: pick([0,15,30]),
      description: pick(['Taxable service','Goods with tax','Local services'])
    }))
  }

  // 1 duplicate-like vendor invoice number scenario is enforced on expense only when provided (rare); skip VIN to avoid noisy 409s

  return cases
}

function arCases(startIndex=0) {
  const t = today()
  const cases = []
  // Guided revenue lines with explicit account codes
  cases.push(genArBase('AR Mixed 4020/4030/4040', { amount: 3600, paymentStatus: 'invoice', invoiceNumber: inv(startIndex+1), lineItems: [
    { description: 'Web development sprint', amount: 2000, accountCode: '4020' },
    { description: 'SEO monthly', amount: 1200, accountCode: '4030' },
    { description: 'Support plan', amount: 400, accountCode: '4040' },
  ] }))
  cases.push(genArBase('AR Subscription 4050', { amount: 300, paymentStatus: 'invoice', invoiceNumber: inv(startIndex+2), lineItems: [
    { description: 'SaaS Pro plan', amount: 300, accountCode: '4050' },
  ] }))
  cases.push(genArBase('AR License 4060', { amount: 1500, paymentStatus: 'invoice', invoiceNumber: inv(startIndex+3), lineItems: [
    { description: 'Perpetual license', amount: 1500, accountCode: '4060' },
  ] }))
  cases.push(genArBase('AR Training 4070 partial', { amount: 1000, paymentStatus: 'partial', amountPaid: 300, invoiceNumber: inv(startIndex+4), lineItems: [
    { description: 'Onsite training', amount: 1000, accountCode: '4070' },
  ] }))

  // Worst cases / fallbacks (unknown account → default revenue)
  cases.push(genArBase('AR Unknown code fallback → 4020', { amount: 420, paymentStatus: 'invoice', invoiceNumber: inv(startIndex+5), lineItems: [
    { description: 'Unknown revenue type', amount: 420, accountCode: '4999' },
  ] }))

  // Tax and discounts
  cases.push(genArBase('AR Discount + Tax', { amount: 1080, paymentStatus: 'invoice', invoiceNumber: inv(startIndex+6), subtotal: 1000, discountAmount: 50, taxAmount: 130, lineItems: [
    { description: 'Consulting services', amount: 1000, accountCode: '4020' },
  ] }))

  // Randomized services without accountCode (heuristics mapping via description)
  const revDescs = [
    { desc: 'Monthly subscription', hint: 'subscription' },
    { desc: 'Annual support retainer', hint: 'support plan' },
    { desc: 'Custom development', hint: 'services' },
    { desc: 'Software license', hint: 'license' },
    { desc: 'Training workshop', hint: 'training' },
  ]
  for (let i = 0; i < 20; i++) {
    const sel = pick(revDescs)
    const amt = amount(Math.random()*3000 + 200)
    cases.push(genArBase(`AR Heuristic map #${i+1}`, { amount: amt, paymentStatus: pick(['invoice','paid']), invoiceNumber: inv(startIndex+10+i), lineItems: [
      { description: sel.desc, amount: amt },
    ] }))
  }

  // QTY/RATE
  for (let i = 0; i < 10; i++) {
    const qty = Math.floor(Math.random()*9)+1
    const rate = amount(Math.random()*200 + 50)
    const amt = amount(qty * rate)
    cases.push(genArBase(`AR QTYxRATE #${i+1}`, { amount: amt, paymentStatus: pick(['invoice','paid']), invoiceNumber: inv(startIndex+40+i), lineItems: [
      { description: 'Billable hours', quantity: qty, rate, amount: amt, accountCode: '4020' },
    ] }))
  }

  // Edge: zero line amount (expect error)
  cases.push(genArBase('AR Zero line amount (expect error)', { amount: 0, paymentStatus: 'invoice', invoiceNumber: inv(startIndex+70), lineItems: [
    { description: 'No value', amount: 0, accountCode: '4020' },
  ] }))

  // Duplicate invoice number (second should fail)
  const dup = `DUP-${Date.now()}`
  cases.push(genArBase('AR Duplicate VIN first', { amount: 500, paymentStatus: 'invoice', invoiceNumber: dup, lineItems: [ { description: 'One-off', amount: 500, accountCode: '4020' } ] }))
  cases.push(genArBase('AR Duplicate VIN second (expect 409)', { amount: 700, paymentStatus: 'invoice', invoiceNumber: dup, lineItems: [ { description: 'Another', amount: 700, accountCode: '4020' } ] }))

  return cases
}

async function run() {
  const tests = []
  const ap = apCases()
  const ar = arCases(ap.length)

  // Build up to 100 tests: prioritize AP+AR sets then fill with random AP copies
  tests.push(...ap)
  tests.push(...ar)

  // If less than 100, add randomized AP clones with slight perturbations
  while (tests.length < 100) {
    const base = ap[Math.floor(Math.random()*ap.length)]
    const clone = JSON.parse(JSON.stringify(base))
    clone.name = clone.name + ' (clone ' + (tests.length+1) + ')'
    // random tweaks
    if (clone.payload) {
      if (typeof clone.payload.amount === 'number') clone.payload.amount = amount(clone.payload.amount * (0.8 + Math.random()*0.4))
      clone.payload.date = today()
      if (clone.payload.invoiceNumber) clone.payload.invoiceNumber = inv(Math.floor(Math.random()*1e6))
    }
    tests.push(clone)
  }

  const results = []
  for (const [i, t] of tests.entries()) {
    try {
      const r = await post(t.path, t.payload)
      results.push({
        i: i+1,
        name: t.name,
        path: t.path,
        ok: true,
        id: r.transactionId || r.expenseId || r.invoiceId || null,
        details: {
          paymentStatus: r.paymentStatus,
          accounts: r.accounts,
          entries: r.entries?.map(e => ({ type: e.debitAccountId ? 'debit' : 'credit', amount: e.amount }))
        }
      })
    } catch (e) {
      results.push({ i: i+1, name: t.name, path: t.path, ok: false, error: e.message })
    }
    await sleep(30)
  }

  const ok = results.filter(r => r.ok).length
  const failed = results.length - ok
  console.log(JSON.stringify({ base: BASE, ran: results.length, ok, failed, results }, null, 2))
}

run().catch(e => { console.error(e); process.exit(1) })


