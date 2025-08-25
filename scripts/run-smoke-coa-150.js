// 150-case COA suite: 100 valid + 50 expected-failure (edge) cases
// Usage: node scripts/run-smoke-coa-150.js [BASE_URL]

const BASE = process.argv[2] || 'http://localhost:4000'
const ADMIN_HEADERS = { 'X-Job-Key': process.env.AILEGR_JOB_KEY || 'dev-job-key' }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
async function post(path, body) {
  const headers = { 'Content-Type': 'application/json', ...ADMIN_HEADERS }
  const res = await fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { status: res.status, ok: res.ok, json }
}

function today() { return new Date().toISOString().slice(0,10) }
function inv(n) { return `INV-${Date.now()}-${n}` }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function amount(n) { return Math.round(n * 100) / 100 }

function validApCases() {
  const cases = []
  const t = today()
  const fixed = [
    { name: 'AP Telecom 6160', vendorName: 'AT&T', amount: 129.99, description: 'Fiber internet', suggestedAccountCode: '6160', paymentStatus: 'paid' },
    { name: 'AP Cloud 6240', vendorName: 'AWS', amount: 350.0, description: 'EC2 and S3 usage', suggestedAccountCode: '6240', paymentStatus: 'paid' },
    { name: 'AP Fees 6230', vendorName: 'Stripe', amount: 18.55, description: 'processor fees', suggestedAccountCode: '6230', paymentStatus: 'paid' },
    { name: 'AP Insurance 6115', vendorName: 'Acme Insurance', amount: 200.0, description: 'General liability', suggestedAccountCode: '6115', paymentStatus: 'unpaid' },
    { name: 'AP Meals 6180', vendorName: 'Starbucks', amount: 13.75, description: 'Client coffee', suggestedAccountCode: '6180', paymentStatus: 'paid' },
    { name: 'AP Rent 6070', vendorName: 'WeWork', amount: 800.0, description: 'Office rent', categoryKey: 'RENT', paymentStatus: 'unpaid' },
    { name: 'AP SaaS 6030', vendorName: 'Notion', amount: 16.0, description: 'Notion subscription', categoryKey: 'SOFTWARE', paymentStatus: 'paid' },
    { name: 'AP Utilities 6080', vendorName: 'ConEd', amount: 210.0, description: 'Electric utility', categoryKey: 'UTILITIES', paymentStatus: 'paid' },
    { name: 'AP COGS 5010', vendorName: 'SupplyCo', amount: 500.0, description: 'Raw materials', categoryKey: 'COGS', paymentStatus: 'paid' },
  ]
  for (const f of fixed) {
    cases.push({ name: f.name, path: '/api/admin/post-expense', payload: { vendorName: f.vendorName, amount: f.amount, date: t, paymentStatus: f.paymentStatus, description: f.description, suggestedAccountCode: f.suggestedAccountCode, categoryKey: f.categoryKey } })
  }
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
  for (let i=0;i<40;i++) {
    const item = pick(opex)
    cases.push({ name: `AP OPEX ${item.code} #${i+1}`, path: '/api/admin/post-expense', payload: { vendorName: pick(['OfficeMax','Home Depot','LegalZoom','Facebook Ads','Delta','Chevron','Gusto','Cleaning Co','BestBuy','Freelancer X']), amount: amount(Math.random()*700+20), date: t, paymentStatus: pick(['paid','unpaid']), description: item.desc, suggestedAccountCode: item.code } })
  }
  // AP split lines with qty/rate
  cases.push({ name: 'AP Split lines SaaS+Fees', path: '/api/admin/post-expense', payload: { vendorName: 'Stripe + Notion', amount: 38.55, date: t, paymentStatus: 'paid', splitByLineItems: true, subtotal: 38.55, taxAmount: 0, lineItems: [ { description: 'Notion subscription', quantity: 1, rate: 16.00, amount: 16.00, accountCode: '6030' }, { description: 'Stripe processing fees', quantity: 1, rate: 22.55, amount: 22.55, accountCode: '6230' } ] } })
  // AP partials
  for (let i=0;i<10;i++) {
    const amt = amount(Math.random()*1000+100), paid = amount(amt*Math.random())
    cases.push({ name: `AP Partial ${i+1}`, path: '/api/admin/post-expense', payload: { vendorName: pick(['VendorA','VendorB','VendorC']), amount: amt, amountPaid: paid, paymentStatus: 'partial', date: t, description: pick(['Phase 1 retainer','Milestone billing','Partial shipment']), suggestedAccountCode: pick(['6070','6080','6030','6160','6115','6170','6180']) } })
  }
  // AP taxed
  for (let i=0;i<6;i++) {
    const amt = amount(Math.random()*500+50), tax = amount(amt*0.08)
    cases.push({ name: `AP Taxed ${i+1}`, path: '/api/admin/post-expense', payload: { vendorName: pick(['City Services','State Board','Taxed Vendor']), amount: amount(amt+tax), subtotal: amt, taxAmount: tax, date: t, paymentStatus: pick(['paid','unpaid']), description: pick(['Taxable service','Goods with tax']) } })
  }
  // AP refunds (negative amounts allowed with isRefund flag)
  for (let i=0;i<5;i++) {
    const amt = amount(Math.random()*200+10)
    cases.push({ name: `AP Refund ${i+1}`, path: '/api/admin/post-expense', payload: { vendorName: pick(['VendorRefundA','VendorRefundB']), amount: -amt, date: t, paymentStatus: 'paid', description: 'Refund processed', suggestedAccountCode: '6020', isRefund: true } })
  }
  return cases
}

function validArCases(startIndex=0) {
  const t = today()
  const cases = []
  cases.push({ name: 'AR Mixed 4020/4030/4040', path: '/api/admin/post-invoice', payload: { customerName: 'Acme Corp', amount: 3600, date: t, description: 'Professional services', paymentStatus: 'invoice', invoiceNumber: inv(startIndex+1), lineItems: [ { description: 'Web development sprint', amount: 2000, accountCode: '4020' }, { description: 'SEO monthly', amount: 1200, accountCode: '4030' }, { description: 'Support plan', amount: 400, accountCode: '4040' } ] } })
  cases.push({ name: 'AR Subscription 4050', path: '/api/admin/post-invoice', payload: { customerName: 'Globex', amount: 300, date: t, description: 'SaaS monthly', paymentStatus: 'invoice', invoiceNumber: inv(startIndex+2), lineItems: [ { description: 'Subscription - Pro plan', amount: 300, accountCode: '4050' } ] } })
  cases.push({ name: 'AR License 4060', path: '/api/admin/post-invoice', payload: { customerName: 'Initech', amount: 1500, date: t, description: 'License fee', paymentStatus: 'invoice', invoiceNumber: inv(startIndex+3), lineItems: [ { description: 'Perpetual license', amount: 1500, accountCode: '4060' } ] } })
  cases.push({ name: 'AR Training 4070 partial', path: '/api/admin/post-invoice', payload: { customerName: 'Hooli', amount: 1000, date: t, description: 'Onsite training', paymentStatus: 'partial', amountPaid: 300, dueDate: t, invoiceNumber: inv(startIndex+4), lineItems: [ { description: 'Training workshop', amount: 1000, accountCode: '4070' } ] } })
  // Heuristic AR
  const revDescs = [ 'Monthly subscription', 'Annual support retainer', 'Custom development', 'Software license', 'Training workshop' ]
  for (let i=0;i<30;i++) {
    const desc = pick(revDescs)
    const amt = amount(Math.random()*3000 + 200)
    cases.push({ name: `AR Heuristic #${i+1}`, path: '/api/admin/post-invoice', payload: { customerName: pick(['Acme','Globex','Initech','Hooli','Vandelay']), amount: amt, date: t, description: desc, paymentStatus: pick(['invoice','paid']), invoiceNumber: inv(startIndex+10+i), lineItems: [ { description: desc, amount: amt } ] } })
  }
  // QTY/RATE
  for (let i=0;i<15;i++) {
    const qty = Math.floor(Math.random()*9)+1, rate = amount(Math.random()*200+50), amt = amount(qty*rate)
    cases.push({ name: `AR QTYxRATE #${i+1}`, path: '/api/admin/post-invoice', payload: { customerName: pick(['ClientA','ClientB','ClientC']), amount: amt, date: t, description: 'Billable hours', paymentStatus: pick(['invoice','paid']), invoiceNumber: inv(startIndex+50+i), lineItems: [ { description: 'Billable hours', quantity: qty, rate, amount: amt, accountCode: '4020' } ] } })
  }
  // Discounts + tax
  for (let i=0;i<6;i++) {
    const amt = amount(Math.random()*4000+500)
    cases.push({ name: `AR Disc+Tax #${i+1}`, path: '/api/admin/post-invoice', payload: { customerName: pick(['ClientX','ClientY']), amount: amt, subtotal: amount(amt*0.9), discount: { enabled: true, amount: amount(amt*0.1) }, taxSettings: { enabled: true, type: 'percentage', rate: 7.5 }, date: t, description: 'Discounted order with tax', paymentStatus: 'invoice', invoiceNumber: inv(startIndex+80+i), lineItems: [ { description: 'Order', amount: amount(amt*0.9) } ] } })
  }
  return cases
}

function failureCases() {
  const t = today()
  const cases = []
  // Invalid amounts
  cases.push({ name: 'AR Zero amount', expectStatus: 422, path: '/api/admin/post-invoice', payload: { customerName: 'Bad Co', amount: 0, date: t, paymentStatus: 'invoice', invoiceNumber: inv('Z0'), lineItems: [ { description: 'No value', amount: 0 } ] } })
  cases.push({ name: 'AR Negative amount', expectStatus: 422, path: '/api/admin/post-invoice', payload: { customerName: 'Bad Co', amount: -10, date: t, paymentStatus: 'invoice', invoiceNumber: inv('ZN'), lineItems: [ { description: 'Negative', amount: -10 } ] } })
  // Duplicate VIN
  const dup = `DUP-${Date.now()}`
  cases.push({ name: 'AR Duplicate first OK', expectStatus: 201, path: '/api/admin/post-invoice', payload: { customerName: 'DupCo', amount: 500, date: t, paymentStatus: 'invoice', invoiceNumber: dup, lineItems: [ { description: 'One-off', amount: 500, accountCode: '4020' } ] } })
  cases.push({ name: 'AR Duplicate second 409', expectStatus: 409, path: '/api/admin/post-invoice', payload: { customerName: 'DupCo', amount: 700, date: t, paymentStatus: 'invoice', invoiceNumber: dup, lineItems: [ { description: 'Another', amount: 700, accountCode: '4020' } ] } })
  // AP invalid
  cases.push({ name: 'AP Zero amount', expectStatus: 422, path: '/api/admin/post-expense', payload: { vendorName: 'Zero Inc', amount: 0, date: t, paymentStatus: 'paid', description: 'Zero' } })
  cases.push({ name: 'AP Negative no refund flag', expectStatus: 422, path: '/api/admin/post-expense', payload: { vendorName: 'Neg Inc', amount: -5, date: t, paymentStatus: 'paid', description: 'Negative' } })
  // Malformed dates
  cases.push({ name: 'AP Bad date', expectStatus: 422, path: '/api/admin/post-expense', payload: { vendorName: 'Date Inc', amount: 10, date: '25-01-2025', paymentStatus: 'paid', description: 'Bad date' } })
  cases.push({ name: 'AR Bad date', expectStatus: 422, path: '/api/admin/post-invoice', payload: { customerName: 'Date Co', amount: 100, date: '01/25/2025', paymentStatus: 'invoice', invoiceNumber: inv('BD'), lineItems: [ { description: 'Item', amount: 100 } ] } })
  // Missing names
  cases.push({ name: 'AP Missing vendor', expectStatus: 422, path: '/api/admin/post-expense', payload: { amount: 10, date: t, paymentStatus: 'paid', description: 'No vendor' } })
  cases.push({ name: 'AR Missing customer', expectStatus: 422, path: '/api/admin/post-invoice', payload: { amount: 10, date: t, paymentStatus: 'invoice', invoiceNumber: inv('MC'), lineItems: [ { description: 'Item', amount: 10 } ] } })
  // Unknown account hints (should fallback, still 201 OK)
  for (let i=0;i<6;i++) {
    cases.push({ name: `AP Unknown code fallback #${i+1}`, expectStatus: 201, path: '/api/admin/post-expense', payload: { vendorName: 'Unknown Vendor', amount: amount(Math.random()*100+5), date: t, paymentStatus: 'paid', description: 'Misc', suggestedAccountCode: '9999' } })
  }
  // Balanced invariant stress (craft subtle rounding via heavy discount/tax)
  for (let i=0;i<6;i++) {
    const total = amount(Math.random()*2000 + 300)
    const discount = amount(total * 0.3333)
    const tax = amount((total - discount) * 0.0888)
    cases.push({ name: `AR Rounding stress #${i+1}`, expectStatus: 201, path: '/api/admin/post-invoice', payload: { customerName: 'Rounders', amount: total, date: t, paymentStatus: 'invoice', invoiceNumber: inv(`RS${i}`), subtotal: amount(total - discount), discount: { enabled: true, amount: discount }, taxSettings: { enabled: true, type: 'amount', amount: tax }, lineItems: [ { description: 'Bundle', amount: amount(total - discount) } ] } })
  }
  // Overpaid AP (should be handled with vendor credit)
  for (let i=0;i<6;i++) {
    const amt = amount(Math.random()*300 + 50)
    const paid = amount(amt + Math.random()*50)
    cases.push({ name: `AP Overpaid #${i+1}`, expectStatus: 201, path: '/api/admin/post-expense', payload: { vendorName: 'Overpay Inc', amount: amt, amountPaid: paid, paymentStatus: 'partial', date: t, description: 'Overpaid case', suggestedAccountCode: '6020' } })
  }
  return cases
}

async function run() {
  const valid = [...validApCases(), ...validArCases(100)]
  const failing = failureCases()
  // Ensure exactly 100 valid and 50 failure
  while (valid.length > 100) valid.pop()
  while (valid.length < 100) valid.push(validApCases()[0])
  while (failing.length > 50) failing.pop()
  while (failing.length < 50) failing.push(failureCases()[0])

  const tests = [...valid.map(t => ({ ...t, expectedOk: true })), ...failing.map(t => ({ ...t, expectedOk: false }))]

  const results = []
  for (let i=0;i<tests.length;i++) {
    const t = tests[i]
    try {
      const r = await post(t.path, t.payload)
      const pass = t.expectedOk ? r.ok : (!r.ok && (t.expectStatus ? r.status === t.expectStatus : true))
      results.push({ i: i+1, name: t.name, path: t.path, status: r.status, ok: pass, expectedOk: t.expectedOk, error: r.ok ? undefined : r.json })
    } catch (e) {
      const pass = !t.expectedOk
      results.push({ i: i+1, name: t.name, path: t.path, ok: pass, error: e.message })
    }
    await sleep(20)
  }
  const summary = {
    base: BASE,
    ran: results.length,
    valid_expected: 100,
    failure_expected: 50,
    passed: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    failures: results.filter(r => !r.ok)
  }
  console.log(JSON.stringify({ summary, results }, null, 2))
}

run().catch(e => { console.error(e); process.exit(1) })


