// 10-scenario robustness smoke covering recurring, payments/voids, tax+discount, multi-line, refunds, timezone, and backfills
import 'dotenv/config'

const BASE = process.env.VITE_API_URL || 'http://localhost:4000'
const JOB_KEY = process.env.AILEGR_JOB_KEY || 'dev-job-key'
const headers = { 'Content-Type': 'application/json', 'X-Job-Key': JOB_KEY, 'X-Tenant-Id': process.env.AILEGR_SMOKE_TENANT || 'dev' }
const TEST_PREFIX = 'SMOKE-RB-'
function today() { return new Date().toISOString().slice(0,10) }
async function http(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { ...headers, ...extraHeaders }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text(); let data; try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data?.error || data?.message || text}`)
  return { status: res.status, data }
}
async function bootstrap() {
  const name = `${TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2,6)}`
  const r = await http('POST','/api/setup/bootstrap-tenant',{ tenantName: name, role:'OWNER', userId:'robust' })
  headers['X-Tenant-Id'] = r?.data?.tenantId || headers['X-Tenant-Id']
  await http('POST','/api/setup/ensure-core-accounts',{})
}
async function pnl() { return (await http('GET','/api/reports/pnl')).data?.totals || {} }
async function bs() { return (await http('GET','/api/reports/balance-sheet')).data?.totals || {} }
async function tb() { return (await http('GET','/api/reports/trial-balance')).data?.totals || {} }
async function coa() { const r=await http('GET','/api/reports/chart-of-accounts');const m=new Map();(r.data?.accounts||[]).forEach(a=>m.set(String(a.code),Number(a.balance||0)));return m }
function d(a,b,code){return Number(a.get(String(code))||0)-Number(b.get(String(code))||0)}

async function postExpense(opts){
  const body={ vendorName: opts.vendor, amount:String(opts.amount), categoryKey: opts.categoryKey||'OFFICE_SUPPLIES', paymentStatus: opts.status||'unpaid', date: today(), taxSettings: opts.tax||undefined, description: opts.desc||'robust' }
  if (opts.isRefund === true || Number(opts.amount) < 0) body.isRefund = true
  return (await http('POST','/api/expenses',body)).data
}
async function postInvoice(opts){
  const body={ customerName: opts.customer, amount:String(opts.amount), amountPaid:String(opts.paid||0), date: today(), categoryKey: opts.categoryKey||'CONSULTING', paymentStatus: opts.status||'invoice', invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, taxSettings: opts.tax||undefined, lineItems: opts.lines||undefined, description: opts.desc||'robust' }
  return (await http('POST','/api/invoices',body)).data
}
async function recordPayment(invId, amt){ return (await http('POST',`/api/invoices/${encodeURIComponent(invId)}/record-payment`,{ amount:String(amt), date: today() })).data }
async function voidPayment(txId){ return (await http('POST',`/api/payments/${encodeURIComponent(txId)}/void`,{})).data }

async function recurringRun(payload){ return (await http('POST','/api/recurring/run',payload||{})).data }

async function run(){
  const strict = process.argv.includes('--strict-balance')
  console.log('🔧 Health...'); await http('GET','/api/health')
  console.log('🏢 Tenant...'); await bootstrap()
  const startCoa = await coa(); const startP = await pnl(); const startB = await bs(); const startT = await tb()

  // 1) Multi-line invoice across codes + tax
  console.log('1) Multi-line invoice + tax')
  const inv1 = await postInvoice({ customer:`${TEST_PREFIX}C1`, amount:200, paid:0, tax:{enabled:true,type:'percentage',rate:10}, lines:[{ description:'Dev', amount:120, category:'PROFESSIONAL_SERVICES' }, { description:'Product', amount:80, category:'PRODUCT' }] })

  // 2) Partial payments then overpay and void last payment
  console.log('2) Partial + overpay + void')
  const p1 = await recordPayment(inv1.invoiceId, 50); const p2 = await recordPayment(inv1.invoiceId, 200); // now overpaid
  // fetch payments to get tx ids
  const payList = await http('GET',`/api/invoices/${encodeURIComponent(inv1.invoiceId)}/payments`)
  const lastPay = (payList.data||[])[0]; if (lastPay?.id) await voidPayment(lastPay.id)

  // 3) Refund expense (negative)
  console.log('3) Refund expense')
  await postExpense({ vendor:`${TEST_PREFIX}VREF`, amount:-40, status:'paid', categoryKey:'OFFICE_SUPPLIES', isRefund:true })

  // 4) Expense US tax (amount)
  console.log('4) Expense US tax amount')
  await http('PUT','/api/company-profile',{ legalName:`${TEST_PREFIX}Co`, aliases:[], country:'US', timeZone:'UTC', taxRegime:'US_SALES_TAX' })
  await postExpense({ vendor:`${TEST_PREFIX}US`, amount:115, status:'unpaid', tax:{enabled:true,type:'amount',amount:15} })

  // 5) Expense VAT tax (percent)
  console.log('5) Expense VAT tax percent')
  await http('PUT','/api/company-profile',{ legalName:`${TEST_PREFIX}Co`, aliases:[], country:'US', timeZone:'UTC', taxRegime:'VAT' })
  await postExpense({ vendor:`${TEST_PREFIX}VAT`, amount:110, status:'unpaid', tax:{enabled:true,type:'percentage',rate:10} })

  // 6) Recurring DAILY + due terms
  console.log('6) Recurring DAILY due terms')
  const r1 = await http('POST','/api/recurring',{ type:'EXPENSE', cadence:'DAILY', startDate: today(), nextRunAt: new Date(Date.now()-24*60*60*1000).toISOString(), payload:{ vendorName:`${TEST_PREFIX}R1`, amount:'10.00', categoryKey:'OFFICE_SUPPLIES', paymentStatus:'paid', __options:{ dueDays:14 } } })
  await recurringRun({}); await recurringRun({ ruleId: r1.data?.rule?.id })

  // 7) Recurring MONTHLY EOM backfill
  console.log('7) Recurring MONTHLY EOM')
  const lastMonth = new Date(); lastMonth.setDate(1); lastMonth.setMonth(lastMonth.getMonth()-1); lastMonth.setDate(0); const lm = lastMonth.toISOString().slice(0,10)
  const r2 = await http('POST','/api/recurring',{ type:'EXPENSE', cadence:'MONTHLY', startDate: lm, nextRunAt: `${lm}T00:00:00.000Z`, payload:{ vendorName:`${TEST_PREFIX}R2`, amount:'30.00', categoryKey:'OFFICE_SUPPLIES', paymentStatus:'paid', __options:{ endOfMonth:true } } })
  for (let i=0;i<3;i++){ await recurringRun({}); }

  // 8) Recurring WEEKLY nth weekday (target today)
  console.log('8) Recurring WEEKLY target weekday')
  const wd = new Date().getDay()
  const r3 = await http('POST','/api/recurring',{ type:'INVOICE', cadence:'WEEKLY', startDate: today(), nextRunAt: new Date(Date.now()-24*60*60*1000).toISOString(), weekday: wd, payload:{ customerName:`${TEST_PREFIX}R3`, amount:'70.00', amountPaid:'0.00', categoryKey:'CONSULTING', paymentStatus:'invoice' } })
  await recurringRun({});

  // 9) OCR-like expense (no tax)
  console.log('9) OCR-like expense')
  await postExpense({ vendor:`${TEST_PREFIX}OCR`, amount:55, status:'paid', categoryKey:'OFFICE_SUPPLIES' })

  // 10) Large multi-line invoice with discount + tax
  console.log('10) Invoice with discount + tax')
  const inv2 = await postInvoice({ customer:`${TEST_PREFIX}C2`, amount:300, paid:100, tax:{enabled:true,type:'amount',amount:20}, lines:[{ description:'Training', amount:150, category:'TRAINING' }, { description:'Consulting', amount:150, category:'CONSULTING' }] })

  // Reports check
  const endCoa = await coa(); const endP = await pnl(); const endB = await bs(); const endT = await tb()
  const eqOK = Math.abs(Number(endB.totalAssets||0) - Number(endB.liabilitiesAndEquity || (Number(endB.totalLiabilities||0)+Number(endB.totalEquity||0)))) < 0.01 && endB.equationOK
  if (!eqOK && strict) throw new Error('Strict BS equation failed')
  if (!endT.isBalanced) throw new Error('Trial balance not balanced')
  // Basic sanity on COA movements
  const moved = ['6020','6110','1360','2010','2150','4020','1200'].some(code => Math.abs(d(endCoa,startCoa,code)) > 0.01)
  if (!moved) throw new Error('COA deltas did not change as expected')
  console.log('🎉 Robust suite completed successfully')
}
run().catch(e=>{ console.error('❌ Robust suite failed:', e.message); process.exitCode=1 })


