# AI Chat — Pipeline, WS, and Actions (v1)

Date: 2025-08-27

Overview
- WebSocket chat connects UI to server for real-time responses and ACTION hooks.
- Provider pipeline: primary → fallback with retries and circuit breaker for resiliency.

Server
- File: `server/src/services/ai-provider.service.js`
  - Providers: `gemini` (if configured via `GEMINI_API_KEY`), `heuristic` fallback.
  - Retries: small backoff; rate-limit aware.
  - Circuit breaker: opens per-provider after repeated failures; cool-down window.
  - Export: `generateAIResponse(message, context, { dashboardData })` returns normalized content (may include `ACTION: name(args)` line).
- `server/server.js`: `processAIChat()` calls provider service; preserves `ACTION` parsing.
  - WebSocket chat enforces auth: client sends `{ type:'auth', token, tenantId }`; server verifies and binds tenant.

Client
- `src/components/ai/ChatDrawer.tsx`
  - WebSocket handshake → sends `{ type: 'auth', token, tenantId }` using Supabase JWT and active tenant id.
  - Sends user messages as `{ type: 'chat', message, context }`.
  - Streams assistant response into the active thread.
  - ACTION dispatcher now supports: `createExpense`, `createInvoice`, `getFinancialSummary`, `recordInvoicePayment`, `recordExpensePayment`, `voidPayment`, `duplicateInvoice`, `duplicateExpense`.
- Threads persist in `localStorage` with active thread id.
 - Help UX: "How it works" button opens `AiHelpModal` with examples, safety notes, and tips.
 - Modes: Auto/Guide/Act selector in Chat. Guide avoids actions and presents steps; Auto decides; Act executes.
 - Navigation: Chat can trigger `navigate:view` (e.g., universe) and `transactions:filter`. Universe listens to `universe:focus`.

Future (v1.1)
- Multi-provider expansions and ranking; semantic cache for common prompts.
- Guard rails: extended confirmations and dry‑run previews for bulk/destructive ops.

Env
- `GEMINI_API_KEY` optional. Without it, heuristic summaries reply with current dashboard metrics.
- `AI_PROVIDER_ORDER` (default: `gemini,heuristic`).
 - WebSocket client should pass a user token; in dev, server may allow anonymous but production should require auth.

Actions format
- The model can include a final line like `ACTION: Name(key=value, ...)`.
- Parameters accept either key=value pairs (comma separated) or positional `[name, amount, desc, date]` heuristics.
- Examples:
  - `ACTION: CreateExpense(vendor=Netflix, amount=15.99, description=Software)`
  - `ACTION: RecordInvoicePayment(invoiceNumber=INV-1005, amount=250.00, date=2025-08-27)`
  - `ACTION: VoidPayment(id=tx_abc123)`
  - `ACTION: DuplicateInvoice(invoiceNumber=INV-1002, date=2025-09-01)`


