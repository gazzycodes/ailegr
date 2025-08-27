import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

async function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

async function runNode(file) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [file], { stdio: 'inherit', env: { ...process.env, AILEGR_JOB_KEY: process.env.AILEGR_JOB_KEY || 'dev-job-key' } })
    p.on('close', (code) => resolve(code))
  })
}

async function main() {
  // Ensure output dir exists
  fs.mkdirSync(path.resolve('tests', 'ASSETS'), { recursive: true })
  // Run smaller suites first
  await runNode(path.resolve('scripts', 'run-smoke-assets.js'))
  await runNode(path.resolve('scripts', 'run-smoke-assets-extended.js'))
  // Run 100-case
  await runNode(path.resolve('scripts', 'run-smoke-assets-100.js'))
  console.log('Asset suites completed. See tests/ASSETS for reports.')
}

main().catch((e)=>{ console.error(e); process.exit(1) })


