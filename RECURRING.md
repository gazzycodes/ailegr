# Recurring Engine — Product & Technical Docs

This document explains how recurring transactions work end‑to‑end in the app: user flows, cadence semantics, scheduler behavior, timezone handling, accounting impact, testing, and configuration.

## Overview

- Supported documents: Invoices (AR) and Expenses (AP)
- Cadences: Daily, Weekly, Monthly, Annual
- Advanced monthly options: Day of Month (1..31), End of Month, Nth Week + Nth Weekday (e.g., 3rd Friday)
- State machine: Active, Paused (manual or pauseUntil date), Deactivated at endDate
- Scheduler: In‑process interval runner; per‑tenant sweep; idempotent postings
- Timezone: Per‑tenant (IANA). If set, runs at tenant‑local midnight; else server time (UTC midnight)

## User Experience

1) Create a rule
   - Go to Settings → Recurring
   - Click New, choose type (Invoice or Expense), set Party (Customer/Vendor), Amount, Category, Cadence, and options
   - Save. The rule is Active by default, with `nextRunAt` derived from Start Date and cadence options

2) What happens next
   - The scheduler wakes up every X minutes (default 15; configurable) and iterates each tenant
   - For each rule that is due (now ≥ nextRunAt), it posts a transaction and advances `nextRunAt` to the next occurrence
   - Posted documents show up in AR/AP lists and all reports update immediately (accrual accounting)

3) Maintaining rules
   - Pause/Resume a rule at any time
   - Set an End Date; after the next occurrence would pass the end date, the rule deactivates
   - Optional flow controls in payload options: `pauseUntil` (date), `resumeOn` (auto‑resume when date passes)
   - Edit `Next Run` directly if you want to shift the schedule

## Cadence Semantics

All calculations are date‑based and idempotent. Occurrence uniqueness uses the reference pattern: `REC-{ruleId}-{YYYY-MM-DD}`.

### Daily
- Runs every N days (default 1). Option: `intervalDays`

### Weekly
- Runs on a specific weekday (0..6, Sun=0). Option: `intervalWeeks` (default 1)

### Monthly
Evaluation order (first match wins):
1) End of Month: last day of the month
2) Day of Month (1..31): clamps to the month length
3) Nth Week + Nth Weekday: e.g., 3rd Friday (Nth=3, Weekday=5). Nth=5 means “last occurrence”
4) Fallback: same calendar day next month

### Annual
- Adds +1 year (same day). Date clamp rules apply via the underlying JS Date.

### Due Date Terms
- Each rule can optionally specify `dueDays` in `payload.__options` and/or a manual `dueDate`.
- If `dueDate` is provided on the rule, it is used for each occurrence; otherwise the engine computes `dueDate = runDate + dueDays`.
- Default is Net‑0 (dueDays=0). UI exposes both fields; manual due date overrides terms.

### UI/UX (Production)
- The Recurring screens provide:
  - Preset Due Terms (Net 0/14/30/45/60/90) via a theme-aware select, plus a custom days input.
  - Tooltips (InfoHint) explaining Day of month, End of month, Nth week, Nth weekday, Due Terms, and Manual Due Date.
  - Compact actions menu (⋯) per rule with Edit, Pause/Resume, Preview, Force, View Log, Run, Delete.
  - Auto-refresh of the list after operations and when the tab becomes visible; also light periodic refresh while visible.

### Simulation and Force
- Simulate Due: Runs a dry-run across due rules (or a single rule) and returns what would post; no DB changes.
- Force: Posts one occurrence immediately using the scheduled run date (respects dueDays and manual dueDate). Useful for backdating/future-dating tests.
- Cron: On schedule, the same logic is used as Force, so simulation results match production behavior.

## Timezone Handling

- Field: `CompanyProfile.timeZone` (IANA, e.g., `America/New_York`)
- If set, the scheduler computes next occurrences at tenant‑local midnight and stores as UTC `nextRunAt`
- If not set, UTC midnight is used
- UI: Settings → Company Information → Time zone

## Accounting Treatment (Accrual)

- Invoice posting (unpaid): P&L revenue increases; Balance Sheet A/R increases
- Expense posting (unpaid): P&L expense increases; Balance Sheet A/P increases
- Payments: affect Balance Sheet only (Cash, A/R, A/P, Credits); P&L does not change
- Overpay: Customer Credits (2050) increases; underpay: remaining A/R or A/P persists

## Scheduler

- Enable: `AILEGR_RECURRING_CRON=true`
- Interval (minutes): `AILEGR_RECURRING_INTERVAL_MINUTES` (default 15)
- Job Key (required): `AILEGR_JOB_KEY`
- Behavior
  - Per‑tenant sweep every interval with concurrency guard
  - Startup backfill burst (2 quick guarded runs) to catch missed windows
  - Endpoints: `POST /api/recurring/run` accepts `{ dryRun?: boolean, ruleId?: string }`
  - Auto‑resume: if a rule has `resumeOn` in the past, it reactivates
  - PauseUntil: skips until end of the day specified

## API Summary

- `GET /api/recurring` — list active rules
- `POST /api/recurring` — create rule (body includes type, cadence, startDate, payload, and optional options)
- `PUT /api/recurring/:id` — update (supports modifying `nextRunAt`, `endDate`, payload fields)
- `POST /api/recurring/:id/pause` / `.../resume`
- `POST /api/recurring/run` — run due rules (or a specific rule with `ruleId`); honors `dryRun`
- `GET /api/recurring/:id/occurrences?count=3` — preview upcoming dates

## UI (Production vs Dev)

Keep for users:
- Create/Edit rule
- Pause/Resume toggle
- End Date
- Read‑only Next Run / Last Run summary

Hide in production (dev‑only):
- “Run due now”, “Simulate next run”, “Run log”, raw JSON payload helpers

## Testing & Smoke

- `npm run smoke:recurring` runs the end‑to‑end suite against the local server
- Flags:
  - `--strict-balance` for strict balance sheet checks
  - `KEEP_SMOKE_DATA=true` to preserve test data
  - `AILEGR_SMOKE_TENANT` to target a specific tenant
- Scenarios covered: daily/weekly/annual, end of month, nth‑weekday, pauseUntil/resume, endDate, overpaid credits, balanced journal

## Troubleshooting

- Rule didn’t fire: check `nextRunAt` is in the past, rule is Active, and tenant time zone
- Duplicate postings: protected by idempotent reference; if you force multiple runs in the same day, the second is skipped
- Cron didn’t sweep: verify server logs, `AILEGR_RECURRING_CRON=true`, and `AILEGR_JOB_KEY` set

## Roadmap (Optional Enhancements)

- Tenant‑level jitter and Postgres advisory locks for multi‑instance deployments
- Cash‑basis reporting toggle for Dashboard/P&L
- Per‑tenant bill numbering sequence (AP)

