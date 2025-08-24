- AP Bills Posting & Payments (2025-08-23)
  - Double-entry remains balanced across initial posting, partial payments, edits, and voids.
  - Aggregates on parent transaction:
    - amountPaid = initialAmountPaid + sum(payments) − sum(voids)
    - balanceDue = max(0, total − amountPaid)
    - paymentStatus ∈ { unpaid, partial, paid, overpaid } derived from amountPaid vs total.
  - Synthetic "Initial payment at posting" appears in history; subsequent payments are separate lines.
  - Edits: increases post the delta; decreases are implemented as void + new payment for the lower amount.
  - Voids: create reversing journal and flag original payment customFields.voided; history excludes voided lines.

Recurring transactions (planned)
- Model: add `RecurringRule { id, tenantId, type: 'EXPENSE'|'INVOICE', cadence: 'monthly'|'weekly'|'annual'|'custom', startDate, endDate?, dayOfMonth?, weekday?, amount, vendor/customer, categoryKey, description, nextRunAt }`
- Scheduler: daily job scans `nextRunAt <= now` and materializes transactions using PostingService (idempotent by rule id + period)
- UI: toggle “Make recurring” in AI Document and Invoices; manage rules under Settings → Recurring with pause/resume and preview next run
- Accounting: postings use normal double-entry; initialAmountPaid can be set from the rule (e.g., auto-charge) and shows as synthetic payment

### Current status (2025-08-23)
- Implemented advanced cadence (end-of-month, nth weekday), pauseUntil/resumeOn, occurrences preview endpoint, and run logs stored in `payload.__runLog`.
- Dev-only surfaces (to hide in production): Simulate Next Run, Run Log viewer, Global Run Due Now.
- Scheduler env: `AILEGR_RECURRING_CRON` toggles background runs.

### Tenantization impact
- All recurring rules will be scoped by `tenant_id` once auth/tenancy is enabled.
- On first login, `/api/setup/bootstrap-tenant` should create tenant + seed core COA; subsequent recurring runs use `req.tenantId` enforced by Prisma middleware.
# User Accounting Database — Tenancy and Migration Plan

Goal: Keep Supabase strictly for auth; move/keep all accounting data in our own database (Postgres in prod). Support SaaS single‑tenant per user (one tenant per account), with strong isolation and simple ops.

## Architecture
- Identity: Supabase Auth (email/password + reset). JWT contains user id; later we can add `tenant_id` in custom claims.
- App data: Our server (Express + Prisma) → managed Postgres (Neon/Railway/Render/RDS). SQLite remains for local dev only.
- Tenancy model: Single database, shared schema. Every business row has `tenant_id`. Server verifies JWT and enforces `tenant_id` filters for all reads/writes.

Why not database‑per‑user? Operational burden (migrations/backups/conns) and cost without benefits for our small‑SaaS phase. Shared DB + tenant_id is the industry default until true enterprise isolation is needed.

## Data model changes
1) New tables
- Tenant
  - id (cuid)
  - name
  - createdAt, updatedAt
- Membership
  - id (cuid)
  - userId (from Supabase, string)
  - tenantId (fk → Tenant.id)
  - role (OWNER | ADMIN | MEMBER)
  - createdAt
  - Unique: (userId, tenantId)

2) Add tenant_id to business tables
- `Account, Transaction, TransactionEntry, Expense, Invoice, Customer, Category, PendingCategoryApproval` …
- Composite uniques updated, e.g.:
  - Account: (code, tenant_id)
  - Category: (key, tenant_id) and optionally (name, tenant_id)
  - Invoice: invoiceNumber unique per tenant: (invoiceNumber, tenant_id)
  - Customer: (email, tenant_id)

3) Indices
- For reports and ledger:
  - On (tenant_id, date) for Transaction / Invoice / Expense
  - On (tenant_id, accountCode) for entries/ledger

4) Seeds
- Move `ensure-core-accounts` to run per‑tenant when a tenant is created (or first sign‑in for that user).
- Provide extended COA pack seeding via `POST /api/setup/seed-coa?preset=us-gaap` (idempotent, per tenant) using `server/data/us_gaap_coa.json`.

## Backend changes
1) JWT verification middleware
- Verify Supabase JWT via JWKS.
- Attach `req.auth = { userId, email }`.
- Resolve `tenantId` for the user (one tenant per account initially). Store in `req.tenantId`.

2) Prisma tenancy middleware
- For reads: inject `{ where: { tenant_id: req.tenantId, ...original } }`.
- For writes: auto‑attach `{ data: { tenant_id: req.tenantId, ... } }` and validate no cross‑tenant access.

3) Endpoints
- All endpoints require auth and tenant context. Ensure list/read/update/delete scoped by `tenant_id`.

4) First‑login bootstrap
- Endpoint `POST /api/setup/bootstrap-tenant`:
  - If user has no tenant: create Tenant, Membership(OWNER), run ensure‑core‑accounts for that tenant, return tenantId.

## Frontend changes
- On login success, call `/api/setup/bootstrap-tenant` (idempotent). Store active tenant in memory (later: switcher).
- No schema/UI changes needed for individual‑only SaaS beyond this.

## Migration plan (SQLite → Postgres with tenancy)
1) Prepare Prisma schema changes
- Add models: Tenant, Membership.
- Add `tenant_id` fields to business models and update uniques/relations.
- Create indices listed above.

2) Generate migration locally
```bash
# Edit prisma/schema.prisma (provider = postgresql for prod)
# Then generate migration
npx prisma migrate dev -n "add-tenancy"
```

3) Provision Postgres
- Create database on Neon/Railway/Render/RDS.
- Set `DATABASE_URL` in `.env` for the server.

4) Apply migrations and seed per‑tenant
```bash
npx prisma migrate deploy
```

5) Implement JWT verify + Prisma middleware
- Middleware verifies JWT, resolves tenantId, and scopes all queries.

6) Switch server to Postgres in production
- `provider = postgresql` and `DATABASE_URL` from env.

7) Rollout
- Deploy backend, test bootstrap flow, verify per‑tenant isolation across all endpoints.

## Example Prisma snippets (sketch)
```prisma
model Tenant {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  members   Membership[]
}

model Membership {
  id        String   @id @default(cuid())
  userId    String
  tenantId  String
  role      Role     @default(OWNER)
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  createdAt DateTime @default(now())
  @@unique([userId, tenantId])
}

enum Role { OWNER ADMIN MEMBER }

model Account {
  id            String   @id @default(cuid())
  tenant_id     String
  code          String
  name          String
  // ...
  @@unique([tenant_id, code])
}

model Category {
  id         String @id @default(cuid())
  tenant_id  String
  key        String
  name       String
  // ...
  @@unique([tenant_id, key])
  @@unique([tenant_id, name])
}

model Invoice {
  id            String   @id @default(cuid())
  tenant_id     String
  invoiceNumber String
  // ...
  @@unique([tenant_id, invoiceNumber])
}
```

## Security notes
- DB‑level isolation: in Postgres we can add Row‑Level Security later; for now we enforce in server + indices.
- All write/read endpoints must include tenant filters; Prisma middleware is a safety net.

## Next steps
- Implement Prisma schema changes.
- Add JWT middleware + tenant resolver.
- Create bootstrap endpoint and call it after login.
- Migrate to Postgres for production.

## Dev now uses Postgres (2025-08-22)
- For dev parity with prod, DATABASE_URL points to local Postgres.
- Fresh env quick steps:
  1) docker run -d --name ailegr-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ailegr_dev -p 5432:5432 postgres:16
  2) Ensure .env has DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ailegr_dev?schema=public
  3) npm ci
  4) npm run db:generate && npx prisma migrate dev
  5) npm run server (backend), npm run dev (frontend)
  6) POST /api/setup/bootstrap-tenant with { tenantName, userId }

## Postgres credentials � 2025-08-22
- Local Docker: POSTGRES_PASSWORD=, DB=ailegr_dev, port 5432.
- Connection: postgresql://postgres:postgres@localhost:5432/ailegr_dev?schema=public

## Postgres credentials � 2025-08-22
- Local Docker: POSTGRES_PASSWORD=, DB=ailegr_dev, port 5432.
- Connection: postgresql://postgres:postgres@localhost:5432/ailegr_dev?schema=public

## Postgres credentials � 2025-08-22
- Local Docker: POSTGRES_PASSWORD=, DB=ailegr_dev, port 5432.
- Connection: postgresql://postgres:postgres@localhost:5432/ailegr_dev?schema=public

### Implemented (Tenancy/Auth)
- Backend verifies JWT via Supabase JWKS; derives tenant from Membership.
- Request context provides tenantId to Prisma; all queries isolated by tenant.
- Frontend sends Authorization and X-Tenant-Id; bootstraps tenant after login.
- Reference uniqueness per tenant; recurring runs and postings now isolated.


### Implemented (phase 2)
- Per-tenant storage paths and guarded static serving.
- WebSocket requires auth; tenant context bound.
- RBAC coverage for categories/admin and COA ops.
- Scheduler supports job key + per-tenant runs.
- Set env: AILEGR_AUTH_ENFORCE=true, AILEGR_JOB_KEY, AILEGR_SUPABASE_URL.

