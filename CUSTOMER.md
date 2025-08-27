## Customer & Invoices — Notes (v1)

Date: 2025-08-27

- Invoice line items support selecting a product from the catalog.
- When a product is selected on an AR line:
  - Description is auto-filled if empty.
  - Rate is auto-filled from Product.price when available.
  - Amount recalculates as qty × rate.
  - Revenue account defaults to Product.incomeAccountCode unless manually overridden.

Impact on UX
- Faster invoice creation with consistent pricing.
- Optional manual override for rate/amount remains.
- Future: favorites/tags will promote frequently used products for each customer.

2025-08-27
- AR invoice form now supports product selection per line; customer account memory unchanged.

### Customers — Design (v1)

Goal
- Manage customer records, pricing terms, tax preferences, and default revenue accounts/products to streamline AR.

Model
- Customer: id, tenantId, name, email, phone, billingAddress, shippingAddress, termsNetDays, taxExempt, defaultProductIds[], defaultRevenueAccountCode, notes, active
- CustomerPricing: id, customerId, productId, price, currency, effectiveFrom, effectiveTo

UX
- Customer picker in AR invoices and AiInvoiceModal with Recent/Favorites; quick-add (name + email) with safe defaults.
- “Remember for this customer” ties revenue account/product suggestions.

AI Hints
- Use OCR/AI classification to propose customer and defaults when parsing inbound docs; never block user edits.

Testing
- CRUD, picker flow, defaults applied, edge cases for inactive customers.


