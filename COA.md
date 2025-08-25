## Chart of Accounts (COA) – Mapping & Seeding

### Goals
- Always post with valid accounts (never block).
- Prefer precise mapping (AI or rules) with safe fallbacks.
- Make it automatic for all tenants (core + extended COA).

### Seeding
- Core accounts auto-ensure on startup when `EZE_SEED_CORE_ACCOUNTS=true`.
- Extended US GAAP set:
  - One-time admin sweep: `POST /api/admin/seed-coa-all-tenants` (header `X-Job-Key`).
  - Auto-ensure on startup when `EZE_SEED_EXTENDED_COA=true` (idempotent).
  - New tenants: bootstrap seeds core + extended immediately (gated by `EZE_SEED_EXTENDED_COA`).

### Mapping Precedence
AP (Expenses):
1. User/AI hint: `suggestedAccountCode` (if the code exists)
2. Category mapping (resolver `CATEGORY_ACCOUNT_MAPPING`)
3. Keyword/heuristics (telecom→6160, bank fees→6015, cloud hosting→6240, processor fees→6230, etc.)
4. Fallback `6999` (with a resilience substitution to `6020` in demo if 6999 missing)

AR (Invoices/Revenue):
1. Per-line `accountCode` (from AI or user)
2. Mapper `mapLineItemToRevenueAccount`:
   - SEO/marketing→4030, support/maintenance→4040, subscription/SaaS→4050, license→4060, training→4070, otherwise 4020
3. Fallback to default revenue (usually 4020)

### AI – Single Call Strategy
- OCR normalize/classify already runs; we piggyback mapping hints:
  - Expenses: `/api/ocr/normalize` sets `labels.suggestedAccountCode` (heuristic). UI forwards as `suggestedAccountCode`.
  - Invoices/Revenue: AI prompt can return `lineItems[{ description, amount, accountCode }]`.
- Server validates codes and applies precedence. No extra AI calls.

### Safety
- All posting functions validate accounts; if a mapped account is missing, fallback to defaults and never block.
- Seeding is idempotent; re-running does not duplicate.

### Testing
- Seed extended COA on dev.
- Post AP bills covering categories: telecom, SaaS, cloud hosting, processor fees, rent, meals, insurance, training.
- Post AR invoices with lines matching: marketing services, support/maintenance, subscriptions, license, training.
- Verify balances and that entries credit/debit the expected codes.

# Chart of Accounts (COA) — US Small-Business Baseline

This document tracks COA presets, decisions, and changes over time.

## Preset: US Small Business COA (Extended)
- Source file: `server/data/us_gaap_coa.json`
- Version: 2025-08-22
- Scope: Broad, opinionated set to cover SMB needs while staying simple.
- Structure:
  - Assets: cash (checking/savings/petty), A/R aging buckets, deposits/prepaids, fixed assets + accumulated depreciation
  - Liabilities: A/P, customer credits, deferred revenue, sales tax, payroll liabilities
  - Equity: owner equity, APIC, retained earnings
  - Revenue: product, services (with common sub-buckets), sales discounts (contra)
  - COGS: materials/supplies, subcontractors
  - Operating Expenses: office, software, marketing, payroll, travel, rent, utilities, professional services, insurance, depreciation, other

## Seeding
- Endpoint: `POST /api/setup/seed-coa?preset=us-gaap` (body: `{ tenantId?: string }`)
- Behavior: idempotent per tenant; links `parentId` in a second pass.
- Boot policy: keep boot seeding minimal (dev only). In prod, seed via:
  1) `POST /api/setup/bootstrap-tenant` (per-tenant core);
  2) `POST /api/setup/seed-coa?preset=us-gaap` to expand full pack.

## Mapping Policies
- Invoices
  - Revenue defaults to `4020` (Services Revenue); may map by line item (see `PostingService.mapLineItemToRevenueAccount`).
  - Tax → `2150` Sales Tax Payable; Discounts → `4910` Sales Discounts (contra revenue).
  - Cash → `1010`; A/R → `1200`; Overpay → `2050` Customer Credits Payable.
- Expenses
  - Expense resolver maps to `6020/6030/6040/...` by vendor keywords and context.
  - Cash/AP choice based on payment status (paid/unpaid/partial/overpaid).

## Change Log
- 2025-08-22
  - Added COA preset JSON; added `seed-coa` endpoint; wired client helper.
  - No breaking changes to existing core codes.

## Future
- Industry-specific overlays (SaaS, Agency, Retail).
- Multi-currency subaccounts.
- Region-specific tax liability accounts.
