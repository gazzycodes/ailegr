import axios from 'axios'

// Simple in-memory circuit breaker per provider
const providerState = new Map()

function getState(name) {
  const s = providerState.get(name) || { fails: 0, openUntil: 0 }
  if (!providerState.has(name)) providerState.set(name, s)
  return s
}

function isOpen(name) {
  const s = getState(name)
  return Date.now() < s.openUntil
}

function recordFailure(name) {
  const s = getState(name)
  s.fails += 1
  // Exponential-ish backoff: 2s, 5s, 15s
  const windows = [2000, 5000, 15000, 30000]
  const idx = Math.min(windows.length - 1, s.fails - 1)
  s.openUntil = Date.now() + windows[idx]
}

function recordSuccess(name) {
  const s = getState(name)
  s.fails = 0
  s.openUntil = 0
}

async function callGemini(message, context) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing')
  const base = process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
  const url = `${base}?key=${process.env.GEMINI_API_KEY}`
  const payload = { contents: [{ parts: [{ text: buildPrompt(message, context) }] }] }
  const { data } = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 })
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated'
  return content
}

function buildPrompt(message, context = {}) {
  const ctx = context || {}
  const sys = `You are an AI accounting assistant for EZE Ledger. Be concise, friendly, precise, and action-capable.

When the user asks you to perform an operation, append ONE final line with an ACTION directive using this exact format:
ACTION: Name(key=value, key=value)

Supported ACTION names and parameters (use lowercase keys shown):
- CreateExpense(vendor, amount, category, date, description, vendorInvoiceNo?)
- CreateInvoice(customer, amount, date?, description?, dueDate?)
- GetFinancialSummary()
- RecordInvoicePayment(invoiceNumber? or id?, amount, date?)
- RecordExpensePayment(vendorInvoiceNo? or id?, vendor?, amount, date?)
- VoidPayment(id)
- DuplicateInvoice(invoiceNumber? or id?, date?, description?)
- DuplicateExpense(id, date?, description?)
 - OpenUniverse()
 - OpenView(view)
 - OpenTransactions(period?)
 - ExplainRevenue(period?)

Rules:
- Always use a single ACTION line only when the user intent is clear and parameters are available. Otherwise ask clarifying questions.
- Keep keys simple (vendor, amount, category, date, description, customer, invoiceNumber, vendorInvoiceNo, id).
- Never include provider names. Avoid leaking internal details.
- For risky operations like VoidPayment, confirm intent in your text, but still include the ACTION line if the user explicitly asked to proceed.
 - If ctx.mode is 'guide', do not emit ACTION. Instead, provide 3-5 numbered steps tailored to the current screen and user goal.
 - If ctx.mode is 'act', prefer emitting ACTION when feasible, asking only minimal clarifying questions if critical info is missing.
 - If ctx.mode is 'auto', decide: if intent is vague or exploratory ('why is revenue low?'), reply with a helpful explanation and, if appropriate, emit a navigation ACTION like OpenUniverse() or ExplainRevenue(period=month).
`
  return `${sys}\n\nContext: ${JSON.stringify(ctx)}\nUser message: ${message}`
}

async function callHeuristic(message, context, dashboardData) {
  const m = String(message || '').toLowerCase()
  const metrics = dashboardData?.metrics || { totalRevenue: 0, totalExpenses: 0, netProfit: 0 }
  if (/profit|net\s*income/.test(m)) {
    return `Net profit is $${(metrics.netProfit || 0).toLocaleString()}.` 
  }
  if (/revenue/.test(m)) {
    return `Total revenue is $${(metrics.totalRevenue || 0).toLocaleString()}.`
  }
  if (/expense|spend/.test(m)) {
    return `Total expenses are $${(metrics.totalExpenses || 0).toLocaleString()}.`
  }
  return `Summary: Revenue $${(metrics.totalRevenue || 0).toLocaleString()}, Expenses $${(metrics.totalExpenses || 0).toLocaleString()}, Net Profit $${(metrics.netProfit || 0).toLocaleString()}.`
}

export async function generateAIResponse(message, context, { dashboardData } = {}) {
  const order = (process.env.AI_PROVIDER_ORDER || 'gemini,heuristic').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const errors = []
  for (const provider of order) {
    try {
      if (isOpen(provider)) { errors.push(`${provider}:open`); continue }
      let res
      if (provider === 'gemini') res = await callWithRetry('gemini', () => callGemini(message, context))
      else if (provider === 'heuristic') res = await callHeuristic(message, context, dashboardData)
      else continue
      recordSuccess(provider)
      return res
    } catch (e) {
      recordFailure(provider)
      errors.push(`${provider}:${e?.code || e?.name || 'ERR'}`)
      continue
    }
  }
  // Fallback final response
  return 'Sorry, I had trouble answering that. Please try again shortly.'
}

async function callWithRetry(name, fn) {
  let lastErr
  const max = 2
  for (let i = 0; i <= max; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const isRate = String(e?.response?.status || '').startsWith('429') || /rate/i.test(String(e?.message || ''))
      const backoff = isRate ? (500 * (i + 1)) : (250 * (i + 1))
      await new Promise(r => setTimeout(r, backoff))
    }
  }
  throw lastErr
}

export default { generateAIResponse }


