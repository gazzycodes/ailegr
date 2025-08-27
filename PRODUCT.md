# Product Catalog — Implementation Status (v1)

Date: 2025-08-27

- Backend: `/api/products` CRUD live in `server/server.js`.
- Frontend: `src/services/productsService.ts` added.
- UI: `ProductPicker` component (theme-aware) available and integrated into invoice/bill line items in `src/components/transactions/Invoices.tsx`.
- Behavior: Selecting a product on a line auto-enables split-by-line-items for correct posting downstream.

Next:
- Hook inventory product lines to InventoryLot/InventoryTxn on AP receive and COGS on AR.
- Add Products page and navigation entry.

## Data Model

Fields (Prisma `Product`):
- id, tenantId, sku, barcode, name, description, type['service','inventory'], unit
- price (sell), cost (default cost), taxCode
- incomeAccountCode, expenseAccountCode, cogsAccountCode, inventoryAccountCode
- preferredVendor, active, tags, favorite
- lots[] (InventoryLot), txns[] (InventoryTxn)

CSV Schema (import/export v1):
- Columns: name, type, sku, unit, price, cost, incomeAccountCode, expenseAccountCode, cogsAccountCode, inventoryAccountCode, taxCode, favorite, tags
- types: 'service' | 'inventory'
- tags: JSON array or pipe-delimited list

UX Flows:
- Product Picker in AR/AP lines: selecting a product auto-fills description and pricing.
  - AR: uses `price`; fills `rate` and recomputes `amount = qty × rate`, suggests `incomeAccountCode` when no manual override.
  - AP: uses `cost` for inventory, `price` for services as fallback; fills `rate` and recomputes amount, suggests `expenseAccountCode`/`cogsAccountCode` (or `inventoryAccountCode` for inventory receipt) when unset.
- Favorites/Tags (v1.1): quick filters and ordering.

API
- GET `/api/products` list with filters
- POST `/api/products` create
- PUT `/api/products/:id` update
- Reports: GET `/api/reports/inventory-valuation` for valuation summary
 - QA: Admin smokes use `POST /api/admin/post-invoice` and `POST /api/admin/post-expense` (with `X-Job-Key`) to stress posting flows.

Notes
- No blocking AI calls on posting; UX hints only.

### Products — Design (v1)

Goal
- Unified catalog for services and inventory items with pricing, tax, and account defaults.

Model
- Product: id, tenantId, sku, barcode, name, description, type['service','inventory'], unit, price, cost, taxCode,
  incomeAccountCode, expenseAccountCode, cogsAccountCode, inventoryAccountCode, active, tags[], favorite

Behavior
- Service products: no inventory movements; post to revenue account on AR.
- Inventory products: integrate with INVENTORY.md flows.

UX
- Product picker: searchable, keyboardable, sections for Recent/Favorites, sticky type headers.
- Inline quick-add in AiDocumentModal and AR/AP line items (minimal: name, type, price, accounts from defaults).

AI Hints
- Use OCR keywords and vendor/customer context to suggest product candidates; never block user.

Testing
- CRUD, picker usability, default account mapping and overrides.


