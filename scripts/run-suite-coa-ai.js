// Suite runner: ensures server is running, waits, executes smoke suites, writes to tests/COA_AI
// Usage: node scripts/run-suite-coa-ai.js [suite]
// suite: 100 | 150 (default 100)

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = process.env.BASE_URL || 'http://localhost:4000'
const REPORTS_DIR = 'tests/COA_AI'
const JOB_KEY = process.env.AILEGR_JOB_KEY || 'dev-job-key'
const SHOULD_START = process.env.START_SERVER !== 'false'
const SUITE = process.argv[2] || '100'

async function main() {
  const startAt = Date.now()
  let serverProc = null

  if (SHOULD_START) {
    process.env.EZE_SEED_EXTENDED_COA = process.env.EZE_SEED_EXTENDED_COA || 'true'
    process.env.AILEGR_JOB_KEY = JOB_KEY
    serverProc = spawn('node', ['server/server.js'], { stdio: 'ignore', env: process.env })
    await sleep(2500)
  }

  // Light ping (optional) - skip strict healthcheck; proceed directly
  const reportFile = `${REPORTS_DIR}/coa_smoke_${SUITE}_${new Date().toISOString().replace(/[:.]/g,'-')}.json`
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })

  // Run selected suite script
  const suiteScript = SUITE === '150' ? 'scripts/run-smoke-coa-150.js' : 'scripts/run-smoke-coa-100.js'
  const child = spawn('node', [suiteScript, BASE], { env: { ...process.env, AILEGR_JOB_KEY: JOB_KEY } })
  let out = ''
  let err = ''
  child.stdout.on('data', d => out += d.toString())
  child.stderr.on('data', d => err += d.toString())
  await new Promise((resolve) => child.on('close', resolve))

  if (out) writeFileSync(reportFile, out, { encoding: 'utf8' })
  if (serverProc) try { serverProc.kill() } catch {}

  console.log(`WROTE_REPORT ${reportFile}`)
  if (err) console.error(err)
  console.log(out)
}

main().catch(e => { console.error(e); process.exit(1) })


