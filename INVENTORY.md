# Inventory — Implementation Status (v1)

Date: 2025-08-27

- Prisma models present: `Product`, `InventoryLot`, `InventoryTxn`.
- Backend in-progress: product CRUD live; inventory posting wiring next.
- Frontend: ProductPicker integrated in AR/AP line items; productId carried in payload for future FIFO/COGS handling.

Planned next steps:
- AP: When posting bills with inventory products, debit Inventory (13xx), create `InventoryLot` entries.
- AR: When invoicing items tied to inventory products, relieve inventory using FIFO and create `InventoryTxn` (sell) with COGS posting (50xx) and credit Inventory.
- Reporting: Inventory valuation and COGS summaries.

### Inventory — Design (v1)

Goal
- Track stock items, quantities, costs (FIFO v1), and map AP purchases to inventory/COGS with optional AI hints, plus easy selection in UI.

Scope v1
- Methods: FIFO; average-cost as v1.1.
- Movements: Receive (from AP bill), Adjust, Sell/Issue (from AR invoice or manual).

Data Model (proposed Prisma)
- Product: id, tenantId, sku, name, description, unit, isService, incomeAccountCode, expenseAccountCode, inventoryAccountCode, cogsAccountCode, taxCode, preferredVendor, active
- InventoryLot: id, productId, receivedOn, qty, unitCost, remainingQty, sourceBillId
- InventoryTxn: id, productId, type['receive','sell','adjust'], qty, unitCost, journalId, memo, linkedDocId

Posting Logic
- Receive (AP Bill): DR Inventory (12xx) CR AP/Cash.
- Sell (AR Invoice): DR COGS (50xx) CR Inventory (12xx) using FIFO lot costs.
- Service items bypass inventory and post to revenue only.

UX Flow
- Catalog: Products list with search, tags, service vs inventory type, favorites.
- AP Bill line item: choose product. If inventory item, QTY×Rate stores lot with unitCost = Rate; allow manual override. Product selection now auto-fills rate from `cost` (inventory) or `price` (service fallback) and recomputes amount.
- AR Invoice line item: choosing product auto-fills rate from `price` (sell price) and recomputes amount; posts COGS via FIFO; show COGS preview in mapping panel.
- AiDocumentModal: “Detect products” from OCR text; suggest matches; allow quick add product.

AI Integration
- Use OCR text and vendor/customer memory to suggest products; no extra calls during posting.

Testing
- 30 smoke cases: receive/sell various sequences, cross-tenant isolation, service items, returns (v1.1).

Reporting
- New endpoint: GET `/api/reports/inventory-valuation` returns `{ asOf, rows:[{ productId, name, sku, quantityOnHand, unitCost, value }], totals:{ quantity, value } }`.
- UI: Reports → Inventory Valuation tab with CSV export.

Rollout
- v1: FIFO, product catalog, AP receive + AR sell integration and previews.
- v1.1: average cost, returns/RMAs, kits/bundles.


