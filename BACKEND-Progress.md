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
- OCR: POST /api/ocr (multipart)
- Posting preview: POST /api/posting/preview
- Expenses: POST /api/expenses, GET /api/expenses
- Invoices: POST /api/invoices, GET /api/invoices
- Revenue: POST /api/transactions/revenue
- Capital: POST /api/transactions/capital
- Customers: GET/POST/PUT /api/customers
- Setup helpers: POST /api/setup/ensure-core-accounts, /api/setup/initial-capital, /api/setup/sample-revenue
- AI: POST /api/ai/generate, WebSocket chat (later)
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

## Today’s checklist
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
 - Added OCR + Preview + Expense posting in embedded server; created `src/services/expensesService.ts` (uploadOcr/previewExpense/postExpense).
  - Added `Expense (OCR)` modal wired into the + FAB: upload → preview → post; emits `data:refresh`.
  - Added Customers API + `src/services/customersService.ts` (searchCustomers). Wired customer auto-suggest in `AiInvoiceModal`. Extended service with list/create/update and built Customers screen & route.
  - COA drill modal now fetches live ledger via `/api/accounts/:code/transactions`.
  - Added AI proxy endpoint `/api/ai/generate` (Gemini) in embedded server for future chat.
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
- Auth: Not enforced server‑side yet; plan to verify Supabase JWT via JWKS and gate write endpoints.