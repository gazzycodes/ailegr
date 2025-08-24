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
