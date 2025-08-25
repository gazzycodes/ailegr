COA + AI Smoke Suites

This folder contains machine-run smoke suites that validate COA mappings across AP/AR, including QTY/RATE support.

How to run

1) Ensure dependencies and DB are ready
   - npm install
   - npm run db:generate && npm run db:push

2) Run the 100-case suite (mix of AP/AR happy-paths)
   - AILEGR_JOB_KEY=dev-job-key is used by the runner automatically
   - Command:
     node scripts/run-suite-coa-ai.js 100

3) Run the 150-case suite (100 valid + 50 expected-failure)
   - Command:
     node scripts/run-suite-coa-ai.js 150

What it does

- Starts the embedded server if not already running (auto-seeds extended COA when EZE_SEED_EXTENDED_COA=true)
- Waits ~2.5s for readiness
- Executes the selected suite and writes a timestamped JSON report here
- Also writes last_run_*.log for quick console capture

Expected results

- 100-case: nearly all should be ok (intentional validations may return 422 where appropriate)
- 150-case: 100 valid should be ok; 50 “weird” cases should return explicit 4xx/409 outcomes and be counted as expected-failure

Files

- scripts/run-smoke-coa-100.js — broad AP/AR coverage
- scripts/run-smoke-coa-150.js — 100 valid + 50 expected-failure
- scripts/run-suite-coa-ai.js — orchestrator/runner

Notes

- Admin endpoints bypass auth using X-Job-Key; set AILEGR_JOB_KEY for CI or local runs
- Reports are JSON and can be archived for trend analysis

