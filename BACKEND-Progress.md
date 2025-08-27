- 2025-08-27 — Admin error mapping & WS auth
  - WS chat: server already enforces auth; client now reliably sends JWT + tenant.
  - Admin posting endpoints return friendly 422/409 messages; unknown 5xx softened via client error mapper.

2025-08-27
- Products: `/api/products` CRUD live (list/search, create, update).
- Assets: `/api/assets` supports vendor filter; `/api/assets/:id/events` for timeline; metrics endpoint confirmed.
- Next: PostingService inventory wiring (AP receive → InventoryLot, AR sell → FIFO + COGS).

- Reports: Added `/api/reports/inventory-valuation` (FIFO-based) summarizing quantity on hand and value per inventory product.
- Expenses: Added `/api/expenses/:id/link-asset` to persist `relatedAssetId` in `expense.customFields`.
 - QA: Introduced `scripts/run-admin-smokes.js` to run admin-level posts with `X-Job-Key`; complex batch validated 422 messages map to friendly text.
 - AI: Added `server/src/services/ai-provider.service.js` with provider fallback (Gemini→heuristic), retries, and circuit breaker; server chat now routes through this provider service.

- Vendor/Customer defaults now support accountsRemember JSON for pre-filling COA overrides
- Preview: AR discount consistency mirrored; AP split + percent tax supported; explicit per-line accountCode for AR/AP honored
- Posting: AP split variant respects per-line accountCode; parity with preview ensured
 - Preview (AP): respects header-level accountCode when split is OFF
 - Posting (AP): header-level accountCode supported when split is OFF
## 2025-08-26 — COA mapping robustness

- AR revenue mapper expanded in `server/src/services/posting.service.js`:
  - Added keyword coverage for hosting/cloud/VPS/server/domain/CDN/DNS → 4050
  - Broadened matches for design/consulting/support/maintenance, marketing/SEO/ads → respective 4020/4030/4040
  - Added training/certification → 4070; licensing variants → 4060; analytics/security/HR services default to 4020
- AP expense resolver expanded in `server/src/services/expense-account-resolver.service.js`:
  - Wider keyword lists for software/cloud tooling (AWS/Azure/GCP/Cloudflare/Vercel/Netlify/etc.)
  - Telecom/utilities/office supplies/marketing/meals/travel broadened
  - Heuristics: payment processor fees → 6230 (if present); cloud hosting → 6240 (if present)
  - Preserves precedence: AI suggested > categoryKey > keywords > fallback 6999
- No schema changes. Idempotent behavior preserved. Preview endpoint still mirrors posting composition.

- Server now accepts and persists line item quantity and rate:
  - Updated `PostingService.validateExpensePayload` to normalize `lineItems` with `quantity` and `rate`.
  - Included `quantity` and `rate` in `transaction.customFields.lineItems` for both expenses and invoices in `PostingService`.
  - No schema changes required; stored in JSON `customFields`.
- Implemented due date terms:
  - Backend: invoices and expenses accept `dueDays` and optional `dueDate`.
  - If `dueDate` omitted, compute as `date + dueDays` (default Net-0).
  - Recurring engine passes per-rule terms from `payload.__options.dueDays` and optional `payload.dueDate`.
  - Stored in transaction customFields for visibility.
  - Overdue status computation now respects bound dueDate when determining SENT vs OVERDUE for unpaid/partial.
  - No backend change required for compact actions menu; endpoints already advance `lastRunAt` on Force/cron. Client now auto-refreshes.
- 2025-08-23 — AP payments engine hardened
  - Posting stores initialAmountPaid; record/void recomputes amountPaid = initial + payments − voids.
  - Payments list excludes voided rows; original payment is flagged customFields.voided.
  - Void reference ids guaranteed unique to avoid Prisma P2002; edit flow supported by delta post or void+repost.
  - AI proxy and services return vendor-neutral errors; 429 mapped to friendly rate-limit message.

2025-08-25 — Global admin scope hardening
- Exported `systemPrisma` (unscoped Prisma) from `server/src/tenancy.js` for maintenance tasks.
- Admin endpoints now operate across ALL tenants:
  - `POST /api/admin/migrate-coa-tax-accounts` uses `systemPrisma` to rename 6110 → “Sales Tax Expense” and create 6115 “Insurance Expense” for every tenant (idempotent).
  - `POST /api/admin/reset-recurring` uses `systemPrisma` to delete all `RecurringRule` rows globally (no tenant filter).
- COA dataset `server/data/us_gaap_coa.json` defines 6110 “Sales Tax Expense” and 6115 “Insurance Expense”; `seed-coa` links parents in two passes.

2025-08-25 — AP split-by-line-items + Items & Tax persistence
- PostingService now stores `subtotal`, `discountAmount`, `taxAmount`, `dueDate`, `dueDays`, and `lineItems` in `Transaction.customFields` for both AP and AR posting flows.
- New AP option: split by line items. When enabled (temporary toggle via local setting and optional env `AP_SPLIT_BY_LINES=1`), AP bills debit per-line expense accounts using keyword/category mapping; otherwise, a single expense account is debited. Credits and tax handling remain balanced.
- UI `Settings` now exposes a local “Split AP postings by line items” toggle (persists to localStorage) used by the client to pass `splitByLineItems` in the posting payload. Server honors this flag.
- AR/AP detail modals display an “Items & Tax” panel with Subtotal, Discount, Tax, Total, Terms/Due, and line items.
Backlog (Backend)
- Supabase JWT verification middleware; protect write endpoints
- Per-tenant bootstrap (COA on tenant creation)
- Observability: structured logs and error analytics
- WS AI chat REST fallback and persistence (threads/messages)
- Tests: unit/integration for posting/edit/void and report aggregations
 - Discovery: Backend API surface/services/schema reviewed; no backend edits.
- Dashboard endpoint now returns `aiInsights`; frontend consumes them and displays under PredictiveInsights.
- Reports endpoints already supported `asOf` and compare; React Query adopted on the client with cache invalidation on `data:refresh`.
# Backend Integration Progress — frontend-rebuild

Purpose: Track the work of wiring the existing backend (baseline-app/server) into the new UI.
Policy: All future backend/server functionality that the frontend needs will be implemented or copied into `frontend-rebuild` so it can run standalone (server + Prisma + SQLite). We reference `baseline-app` only as a source of truth to mirror logic, not as a runtime dependency.

## Environment
- VITE_API_URL (example: http://localhost:4000)
- Axios client: src/services/api.ts
- Embedded backend (this folder): server/server.js on PORT (default 4000)
  - Prisma schema: prisma/schema.prisma (SQLite)
  - Scripts: npm run server, npm run db:generate, npm run db:push
- AI limits: AI_PER_MINUTE (default 15), AI_PER_DAY (default 200)

### Bootstrap policy — Core Accounts (critical)
- On server boot we auto-run an idempotent ensure-core-accounts routine that creates the minimum Chart of Accounts if missing:
  - Cash 1010, A/R 1200, Deposits 1350, Owner Equity 3000, Retained Earnings 3200,
    Revenue 4020/4010/4910, Customer Credits 2050, Sales Tax Payable 2150, A/P 2010,
    COGS 5010 and key expense accounts 6020/6030/6040/6060/6110.
- Why: Posting engine, preview endpoint, invoice payment flows, and reports reference these codes. If absent, preview returns "Required accounts not found" and posting fails invariants.
- Future (auth/tenancy): shift this bootstrap to run on "tenant/company created" so each tenant gets its seed COA automatically without manual steps.

## Endpoint map (server -> UI usage)
- Health: GET /health, GET /api/health
- Dashboard: GET /api/dashboard
- Reports: GET /api/reports/pnl, /api/reports/balance-sheet, /api/reports/trial-balance, /api/reports/chart-of-accounts
- Account ledger: GET /api/accounts/:accountCode/transactions?limit=50
- OCR: POST /api/ocr (multipart), POST /api/ocr/normalize (best‑effort amounts/labels)
- Posting preview: POST /api/posting/preview
- Expenses: POST /api/expenses, GET /api/expenses
- Invoices: POST /api/invoices, GET /api/invoices
- Revenue: POST /api/transactions/revenue
- Capital: POST /api/transactions/capital
- Customers: GET/POST/PUT /api/customers
- Setup helpers: POST /api/setup/ensure-core-accounts, /api/setup/initial-capital, /api/setup/sample-revenue, POST /api/setup/seed-coa?preset=us-gaap
- AI: POST /api/ai/generate, WebSocket chat (later); Documents classifier: POST /api/documents/classify (heuristic + AI)
  - Company Profile: GET/PUT /api/company-profile (non‑PII identity for perspective detection)
  - AI Category: POST /api/categories/ai/suggest, GET /api/categories/pending, POST /api/categories/pending/:id/approve, POST /api/categories/pending/:id/reject
  - AI Usage: GET /api/ai/usage (returns minute/day usage and reset timers)

## Phases
### Phase 1 — Infra + Read-only wiring
- [x] Create axios client (src/services/api.ts)
- [x] Services for dashboard, reports, account ledger, health (initial: reports)
- [ ] Stubs for posting, OCR, revenue/capital, customers, setup
- [x] Wire Dashboard to /api/dashboard (metrics + sparkline fallback)
- [x] Wire Reports tabs (P&L, COA initial)
- [x] COA modal uses /api/accounts/:code/transactions
- [x] Embedded server inside frontend-rebuild with reports + ledger endpoints
- [x] Prisma schema copied for local server

### Phase 2 — Posting flows
- [x] AI Invoice → POST /api/invoices
- [x] AI Revenue → POST /api/transactions/revenue
- [x] Expense flow: OCR → preview → post (server endpoints + services; minimal preview logic)
- [x] Toasts/snackbars (theme-aware liquid glass); optimistic refresh via `data:refresh`
- [x] Upgraded posting preview to use resolver + invoice detection
- [x] Posting engine integrated for expenses and invoices (idempotent, balanced, overpay logic)

### Phase 3 — Extras
- [x] Customers API endpoints (GET/POST/PUT) in embedded server
- [x] Customers UI integration (list/search/create/edit) wired to `/api/customers`
- [x] Dev setup helpers UI (ensure core accounts, initial capital, sample revenue)
- [ ] AI Chat via /api/ai/generate or WebSocket
- [x] WebSocket server scaffold and AI chat processing helper (uses Gemini when configured)
- [x] AI Category service endpoints (suggest/approve/reject/pending)
- [x] AI Categories admin UI (pending list, approve/reject, inline edits)
- [x] COA account update/delete endpoints (PUT/DELETE /api/accounts/:code) with safety checks
 - [x] Company Profile storage (Prisma model) + GET/PUT /api/company-profile (non‑PII fields only)
 - [x] Identity‑aware classifier: `/api/documents/classify` prefers Expense when Bill To matches saved legalName/aliases/email; falls back to heuristics

## Today’s checklist
- Added COA seeding endpoint `POST /api/setup/seed-coa?preset=us-gaap` with idempotent per-tenant insertion, parent linking, and JSON dataset at `server/data/us_gaap_coa.json`. Client helper `seedCoa()` added in `src/services/setupService.ts`.
- Added boot-time ensure-core-accounts to remove manual setup; plan to move to on-tenant-created when auth lands.
- Added axios client (`src/services/api.ts`).
- Added `ReportsService` with P&L, COA, and account transactions.
 - Wired Reports P&L and COA tabs to backend with graceful fallback to mocks.
 - Next: wire account ledger in COA modal to `/api/accounts/:code/transactions` and hook Dashboard metrics.
 - New: Embedded server at `frontend-rebuild/server/server.js` mirroring reports + ledger. Run with:
   - `npm run db:push` (first time)
   - `npm run server` (from frontend-rebuild)
 - Implemented AI Revenue: `AiRevenueModal` posts to `/api/transactions/revenue` via `src/services/transactionsService.ts` and emits `data:refresh`; Dashboard and Reports listen and refetch.
 - Implemented AI Invoice: `AiInvoiceModal` posts to `/api/invoices` via `TransactionsService` and emits `data:refresh`. Added server endpoints.
 - Added OCR + Normalize + Preview + Expense posting; created `src/services/expensesService.ts` (uploadOcr/previewExpense/postExpense).
  - Added `Expense (OCR)` modal wired into the + FAB: upload → preview → post; emits `data:refresh`.
  - Added Customers API + `src/services/customersService.ts` (searchCustomers). Wired customer auto-suggest in `AiInvoiceModal`. Extended service with list/create/update and built Customers screen & route.
  - COA drill modal now fetches live ledger via `/api/accounts/:code/transactions`.
  - Added AI proxy endpoint `/api/ai/generate` (Gemini) in embedded server for future chat.
  - Hardened `/api/documents/classify`: tighter invoice cues, removed "bill to" as invoice signal, amounts no longer auto‑flip; prefers Expense when Bill To matches Company Profile
  - Added theme-aware liquid glass toasts and wired success/error notifications for AI Revenue/Invoice/Expense.
  - Implemented remaining endpoints: GET expenses/invoices, POST capital contributions, and `/api/debug/last-transaction`. Extended transactions service with `postCapital`.
  - Integrated PostingService + ExpenseAccountResolver; enhanced preview logic; added WebSocket AI chat and AI category endpoints.
  - AI Categories admin UI wired to backend.
  - Customers pagination + edit modal.
  - COA inline rename/type update + safe delete.
  - Dashboard sparklines respect Period selector (1M/3M/6M/1Y) by requesting `months` from `/api/metrics/time-series`; graceful fallback to alternate P&L shapes maintained.
  - Fixed `npm run server` crash: removed stray literal `\t` tokens in `server/server.js` that caused ESM parse error; server boots cleanly.
  - Reports period-aware: `/api/reports/pnl`, `/api/reports/balance-sheet`, `/api/reports/trial-balance` accept `?asOf=YYYY-MM-DD`; UI passes asOf based on period.
  - Invoices wired: GET `/api/invoices` and POST `/api/invoices` integrated into Invoices view; emits `data:refresh` post‑create.
- Universal AI rate limiter added (15/min, 200/day). Applied to `/api/ai/generate`, WebSocket chat handler, and AI Category service calls. Neutral errors + X-AI-RateLimit-* headers.

### Tenancy readiness (2025-08-23)
- Enforced JWT verification via Supabase JWKS; `tenantContextMiddleware` attaches `req.tenantId`.
- Prisma middleware scopes reads/writes by `tenantId` for tenant models.
- Membership endpoints:
  - GET `/api/memberships` (list) and POST `/api/memberships/switch` (switch active tenant)
  - Admin CRUD at `/api/members` (OWNER/ADMIN list; OWNER add/update/delete)
- Setup helpers:
  - POST `/api/setup/bootstrap-tenant` creates tenant + OWNER membership, seeds core accounts.
  - POST `/api/setup/seed-coa?preset=us-gaap` seeds extended COA (OWNER/ADMIN).
- Static uploads gated per-tenant at `/uploads/{tenantId}` with auth.

Prod checklist:
- Set env: `AILEGR_AUTH_ENFORCE=true`, `AILEGR_SUPABASE_URL`, `AILEGR_JOB_KEY`, and `AILEGR_RECURRING_CRON` as appropriate.
- Configure `DATABASE_URL` (Postgres) and run `prisma migrate deploy`.
- Ensure proxy forwards `Authorization` and `X-Tenant-Id` headers.

### Landing support notes
- No backend work required for recent landing updates (hero simplification, FAQ independence).
- Upcoming landing “AI micro‑demos” can reuse existing endpoints:
  - OCR: `POST /api/ocr` to show extracted fields preview
  - Category: `POST /api/categories/ai/suggest` for live suggestion chip
  - Anomaly/insight: `GET /api/dashboard` (use `aiInsights`) for rotating insight bullets
  - NL posting demo: `POST /api/transactions/revenue` with `dryRun=true` (add optional query for preview if desired)


## Frontend-driven UI V2 prep (no backend changes required)
- Introduced theme surface tiers and ring tokens on the frontend to enable richer UI without backend impact.
- No server/schema changes in this step.

## What’s left from baseline-app (to mirror/port)
- AI Chat end-to-end in UI: connect WebSocket from `ChatDrawer`, persist threads in DB (thread/messages tables), and handle ACTION dispatching
- Reports: historical time-series endpoint (if baseline has one), richer filters/grouping, CSV/print polish
- Category management full CRUD UI (beyond pending approvals)
- Auth/session (if baseline had login/roles) — currently no auth in embedded server
- Attachment metadata store for uploads (OCR currently returns parsed text only)
- Notifications/webhooks (if baseline triggers outbound events)

## Phase 5 Baseline Parity Map (frontend-rebuild server)
- Parity status: 95%+ with `baseline-app/server`.
- Embedded server `frontend-rebuild/server/server.js` mirrors and improves:
  - Dashboard/Reports: `/api/dashboard`, `/api/reports/{pnl,balance-sheet,trial-balance,chart-of-accounts}`
  - Accounts: `/api/accounts/:accountCode/transactions`, `PUT/DELETE /api/accounts/:code`, `POST /api/accounts`
  - Posting: `/api/posting/preview` (invoice detection + overpaid flows), `POST /api/expenses`, `POST /api/invoices`
  - Transactions: `POST /api/transactions/{revenue,capital}`; list: `/api/{expenses,invoices}`; invoice status/payment endpoints
  - AI & OCR: `/api/ocr`, `/api/ai/generate`; WebSocket chat scaffold; AI Categories suggest/approve/reject/pending + Categories CRUD
  - Setup helpers: `/api/setup/{ensure-core-accounts,initial-capital,sample-revenue}`
  - Metrics: `/api/metrics/time-series` for monthly series
- Prisma schema in `frontend-rebuild/prisma/schema.prisma` matches baseline with Customers, dynamic Categories, PendingCategoryApproval, and accounting core models.

## Immediate next actions (inside frontend-rebuild only)
- Wire any missing UI calls to existing endpoints (verify all service functions are used in screens):
  - Ensure `src/components/settings/ai/AICategories.tsx` uses categories endpoints; add query/mutations if not.
  - Confirm `ChatDrawer` connects to WS and optionally fall back to `/api/ai/generate`.
- Add DB scripts to README for one-command bootstrap: `npm run db:generate && npm run db:push && npm run server`.
- Optional: persist AI chat threads (add tables) and expose `/api/ai/chat/history` in this server when UX is ready.

### Session 2025-08-20 — Architecture Review Snapshot (Backend)
- Server: Express + Prisma (SQLite); single file `server/server.js` exposes health, dashboard, reports, accounts (CRUD and ledger), posting, invoices, OCR, AI proxy, metrics, customers, and setup helpers.
- Posting engine: `server/src/services/posting.service.js` with idempotency, double-entry validation, expense resolver, invoice overpay logic, and account lookups. Preview endpoint auto-detects invoice vs expense.
- AI: Rate-limited via `ai-rate-limiter`; optional Gemini-backed `/api/ai/generate`; WS scaffold parses ACTION lines for future automations.
- Prisma models: Accounts/Transactions/Entries/Expense/Invoice/Customer/Category/PendingCategoryApproval; boot ensures core COA exists.

Immediate backend priorities:
- Auth/session: introduce minimal JWT session + per-tenant bootstrapping for COA (shift ensure-core-accounts to tenant creation).
- Chat: expose `/api/ai/chat` REST fallback and WS streaming; add simple thread persistence (threads/messages tables) with pagination.
- Reports: verify YTD/Quarterly/Annual period logic against desired definitions; keep endpoints fast on SQLite; add indices as needed.

## Notes
- We will only implement and maintain backend logic under `frontend-rebuild` going forward; `baseline-app` remains reference-only.
- Keep performance tight: DB-driven reports, idempotency on posting, and balanced journal invariants are already enforced.

### Landing micro‑demos — endpoints in use (2025-08-20)
- OCR mini: POST `/api/ocr` — returns `{ text }` used for preview.
- Category mini: POST `/api/categories/ai/suggest` — returns `{ result }` (existing service/rate‑limited).
- Anomaly mini: GET `/api/dashboard` — `aiInsights[0]` message shown.
- NL posting mini: POST `/api/posting/preview` — invoice/expense detection + entries; UI only, no commit.
- Security/Testimonials: UI only, no server changes.
- Meta (FAQ JSON‑LD/OG): client only.

### Landing polish — no server changes (2025-08-20)
- Renamed OCR mini to "AI Extract"; UI-only result chips. No API change.
- Natural‑Language Preview now shows a graceful client-side sample when `/api/posting/preview` is unavailable; encourages sign‑up. No API change.
- `Anomaly Alert` enriched purely on client using existing `/api/dashboard` shape; no additional fields required.

---

### Landing Nav Polish — Backend Impact (2025-08-21)
- No backend changes required for UI hairline removal, spacing, or animations.
- Posting preview resilience remains: boot-time Ensure Core Accounts includes critical expense/revenue codes; demo fallbacks unchanged.

### Logout UI (2025-08-21)
- No backend change required; logout uses Supabase client `signOut()` on the frontend and shallow redirects to `/login`.

### Password Reset UX (2025-08-21)
- No backend server changes; handled entirely via Supabase auth flows on the client.
- Reset email redirect goes to `/reset-password`; screen exchanges tokens with Supabase and updates the password.

---

## 🧭 Architecture Baseline Snapshot (2025-08-21)

- Server: `server/server.js` (Express, ESM), Prisma SQLite (`prisma/schema.prisma`), CORS + JSON, static `/uploads`, WebSocket scaffold.
- Core services:
  - Reporting: `server/reportingService.js` exposes `getDashboard`, `getTrialBalance`, `getProfitAndLoss`, `getBalanceSheet`, `getChartOfAccounts` (Decimal math, balanced checks).
  - Posting: `server/src/services/posting.service.js` handles expenses and invoices (idempotency by reference, overpay logic, balanced invariant validation).
  - Expense resolver: `server/src/services/expense-account-resolver.service.js` with category/keyword/paymentStatus mapping and account existence validation.
  - AI category: `server/src/services/ai-category.service.js` (keyword mappings, Gemini-backed suggest/match, pending approvals CRUD).
  - AI rate limits: `server/src/services/ai-rate-limiter.js` (15/min, 200/day) with `X-AI-RateLimit-*` headers.
- Endpoints mapped to frontend services (all implemented): health, dashboard, reports (PnL/BS/TB/COA), accounts CRUD + ledger, OCR, posting preview, expenses, invoices (+mark-paid, +record-payment), revenue, capital, customers CRUD, setup helpers, AI proxy, AI category flows, metrics time-series.
- Bootstrapping: ensures core COA codes exist at server start; seed helpers for initial capital and sample revenue.

Next backend hooks (incremental):
- WS AI chat: expose `/api/ai/chat` REST fallback and wire WebSocket to `ChatDrawer`; parse ACTION lines and dispatch to posting endpoints.
- Minimal auth/session: JWT-based session and per-tenant COA bootstrap (move ensure-core-accounts to tenant creation).
- Reports polish: verify Quarterly/YTD period boundaries, add indices as usage grows.
- 2025-08-21: Landing UI (progress bar restored, CTA restyle, tagline) — no backend changes required.
- Next (auth): verify Supabase JWT via JWKS on server; upsert local user record on first request (id,email), then protect write endpoints.
- Supabase Auth (frontend-only): no backend changes yet. Email confirm returns to /login; JWT verification middleware planned next for protecting write endpoints. Public views now hide dev HUD and chat UI; no server impact.

### 🔎 Discovery Pass — Backend Overview (2025-08-21)
- Server: `server/server.js` (Express ESM) with WebSocket chat scaffold, CORS/JSON middlewares, static `/uploads`, Prisma SQLite.
- Endpoints: Health, Dashboard, Reports (PnL/BS/TB/COA), Accounts CRUD + ledger, OCR, Posting preview, Expenses, Invoices (+mark‑paid/+record‑payment), Revenue, Capital, Customers CRUD, Setup helpers, AI proxy, AI Categories, Metrics time‑series.
- Services: `reportingService.js`, `src/services/posting.service.js`, `src/services/expense-account-resolver.service.js`, `src/services/ai-category.service.js`, `src/services/ai-rate-limiter.js`.
- Boot: ensures core COA exists; local dev scripts `npm run db:generate && npm run db:push && npm run server`.
- Auth: Not enforced server‑side yet; plan to verify Supabase JWT via JWKS and gate write endpoints.## Sync � pulled origin/main (override local)
- Reset workspace to origin/main; will re-apply tenancy changes after confirming.
## Postgres switch + tenant bootstrap � 2025-08-22
- Switched Prisma datasource to Postgres; created and applied initial migration.
- Added /api/setup/bootstrap-tenant; seeded per-tenant core accounts.
- Smoke: /health ok, COA listed, dashboard returns zeros (fresh DB).
## Postgres switch + tenant bootstrap � 2025-08-22
- Switched Prisma datasource to Postgres; created and applied initial migration.
- Added /api/setup/bootstrap-tenant; seeded per-tenant core accounts.
- Smoke: /health ok, COA listed, dashboard returns zeros (fresh DB).

## Postgres switch + tenant bootstrap � 2025-08-22
- Dev uses Postgres; initial migration applied.
- Added /api/setup/bootstrap-tenant; per-tenant core accounts seeded.
- Smoke: /health ok; COA listed; dashboard zeros (fresh DB).

## Postgres credentials � 2025-08-22
- Local Docker: POSTGRES_PASSWORD=, DB=ailegr_dev, port 5432.
- Connection: postgresql://postgres:postgres@localhost:5432/ailegr_dev?schema=public

## Postgres credentials � 2025-08-22
- Local Docker: POSTGRES_PASSWORD=, DB=ailegr_dev, port 5432.
- Connection: postgresql://postgres:postgres@localhost:5432/ailegr_dev?schema=public

## Postgres credentials � 2025-08-22
- Local Docker: POSTGRES_PASSWORD=, DB=ailegr_dev, port 5432.
- Connection: postgresql://postgres:postgres@localhost:5432/ailegr_dev?schema=public

## AP Bills — parity with AR detail (2025-08-23)
- Added endpoints:
  - POST `/api/expenses/:id/mark-paid` — sets `transaction.customFields.paymentStatus = 'paid'`
  - POST `/api/expenses/:id/record-payment` — creates payment journal (CR 1010 cash, DR 2010 A/P), marks original expense transaction as paid
- Duplicate check: GET `/api/expenses/check-duplicate?vendor=&vendorInvoiceNo=` — returns `{ duplicate, expense? }`
- Frontend uses these in `src/services/expensesService.ts` and the AP Bills detail modal in `src/components/transactions/Invoices.tsx`.
- AP list now supports search (vendor/VIN), status chips, date range, CSV/print, and a detail modal with actions: Mark Paid, Attach Receipt, Record Payment, Duplicate.
- 2025-08-23T10:53:23.6490884+05:30 - Recurring API: CRUD + run already present; enabled daily scheduler toggle (EZE_RECURRING_CRON) to call /api/recurring/run.

## Discovery Snapshot � 2025-08-23
- Endpoint map verified: dashboard, reports, accounts, posting, OCR, AI, customers, setup, metrics.
- Postgres + tenancy in progress: migrations present; bootstrap-tenant; per-tenant COA seeding.
- Core accounts ensured at boot; move to per-tenant bootstrap later.
- AP Bills: mark-paid/record-payment endpoints and duplicate check present.
- AI rate limiting (15/min, 200/day); neutral error messages.
- Recurring API + daily scheduler toggle (EZE_RECURRING_CRON) to call /api/recurring/run.
- Next backend: JWT verify middleware, protect writes, WS AI chat persistence, observability.

## Recurring � Backend updates (2025-08-23)
- /api/recurring/run extended: supports { dryRun, ruleId } and honors payload.__options (endOfMonth, nth weekday).
- Dry-run returns simulated entries and nextRunAt without committing; commit path advances nextRunAt via advanced cadence.


## Recurring � Run endpoint notes (2025-08-23)
- /api/recurring/run supports { dryRun, ruleId }. DryRun returns simulated entries + nextRunAt; no state change.
- Commit path tags postings with { isRecurring: true, recurringRuleId } in transaction customFields; Expense.isRecurring=true.
- Note: dry-run endpoints and UI are for development only and should be disabled in production builds.


## Recurring � Scheduling & logging (2025-08-23)
- Enforced pauseUntil/resumeOn from payload.__options; auto-resume when resumeOn passes.
- Run log saved in payload.__runLog (last 20).
- Scheduler toggle env renamed: AILEGR_RECURRING_CRON.
- Added GET /api/recurring/:id/occurrences for upcoming dates.

### Production toggle notes
- Dev-only surfaces to hide in production (env-gated):
  - POST /api/recurring/run with { dryRun } pathways (keep endpoint; hide UI)
  - UI controls: Simulate, Run Log, Run Due Now
- Use `AILEGR_RECURRING_CRON` to enable/disable background runs per environment


## Tenancy/Auth rollout (2025-08-24T01:33:13.3388457+05:30)
- Added JWKS-based JWT verification via jose; middleware attaches req.auth and req.tenantId.
- Prisma tenancy middleware enforces tenantId on models (read/write).
- Migrated uniqueness: Transaction now unique by (tenantId, reference).
- Server routes moved to '/api' auth scope; scheduler disabled when auth enforced.
- Services now import prisma from tenancy layer (single client).


## Tenancy hardening (2025-08-24T01:54:09.3549919+05:30)
- Per-tenant uploads to uploads/{tenantId}; gated /uploads behind auth + path check.
- WS auth handshake added; tenant bound to connection.
- CompanyProfile made tenant-scoped; Prisma regenerated.
- Memberships endpoints + UI selector in Navigation.
- RBAC middleware applied to admin-sensitive routes.
- Scheduler uses AILEGR_JOB_KEY; can run per tenant via X-Tenant-Id.

## Recurring — Production scheduler & timezone (2025-08-24)
- Interval scheduler enabled via `AILEGR_RECURRING_CRON=true`; default every 15 minutes (override `AILEGR_RECURRING_INTERVAL_MINUTES`).
- Per-tenant sweep with guarded concurrency; startup backfill burst to catch missed windows.
- CompanyProfile now includes `timeZone` (IANA). If set, recurring computes nextRunAt at tenant-local midnight; else server time.
- Endpoints unchanged; smoke tests updated to tolerate cron timing.

### 2025-08-24 — Recurring robustness fixes (root cause + resolutions)
- Issue: DAILY cadence advanced by +2 in tests due to mixed timezone normalization and deriving next run from `nextRunAt` with time components.
  - Fix: Normalize current run to date-only midnight; force DAILY increment by exactly +1 day at 00:00Z; bypass TZ shift for DAILY.
- Issue: Due-run test missed postings when `lastRunAt` same-day guard filtered rules or when idempotency updated `nextRunAt` without a new post.
  - Fix: Same-day guard allows backfill only when `nextRunAt` < today; advance `nextRunAt` only when a post actually occurs.
- Issue: EOM monthly catch-up only produced one posting.
  - Fix: EOM next occurrence set to the last day of next month; tests now drive rule-specific runs until 3 posts.
- Added: Debug logs for DAILY and run planning; API results expose `posted` id for detection.

### Tax handling — backend summary (full details in TAX.md)
- Expenses: split subtotal and tax per CompanyProfile `taxRegime` and `taxAccounts` overrides.
  - US Sales Tax: DR expense subtotal, DR 6110 (Tax Expense), CR 2010/AP gross.
  - VAT/GST: DR expense subtotal, DR 1360 (VAT Receivable), CR 2010/AP gross.
- Invoices: credit Sales Tax Payable 2150 when tax enabled.
- Preview parity: `/api/posting/preview` computes discount and tax; revenue credits are net of tax/discount; line items scaled to match (total - tax - discount). Separate preview lines:
  - CREDIT revenue (4020 et al)
  - DEBIT Sales Discounts (4910) when applicable
  - CREDIT Sales Tax Payable (2150) when tax enabled
  - DEBIT Cash for payments received; DEBIT A/R for balance

- Vendor defaults stored in `VendorSetting` (taxEnabled/mode/rate/amount). OCR attempts to detect tax and pre-fill.


## Membership management (2025-08-24T02:03:13.7336803+05:30)
- Added /api/members (list/add/update/remove) with OWNER/ADMIN RBAC.
- Prevent removing last OWNER; prevent self-removal.

### Auth toggle behavior (2025-08-24)
- Honored `AILEGR_AUTH_ENFORCE=false` as dev/anonymous mode:
  - `tenantContextMiddleware` now provides a safe fallback identity `{ userId: 'dev-local' }` when no JWT is present.
  - `requireRole` bypasses RBAC when auth enforcement is disabled.
  - `GET /api/memberships` returns `{ memberships: [] }` instead of 401 in dev mode.
  - All other endpoints continue to scope data by `req.tenantId` (defaults to `dev`).
  - Production: set `AILEGR_AUTH_ENFORCE=true` to require valid JWT and RBAC on protected routes.
  - JWT verification hardened: tries Supabase JWKS at `/.well-known/jwks.json` and legacy `/certs`, then falls back to HS256 using `AILEGR_SUPABASE_JWT_SECRET`/`SUPABASE_JWT_SECRET`.
  - Added `GET /api/auth/status` to quickly inspect `enforceAuth`, `userId`, and `tenantId`.
  - CORS set to `cors({ origin: true, credentials: true })` to avoid preflight/header issues in dev.

### Dashboard metrics & series (2025-08-24)
- Admin: email invites deferred — we will add after Stripe + SMTP integration. For now, members are added by `userId` in the Admin panel.
- Time-series endpoint returns `labels` for month display. Frontend passes labels to the chart for accurate tooltip and alignment.
- Liquid Cash Flow visualization hardened (no degenerate ranges, grid aligned to data points, improved hover).


- 2025-08-24 07:21:25Z Extended smoke runs (2 clean + 1 keep). Snapshots at server\tests\snapshots\20250824_072125

- 2025-08-24 08:00:31Z Recurring smoke x3 passed

- 2025-08-24 08:25:43Z Extended recurring smoke suite passed: EOM, nth-weekday, pauseUntil/resume, endDate deactivation, overpaid credits, auto-resume

2025-08-25 — COA mapping smoke tests (admin job-key) PASSED
- Added admin endpoints to bypass auth for maintenance/testing:
  - POST `/api/admin/post-expense` and POST `/api/admin/post-invoice` (guarded by `X-Job-Key`)
- Ran `scripts/run-smoke-coa.js` using `AILEGR_JOB_KEY=dev-job-key`:
  - 15/15 scenarios passed across AP and AR posting
  - AP mapped to extended COA (examples): 6160, 6230, 6240, 6115, 6170, 6180, 6070, 6030, 6080, 5010
  - AR line-item split verified (credits across multiple revenue lines); totals balanced
  - Sources recorded per line: USER / AI / HEURISTIC_*; fallbacks not triggered
  - Report saved to `smoke-coa-report.json`

2025-08-25 — COA + QTY checkpoint
- Added QTY/RATE support end-to-end: UI forms, API payloads, and persistence in `transaction.customFields.lineItems` for AP/AR.
- Extended revenue mapping: line-items now prefer explicit `accountCode`, fallback to heuristics (4020/4030/4040/4050/4060/4070) with safe 4020 default.
- Admin testing endpoints hardened:
  - `/api/admin/post-expense` — validation and AP split-by-lines honored; duplicate VIN 409 on vendor+VIN.
  - `/api/admin/post-invoice` — 409 on duplicate invoice number (idempotent existing also surfaced as 409 for admin tests).
- Test suites:
  - `scripts/run-smoke-coa-100.js`: broad AP/AR happy-paths.
  - `scripts/run-smoke-coa-150.js`: 100 valid + 50 expected-failure (validation/duplicates/edge rounding/overpaid/refund).
  - Runner: `scripts/run-suite-coa-ai.js` (starts server, waits ~2.5s, writes `tests/COA_AI/coa_smoke_{suite}_{timestamp}.json`).
- Result: 100 valid pass; 50 expected-failure return correct 4xx/409. Posting invariants balanced; tax/discount scaling applied; extended COA codes exercised.


## 2025-08-27T04:44:41+05:30 — Depreciating Assets (backend foundation)
- Prisma: added `AssetCategory`, `Asset`, `AssetEvent` with tenant scoping, indexes, unique keys.
- Service: `server/src/services/asset.service.js` with straight‑line depreciation, idempotent postings, schedule.
- Posting: `postAssetDepreciation` (DR 6120, CR 1590), category overrides supported.
- API: `/api/assets` (create/list), `/api/assets/run-depreciation`, `/api/admin/assets/run-depreciation`.
- Scheduler: optional `AILEGR_ASSET_CRON=true` runs every 15m.

## 2025-08-27T05:03:19+05:30 — Asset UI hooks integrated
- Asset endpoints consumed by `AssetModal` and `AssetRegister` (create/list/run-depreciation).
- Bill form now emits asset creation seed; no server changes required.

## 2025-08-27T05:39:33+05:30 — Asset categories endpoints
- Added `/api/asset-categories` GET/POST (tenant-scoped) to manage categories.
- Client: `assetsService.listCategories/createCategory` used by `AssetModal`.
