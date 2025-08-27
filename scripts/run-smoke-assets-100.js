/*
  Asset 100-case smoke runner
  - Generates diverse SL assets across tenants, lifespans, residuals, and dates
  - Runs admin depreciation multiple times to simulate catch-ups
*/
import fs from 'fs'
import path from 'path'
import axios from 'axios'

const BASE = process.env.AILEGR_BASE_URL || 'http://localhost:4000'
const JOB = process.env.AILEGR_JOB_KEY || 'dev-job-key'
const H = () => ({ 'X-Job-Key': JOB, 'Content-Type': 'application/json' })
const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10) }
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

async function post(url, body, headers) { return (await axios.post(url, body, { headers })).data }
async function get(url, headers) { return (await axios.get(url, { headers })).data }

async function ensureCat(name) { try { return (await post(`${BASE}/api/asset-categories`, { name }, H())).category } catch { return null } }
async function createAsset(payload) { return (await post(`${BASE}/api/assets`, payload, H())).asset }
async function runAdmin() { return await post(`${BASE}/api/admin/assets/run-depreciation`, {}, H()) }
async function events(id) { return (await get(`${BASE}/api/assets/${id}/events`, H())).events || [] }

async function main() {
  const report = { ts: new Date().toISOString(), total: 100, ok: 0, fail: 0, cases: [] }
  let created = 0
  for (let i = 0; i < 100; i++) {
    const life = [6, 12, 24, 36][i % 4]
    const cost = [300, 600, 1200, 2500, 5000][i % 5]
    const residual = (i % 10 === 0) ? cost + 100 : (i % 7 === 0 ? Math.round(cost * 0.1) : 0)
    const daysAgo = rnd(40, 120) // ensure at least one period matured for most cases
    const name = `Asset-${i}-${Date.now()}`
    try {
      const cat = await ensureCat(`AutoCat-${i % 8}`)
      const asset = await createAsset({ name, vendorName: 'Auto', categoryId: cat?.id, acquisitionDate: day(daysAgo), inServiceDate: day(daysAgo), cost, residualValue: residual, method: 'SL', usefulLifeMonths: life })
      created++
      // Run depreciation 3 times to simulate catch-up windows
      await runAdmin(); await runAdmin(); await runAdmin()
      const ev = await events(asset.id)
      const deps = ev.filter(e => e.type === 'depreciate')
      const expectedMonthly = Math.max(0, (cost - Math.min(residual, cost)) / life)
      const depAmt = deps.length ? Number(deps[0]?.amount || 0) : 0
      const ok = residual >= cost ? deps.length === 0 : deps.length >= 1 && Math.abs(depAmt - expectedMonthly) < 0.01
      report.cases.push({ id: asset.id, tenant: 'dev', life, cost, residual, daysAgo, monthly: expectedMonthly, depCount: deps.length, amount: depAmt, ok })
      if (ok) report.ok++; else report.fail++
    } catch (e) {
      report.cases.push({ id: null, tenant: 'dev', error: String(e?.message || e), ok: false })
      report.fail++
    }
  }
  const dir = path.resolve(process.cwd(), 'tests', 'ASSETS')
  fs.mkdirSync(dir, { recursive: true })
  const fp = path.join(dir, `ASSET_SMOKE_100_${Date.now()}.json`)
  fs.writeFileSync(fp, JSON.stringify(report, null, 2), 'utf8')
  console.log(`100-case asset report: ok=${report.ok}, fail=${report.fail} -> ${fp}`)
}

main()


