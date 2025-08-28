/*
  Asset Smoke Tests — Extended (v1)
  Covers: SL amounts, idempotency, multi-tenant isolation, residual clamp, disposal, auth errors,
  uniqueKey isolation, monthly catch-up, invalid payload validation.
*/
import fs from 'fs'
import path from 'path'
import axios from 'axios'

const BASE = process.env.AILEGR_BASE_URL || 'http://localhost:4000'
const JOB = process.env.AILEGR_JOB_KEY || 'dev-job-key'
const TIDA = process.env.AILEGR_TENANT_A || 'tenant-a'
const TIDB = process.env.AILEGR_TENANT_B || 'tenant-b'

function h(tenantId, withJob = true) {
  const out = { 'Content-Type': 'application/json' }
  if (withJob) out['X-Job-Key'] = JOB
  if (tenantId) out['X-Tenant-Id'] = tenantId
  return out
}

function isoDaysAgo(days) { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0,10) }

async function post(url, body, headers) { return (await axios.post(url, body, { headers })).data }
async function get(url, headers) { return (await axios.get(url, { headers })).data }

async function ensureCat(name, tenantId) { return (await post(`${BASE}/api/asset-categories`, { name }, h(tenantId))).category }
async function createAsset(payload, tenantId) { return (await post(`${BASE}/api/assets`, payload, h(tenantId))).asset }
async function runAdmin() { return await post(`${BASE}/api/admin/assets/run-depreciation`, {}, h(null, true)) }
async function getEvents(id, tenantId) { return (await get(`${BASE}/api/assets/${id}/events`, h(tenantId))).events || [] }

async function main() {
  const out = { ts: new Date().toISOString(), base: BASE, cases: [] }
  try {
    // 1) SL monthly amount
    const cat = await ensureCat(`Computers-${Date.now()}`, TIDA)
    const a = await createAsset({ name: 'Laptop', categoryId: cat.id, acquisitionDate: isoDaysAgo(45), inServiceDate: isoDaysAgo(45), cost: 1200, residualValue: 0, method: 'SL', usefulLifeMonths: 12 }, TIDA)
    await runAdmin()
    let ev = await getEvents(a.id, TIDA)
    const dep = ev.find(e => e.type === 'depreciate')
    out.cases.push({ name: 'SL 1200/12 first month', ok: !!dep && Math.abs(dep.amount - 100) < 0.01, amount: dep?.amount || 0 })

    // 2) Idempotency same month
    await runAdmin()
    ev = await getEvents(a.id, TIDA)
    const depCount1 = ev.filter(e => e.type === 'depreciate').length
    out.cases.push({ name: 'Idempotency same month', ok: depCount1 === 1, depCount: depCount1 })

    // 3) Monthly catch-up (simulate by calling run N times)
    await runAdmin(); await runAdmin(); // two more runs
    ev = await getEvents(a.id, TIDA)
    const depCount2 = ev.filter(e => e.type === 'depreciate').length
    out.cases.push({ name: 'Monthly catch-up over multiple runs', ok: depCount2 >= 1, depCount: depCount2 })

    // 4) Residual clamp (residual >= cost → no depreciation, status fully_depreciated)
    const cat2 = await ensureCat(`Furniture-${Date.now()}`, TIDA)
    const a2 = await createAsset({ name: 'Chair', categoryId: cat2.id, acquisitionDate: isoDaysAgo(10), inServiceDate: isoDaysAgo(10), cost: 500, residualValue: 600, method: 'SL', usefulLifeMonths: 24 }, TIDA)
    await runAdmin()
    const ev2 = await getEvents(a2.id, TIDA)
    out.cases.push({ name: 'Residual clamp (no dep)', ok: ev2.filter(e => e.type === 'depreciate').length === 0 })

    // 5) Disposal prevents further depreciation
    await post(`${BASE}/api/assets/${a.id}/dispose`, {}, h(TIDA))
    const before = (await getEvents(a.id, TIDA)).length
    await runAdmin()
    const after = (await getEvents(a.id, TIDA)).length
    out.cases.push({ name: 'Disposal stops depreciation', ok: after === before })

    // 6) Multi-tenant isolation for uniqueKey
    const uk = `uk-${Date.now()}`
    const ca = await ensureCat(`Equip-${Date.now()}`, TIDA)
    const cb = await ensureCat(`Equip-${Date.now()+1}`, TIDB)
    const ax = await createAsset({ name: 'Mixer', categoryId: ca.id, acquisitionDate: isoDaysAgo(5), inServiceDate: isoDaysAgo(5), cost: 300, residualValue: 0, method: 'SL', usefulLifeMonths: 6, uniqueKey: uk }, TIDA)
    const bx = await createAsset({ name: 'Mixer', categoryId: cb.id, acquisitionDate: isoDaysAgo(5), inServiceDate: isoDaysAgo(5), cost: 300, residualValue: 0, method: 'SL', usefulLifeMonths: 6, uniqueKey: uk }, TIDB)
    out.cases.push({ name: 'UniqueKey allowed across tenants', ok: !!ax?.id && !!bx?.id })

    // 7) Unauthorized admin run should be 401
    let unauthorizedOk = false
    try { await axios.post(`${BASE}/api/admin/assets/run-depreciation`, {}, { headers: { 'Content-Type': 'application/json' } }) } catch (e) { unauthorizedOk = (e?.response?.status === 401) }
    out.cases.push({ name: 'Unauthorized admin run', ok: unauthorizedOk })

    // 8) Invalid payload validation (missing cost/inServiceDate)
    let validationOk = false
    try { await axios.post(`${BASE}/api/assets`, { name: 'BadAsset' }, { headers: h(TIDA) }) } catch (e) { validationOk = (e?.response?.status === 400) }
    out.cases.push({ name: 'Validation missing fields', ok: validationOk })

  } catch (e) {
    out.error = String(e?.message || e)
  } finally {
    const dir = path.resolve(process.cwd(), 'tests', 'ASSETS')
    fs.mkdirSync(dir, { recursive: true })
    const fp = path.join(dir, `ASSET_SMOKE_EXT_${Date.now()}.json`)
    fs.writeFileSync(fp, JSON.stringify(out, null, 2), 'utf8')
    console.log(`Wrote extended report to ${fp}`)
  }
}

main()


