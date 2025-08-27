/*
  Asset Smoke Tests (v1)
  - Requires server running locally
  - Uses X-Job-Key to bypass auth
*/
import fs from 'fs'
import path from 'path'
import axios from 'axios'

const BASE = process.env.AILEGR_BASE_URL || 'http://localhost:4000'
const JOB = process.env.AILEGR_JOB_KEY || 'dev-job-key'
const TENANT_A = process.env.AILEGR_TENANT_A || 'tenant-a'
const TENANT_B = process.env.AILEGR_TENANT_B || 'tenant-b'

function headers(tenantId) {
  const h = { 'X-Job-Key': JOB, 'Content-Type': 'application/json' }
  if (tenantId) h['X-Tenant-Id'] = tenantId
  return h
}

function isoDaysAgo(days) {
  const d = new Date(); d.setDate(d.getDate() - days)
  return d.toISOString().slice(0,10)
}

async function createCategory(name, tenantId) {
  const { data } = await axios.post(`${BASE}/api/asset-categories`, { name }, { headers: headers(tenantId) })
  return data?.category
}

async function createAsset(payload, tenantId) {
  const { data } = await axios.post(`${BASE}/api/assets`, payload, { headers: headers(tenantId) })
  return data?.asset
}

async function runDue() {
  // admin endpoint accepts job key; tenant not required (runs all)
  const { data } = await axios.post(`${BASE}/api/admin/assets/run-depreciation`, {}, { headers: headers() })
  return data
}

async function getEvents(assetId, tenantId) {
  const { data } = await axios.get(`${BASE}/api/assets/${assetId}/events`, { headers: headers(tenantId) })
  return data?.events || []
}

async function main() {
  const report = { ts: new Date().toISOString(), base: BASE, results: [] }
  try {
    // Case 1: Straight-line, 1200/12 → 100 per month
    const catA = await createCategory(`Computers ${Date.now()}`, TENANT_A)
    const a1 = await createAsset({
      name: 'Test MacBook', vendorName: 'Apple', categoryId: catA?.id,
      acquisitionDate: isoDaysAgo(40), inServiceDate: isoDaysAgo(40),
      cost: 1200, residualValue: 0, method: 'SL', usefulLifeMonths: 12
    }, TENANT_A)
    const run1 = await runDue()
    const ev1 = await getEvents(a1.id, TENANT_A)
    const dep1 = ev1.find(e => String(e.type).toLowerCase() === 'depreciate')
    report.results.push({ case: 'SL 1200/12 one month', ok: !!dep1 && Math.abs((dep1?.amount||0) - 100) < 0.01, amount: dep1?.amount || 0, run: run1?.count })

    // Case 2: Idempotency — run again should not produce another depreciation immediately
    const run2 = await runDue()
    const ev2 = await getEvents(a1.id, TENANT_A)
    const months = ev2.filter(e => String(e.type).toLowerCase() === 'depreciate').length
    report.results.push({ case: 'Idempotency (second run, same month)', ok: (run2?.count || 0) >= 0 && months === 1, months, run: run2?.count })

    // Case 3: Multi-tenant isolation — same uniqueKey allowed across tenants (by id uniqueness)
    const catB = await createCategory(`Equipment ${Date.now()}`, TENANT_B)
    const a2 = await createAsset({
      name: 'Test Camera', vendorName: 'Canon', categoryId: catB?.id,
      acquisitionDate: isoDaysAgo(35), inServiceDate: isoDaysAgo(35),
      cost: 600, residualValue: 0, method: 'SL', usefulLifeMonths: 6
    }, TENANT_B)
    const run3 = await runDue()
    const ev3 = await getEvents(a2.id, TENANT_B)
    const dep3 = ev3.find(e => String(e.type).toLowerCase() === 'depreciate')
    report.results.push({ case: 'Tenant B first run', ok: !!dep3 && Math.abs((dep3?.amount||0) - 100) < 0.01, amount: dep3?.amount || 0, run: run3?.count })

  } catch (e) {
    report.error = String(e?.message || e)
  } finally {
    const outDir = path.resolve(process.cwd(), 'tests', 'ASSETS')
    fs.mkdirSync(outDir, { recursive: true })
    const file = path.join(outDir, `ASSET_SMOKE_${Date.now()}.json`)
    fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8')
    console.log(`Wrote report to ${file}`)
  }
}

main()


