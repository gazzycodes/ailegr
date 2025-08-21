# Backend Parity Plan (accounting-ai-main ➜ ailegr)

Purpose
- Achieve backend feature parity with `@accounting-ai-main/` in `@ailegr/` without copying UI.
- Keep existing `@ailegr/` UI; only add minimal dev hooks where needed for testing.

Outcomes
- Same OCR/AI classification surface, posting engine behaviors, recurring engine, closing entries, and company profile context as `@accounting-ai-main/`.
- Database-driven reports remain as in `@ailegr/` (already equivalent).

Scope (no UI copy)
- Backend endpoints, services, models, and seeding only.
- Optional tiny dev buttons/forms in Settings for testing (no design changes).

---

## Phase 0 — Inventory and Deltas (reference)
- ailegr: OCR (PDF/images/DOCX/CSV/TXT), posting preview, expenses/invoices posting (basic), TB/P&L/BS/COA, customers, setup helpers, company profile, AI proxy, time-series.
- Gaps vs accounting-ai-main: OCR normalize; classifier endpoint; extended file types; posting engine parity (refunds, prepaid/voided/refunded/write_off/draft, tax/discount reconciliation, overpay to 1400); recurring; closing entries; ensure accounts (1400/2400); AI context injection; invoice search filters; tests.

---

## Phase 1 — OCR and Classification
Tasks
- [x] Implement `POST /api/ocr/normalize` to extract labels (invoiceNo, invoiceDate, dueDate, serviceDate), amounts (subtotal, tax, total, amountPaid, balanceDue), identity cues (fromCompany, billToCompany), and return `{ structured }`.
- [x] Implement `POST /api/documents/classify` returning `{ docType, ourRole, policy, reasons[], confidence }` using text + structured.
- [x] Extend OCR support for: `.xlsx/.xls (xlsx)`, `.xml (xml2js)`, `.qif/.ofx`, encoding detection (chardet + iconv-lite). Keep size/allow-lists.
- [ ] Optional: update AI Document modal accept types to include new formats (dev-only convenience).

Acceptance Criteria
- Upload/normalize returns structured fields for typical PDFs/Images/DOCX/CSV/TXT and new types.
- Classifier decides invoice vs expense with confidence and reasons; policy reflects paid/partial/unpaid based on amounts.
- No UI dependency required to exercise endpoints.

---

## Phase 2 — Posting Engine Parity
Tasks (Expense)
- [x] Overpayment: Dr `1400 Prepaid Expenses` (not liabilities) for vendor overpay; keep preview parity.
- [x] Refunds: Negative amount reverses original (preview and posting).

Tasks (Invoice)
- [x] Prepaid: Cr `2400 Unearned Revenue` instead of revenue, with standard debit.
- [x] Add statuses: `voided`, `refunded`, `write_off`, `draft` with correct postings.
- [x] Reconcile tax/discount math (percentage/fixed) so subtotal + tax − discount = total; keep balanced journal invariant.
- [x] Preserve multi-line line-item crediting.

Seed / Setup
- [x] Ensure setup creates `1400 Prepaid Expenses`, `2400 Unearned Revenue`, and `6170 Bad Debt Expense` (idempotent).

Acceptance Criteria
- All expense/invoice scenarios supported; preview mirrors posting; entries balanced; idempotency preserved via `reference`.

---

## Phase 3 — Recurring Transactions
Tasks
- [x] Add Prisma model `RecurringSchedule`.
- [x] `POST /api/expenses/recurring` to create schedules.
- [x] Processor to post due expenses + `POST /api/admin/process-recurring`.

Acceptance Criteria
- Can create schedules; processor posts due expenses; manual trigger works; idempotent behavior (no duplicates).

---

## Phase 4 — Closing Entries
Tasks
- [x] `POST /api/accounting/closing-entries` to close all revenue/expense to retained earnings `3200`, creating audit transactions.

Acceptance Criteria
- Closing entries create balanced transactions; TB reflects zeroed income/expense; BS equity updated.

---

## Phase 5 — AI Context Injection
Tasks
- [x] Inject company profile (legalName, aliases, location) into `/api/ai/generate` requests to improve identity-aware reasoning.

Acceptance Criteria
- AI calls include company context; no PII leakage beyond configured data; feature togglable by env if needed.

---

## Phase 6 — Search and Small Fixes
Tasks
- [x] Invoice search filters consistent with accounting-ai-main (amount, number), plus customer/status/date range.

Acceptance Criteria
- Filters work without schema mismatch; no breaking changes to lists.

---

## Phase 7 — Tests and Validation
Tasks
- [ ] Unit tests: expense flows (standard/partial/overpaid/refund), invoice flows (paid/unpaid/partial/overpaid, prepaid/voided/refunded/write_off/draft), tax/discount reconciliation.
- [ ] Tests for closing entries, recurring processor, and classifier endpoints.
- [ ] Centralized input validation for posting/classifier endpoints.

Acceptance Criteria
- Posting invariant holds across tests; CI runs green locally; critical endpoints covered.

---

## Dependencies & Notes
- Packages (Phase 1): `xlsx`, `xml2js`, `chardet`, `iconv-lite`.
- DB: run `npm run db:push` after schema changes (CompanyProfile done; RecurringSchedule in Phase 3).
- No UI copy. Minimal dev-only hooks in Settings: Run Closing Entries, Create Recurring, Process Recurring.

---

## Progress Log
- CompanyProfile: model + GET/PUT implemented; Settings modal added.
- Phase 1 completed: added `/api/ocr/normalize`, `/api/documents/classify`, and extended OCR support (XLSX/XML/QIF/OFX/encoding).
- Next: Phase 2 (Posting engine parity: refunds, 1400/2400 flows, statuses, reconciliation).