# Tax Implementation Overview

This app supports two regimes for expenses and invoices:

- US Sales Tax (expense): expense tax is not recoverable. Split posts to `6110 Sales Tax Expense`.
- VAT/GST (recoverable): expense tax is recoverable. Split posts to `1360 VAT/GST Receivable`.

Configuration is per-tenant via `CompanyProfile`:

- `taxRegime`: `US_SALES_TAX` (default) or `VAT`.
- `taxAccounts`: optional overrides `{ expense: '6110', receivable: '1360' }`.

Posting rules (high-level):

- Expense (AP):
  - Debit: Expense subtotal to resolved expense account (e.g., `6020` Office Supplies).
  - Debit: Tax to `6110` (US) or `1360` (VAT).
  - Credit: Cash `1010` when paid, or A/P `2010` when unpaid; partial posts both.

- Invoice (AR):
  - Credit: Revenue (line-sum or subtotal/discount logic).
  - Credit: `2150 Sales Tax Payable` when taxable.
  - Debit: Cash `1010` for amount received; Debit: A/R `1200` for balance.

OCR and UI mapping:

- AI Document detects tax percent/amount and terms; maps into expense toggles and fields.
- Vendor defaults: per vendor tax mode and rate/amount remembered; inline “Save Defaults” on bill.

Validation and UX:

- Post is disabled until Vendor, Amount (>0), and Date are valid.
- DR/CR preview shows splits for expenses and highlights partial payments (both Cash and A/P credits present).

Smoke test coverage:

- `server/tests/smoke-tax.js` verifies deltas in COA, P&L, and balance sheet for US and VAT flows.

# TAX — Policy, Accounts, and Flows

Scope: Expense tax (US Sales Tax vs VAT/GST), Invoice sales tax, OCR/vendor defaults, reports impact.

## Accounts
- 2150 Sales Tax Payable (liability)
- 6110 Sales Tax Expense (US; expense)
- 1360 VAT/GST Receivable (VAT; asset)

## Company Profile
- `CompanyProfile.taxRegime`: `US_SALES_TAX` or `VAT`
- `CompanyProfile.taxAccounts`: overrides `{ payable:'2150', expense:'6110', receivable:'1360' }`

## Vendor Defaults
- `VendorSetting` per tenant/vendor: `{ taxEnabled, taxMode: 'percentage'|'amount', taxRate, taxAmount }`
- Used to prefill new bills; can be saved from Expense form.

## OCR Hints
- `/api/ocr/normalize` attempts to extract tax percent/amount and flags “tax included” if detected. UI uses this to pre-fill.

## Posting Logic

### Expenses (Bills)
Inputs: gross `amount`, `taxSettings` (enabled, type, rate/amount), `paymentStatus`.
- Compute `taxAmount` from percent or fixed. Subtotal = amount - taxAmount.
- US Sales Tax regime:
  - DR Expense subtotal (e.g., 6020)
  - DR 6110 Sales Tax Expense for `taxAmount`
  - CR 2010 Accounts Payable for full gross
- VAT/GST regime:
  - DR Expense subtotal (e.g., 6020)
  - DR 1360 VAT/GST Receivable for `taxAmount`
  - CR 2010 Accounts Payable for full gross

Notes:
- Overpaid/partial expense handling unaffected; AP lines still balance.
- Bill number generation when missing: `BILL-R###` for recurring, `BILL-###` for one‑off.

### Invoices (Revenue)
- Credit revenue lines (single or per line item)
- If tax enabled: CREDIT 2150 Sales Tax Payable for `taxAmount`
- Cash/AR split based on amount paid (supports overpaid → Customer Credits 2050)

## Reports Impact
- P&L: shows expense subtotal in category; US regime also shows 6110 tax expense; VAT regime keeps tax on balance sheet (1360).
- Balance Sheet: 2150 grows with invoiced tax; 1360 grows with input VAT; AP/AR reflect gross/receivables.
- Trial Balance and COA reflect all debits/credits; strict equation enforced in smoke tests.

## UI
- Expense form: Tax section (toggle; percent vs amount). Prefills from OCR or vendor defaults. Graceful validation.
- Invoice form: Tax section credits 2150 when enabled.
- Settings: choose tax regime and override account codes.

## Examples
- US expense $100 with 10% tax:
  - DR 6020 90, DR 6110 10, CR 2010 100
- VAT expense $100 with 10% tax:
  - DR 6020 90, DR 1360 10, CR 2010 100
- Invoice $200 with 15% tax, $50 paid:
  - CR Revenue 200, CR 2150 30, DR Cash 50, DR AR 150

## Edge Cases
- Tax amount > gross → clamp to gross
- Tax exempt → taxAmount=0
- Rounding: two decimals; journal must balance within 0.01

## Testing
- Backend smoke adds expense tax scenarios to verify P&L/BS/TB/COA deltas and strict balance.
- UI manual: verify tax toggles, OCR prefills, vendor default memory, and report reflections.
