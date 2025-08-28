2025-08-27
- Added `/api/assets/:id/events` endpoint (server) for detail timeline in UI.
- Assets metrics endpoint live and wired on Dashboard. Quick dispose action added on Assets page.
- Vendor filter added to `/api/assets` (backend) for future UI filtering.

### Depreciating Assets — Design (v1)

Goal
- Track fixed assets, automate monthly depreciation, handle disposals, and integrate with AP bills and posting service without extra AI calls.

Scope v1
- Methods: Straight-line (book). Optional declining-balance in v1.1.
- Books: Single “book” (financial). Tax book later.
- Events: Acquisition, Depreciation, Disposal.

Data Model (proposed Prisma)
- AssetCategory: id, name, defaultUsefulLifeMonths, defaultMethod, assetAccountCode, accumulatedAccountCode, expenseAccountCode
- Asset: id, tenantId, categoryId, name, vendorName, acquisitionDate, inServiceDate, cost, residualValue, method, usefulLifeMonths, notes, status['active','disposed'], 
  accumulatedDepreciation, nextRunOn, uniqueKey
- AssetEvent: id, assetId, type['acquire','depreciate','dispose'], amount, runOn, journalId (link to posting), memo

Posting Logic
- Acquisition (from AP Bill or manual): DR Fixed Asset (14xx) CR Accounts Payable/Cash. Link bill id and asset id for audit.
- Monthly Depreciation: DR Depreciation Expense (6xxx) CR Accumulated Depreciation (14xx contra). Amount = (cost − residual)/usefulLifeMonths.
- Disposal: Reverse remaining cost/accumulated and post gain/loss to 49xx (Other Income/Loss).
- Idempotency: use key `asset:{assetId}:{yyyy-mm}` for each month in `posting.service.js`.

UX Flow
- In AiDocumentModal (expense): if amount ≥ threshold or keywords (laptop, macbook, camera, furniture, equipment), show “Capitalize as Asset” panel.
  - Fields: Category, In-service date, Useful life, Method, Residual value.
  - “Remember for this vendor” → default category/method.
- Asset Register page: list, filters, next run, accumulated, NBV; actions: Run now, Dispose, Edit.
- Asset Detail: timeline of events and linked source bill.

Background Job
- Nightly scheduler scans assets where `nextRunOn <= now()` and posts the period depreciation using posting service (idempotent keys).

AI Integration
- Only for keyword hints and vendor memory. No extra calls; leverage existing OCR text to suggest category.

Edge Cases
- Mid-month in-service → start next month (book). 
- Partial month disposal → pro‑rata in v1.1, full‑month in v1 for simplicity.
- Changes in useful life → recompute remaining schedule prospectively.

Testing
- 20 smoke cases: various useful lives, mid-year start, disposal with gain/loss, multiple tenants.

Rollout
- v1: straight-line + UI in AiDocumentModal + register + monthly job.
- v1.1: declining-balance, partial-month proration, tax book.


### Implementation Status — v1 (timestamps)
- 2025-08-27T04:44:41+05:30: Added Prisma models (`AssetCategory`, `Asset`, `AssetEvent`), posting method `postAssetDepreciation`, asset scheduler.
- 2025-08-27T05:03:19+05:30: Asset UI (`AssetModal`, `AssetRegister`), FAB actions, Bill form suggestion and quick-capitalization, AiDocumentModal “Capitalize as Asset”.
- 2025-08-27T05:39:33+05:30: Asset categories API (GET/POST), category selection/quick-create in `AssetModal`.
- 2025-08-27T05:46:56+05:30: Assets page + navigation, event drawer.
- 2025-08-27T05:55:00+05:30: Smoke suites added — basic, extended, and 100-case; 100/100 passing.
- 2025-08-27T06:29:14+05:30: Dashboard asset metrics cards (NBV, Monthly Depreciation, In Service / Upcoming); “Related Asset” link on bills.
- 2025-08-27T06:39:03+05:30: Assets filters (category/status/date), CSV export, quick Dispose; vendor category memory (prefill in AssetModal/AI flow).

What’s Live
- Acquisition via AP Bill + manual Add Asset
- Monthly straight-line depreciation with idempotent references
- Disposal endpoint (stops further runs)
- Asset Register (list, run now), Assets page with event timeline, filters and CSV export
- Category management and selection
- Heuristic asset suggestions in Bill/AiDoc flows; vendor memory prefill for category
- Dashboard asset cards (NBV, Monthly Depreciation, In Service / Upcoming)
- Bills: “Related Asset” deep link when linked
  - Also shows a subtle "Related Asset" tag on the bills list for quick recognition.

Next (v1.1 candidates)
- Partial-month proration; declining-balance option; gain/loss entry on disposal
- FIFO inventory integration (COGS) and Product Catalog tie-in with AR
- Asset audit trail export (CSV/JSON) and role-based permissions for disposal
- Multi-book support (financial/tax) and per-category defaults (life/method/accounts)


