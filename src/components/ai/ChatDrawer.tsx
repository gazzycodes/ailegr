import { useEffect, useMemo, useRef, useState } from 'react'
import ExpensesService from '../../services/expensesService'
import TransactionsService from '../../services/transactionsService'
import ReportsService from '../../services/reportsService'
import { getToken } from '../../services/authToken'
import { motion } from 'framer-motion'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { ModalPortal } from '../layout/ModalPortal'
import { cn } from '../../lib/utils'

type Message = { id: string; role: 'user' | 'assistant'; content: string; ts: number }
type Thread = { id: string; title: string; messages: Message[]; createdAt: number }

interface ChatDrawerProps {
  open: boolean
  onClose: () => void
  onOpenAiDocument: () => void
}

const STORAGE_KEY = 'eze.ai.chat.threads'
const ACTIVE_KEY = 'eze.ai.chat.active'

export function ChatDrawer({ open, onClose, onOpenAiDocument }: ChatDrawerProps) {
  const [threads, setThreads] = useState<Thread[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
  })
  const [activeId, setActiveId] = useState<string>(() => localStorage.getItem(ACTIVE_KEY) || '')
  const [input, setInput] = useState('')
  const [aiMode, setAiMode] = useState<'auto'|'guide'|'act'>('auto')
  const wsRef = useRef<WebSocket | null>(null)

  const active = useMemo(() => threads.find(t => t.id === activeId) || threads[0], [threads, activeId])

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(threads)) }, [threads])
  useEffect(() => { if (active) localStorage.setItem(ACTIVE_KEY, active.id) }, [active?.id])

  const createThread = () => {
    const id = `t-${Date.now()}`
    const newThread: Thread = { id, title: 'New Chat', messages: [], createdAt: Date.now() }
    setThreads([newThread, ...threads])
    setActiveId(id)
  }

  useEffect(() => {
    if (!open) return
    try {
      const base = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000'
      const ws = new WebSocket(base.replace(/^http/i, 'ws'))
      wsRef.current = ws
      ws.onopen = () => {
        try {
          const tenantId = (localStorage.getItem('activeTenantId') || '')
          ;(async () => {
            try {
              const token = (await getToken()) || ''
              ws.send(JSON.stringify({ type: 'auth', token, tenantId }))
            } catch {
              ws.send(JSON.stringify({ type: 'auth', token: '', tenantId }))
            }
          })()
        } catch {}
      }
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data)
          if (data.type === 'chat_response') {
            const content: string = data.message || ''
            const action = data.action || null
            if (!active) return
            const assistantMsg: Message = { id: `m-${Date.now()+1}`, role: 'assistant', content, ts: Date.now()+1 }
            setThreads(prev => prev.map(t => t.id === active.id ? { ...t, messages: [...t.messages, assistantMsg] } : t))
            if (action) dispatchAction(action)
          }
        } catch {}
      }
      ws.onerror = () => {}
      ws.onclose = () => { wsRef.current = null }
      return () => { try { ws.close() } catch {} }
    } catch {}
  }, [open, active?.id])

  const send = () => {
    if (!active || !input.trim()) return
    const text = input.trim()
    const userMsg: Message = { id: `m-${Date.now()}`, role: 'user', content: text, ts: Date.now() }
    setThreads(prev => prev.map(t => t.id === active.id ? { ...t, title: t.messages.length ? t.title : text.slice(0, 30), messages: [...t.messages, userMsg] } : t))
    try { wsRef.current?.send(JSON.stringify({ type: 'chat', message: text, context: { threadId: active.id, mode: aiMode } })) } catch {}
    setInput('')
  }

  function dispatchAction(action: any) {
    try {
      const type = String(action?.type || '')
      const params = String(action?.parameters || '')
      if (!type) return
      if (/createexpense/i.test(type)) {
        createExpenseFromParams(params)
        return
      }
      if (/createinvoice/i.test(type)) {
        createInvoiceFromParams(params)
        return
      }
      if (/getfinancialsummary/i.test(type)) {
        getFinancialSummary()
        return
      }
      if (/recordinvoicepayment/i.test(type) || /recordpayment\s*:\s*invoice/i.test(params)) {
        recordInvoicePaymentFromParams(params)
        return
      }
      if (/recordexpensepayment/i.test(type) || /recordpayment\s*:\s*expense/i.test(params)) {
        recordExpensePaymentFromParams(params)
        return
      }
      if (/voidpayment/i.test(type)) {
        voidPaymentFromParams(params)
        return
      }
      if (/duplicateinvoice/i.test(type) || (/duplicate/i.test(type) && /type\s*=\s*invoice/i.test(params))) {
        duplicateInvoiceFromParams(params)
        return
      }
      if (/duplicateexpense/i.test(type) || (/duplicate/i.test(type) && /type\s*=\s*expense/i.test(params))) {
        duplicateExpenseFromParams(params)
        return
      }
      if (/openuniverse/i.test(type)) {
        try { window.dispatchEvent(new CustomEvent('navigate:view', { detail: { view: 'universe' } })) } catch {}
        return
      }
      if (/openview/i.test(type)) {
        const { view } = parseParams(params)
        const v = String(view || '').toLowerCase()
        const allow = ['dashboard','reports','transactions','universe','customers','settings','assets','products']
        if (allow.includes(v)) {
          try { window.dispatchEvent(new CustomEvent('navigate:view', { detail: { view: v } })) } catch {}
        }
        return
      }
      if (/opentransactions/i.test(type)) {
        const { period } = parseParams(params)
        try { window.dispatchEvent(new CustomEvent('navigate:view', { detail: { view: 'transactions' } })) } catch {}
        if (period) try { window.dispatchEvent(new CustomEvent('transactions:filter', { detail: { period: String(period) } })) } catch {}
        return
      }
      if (/explainrevenue/i.test(type)) {
        explainRevenueFromParams(params)
        return
      }
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: `Action not recognized: ${type}`, type: 'error' } }))
    } catch {}
  }

  async function createExpenseFromParams(params: string) {
    try {
      const { vendor = 'Vendor', amount = 0, category, date, description } = parseParams(params)
      const body: any = {
        vendorName: String(vendor),
        amount: Number(amount) || 0,
        date: date || new Date().toISOString().slice(0,10),
        description: description || `Expense from ${vendor}`,
        lineItems: [{ description: category || 'Expense', amount: Number(amount) || 0 }]
      }
      await (ExpensesService as any).postExpense(body)
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Expense created', type: 'success' } }))
      window.dispatchEvent(new Event('data:refresh'))
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to create expense', type: 'error' } }))
    }
  }

  async function explainRevenueFromParams(params: string) {
    try {
      const { period } = parseParams(params)
      const p = String(period || 'Monthly') as any
      const data = await ReportsService.getPnl(undefined, { period: p, compare: true } as any)
      const rev = (data?.revenue || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
      const cogs = (data?.cogs || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
      const exp = (data?.expenses || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
      const gross = rev - Math.abs(cogs)
      const net = gross - Math.abs(exp)
      const tips: string[] = []
      if (rev < (data?.totals?.revenue || rev)) tips.push('Revenue is lower than prior period; review top customers and product lines.')
      if (Math.abs(cogs) > 0.6 * rev) tips.push('COGS is high relative to revenue; check pricing and inventory costs.')
      if (Math.abs(exp) > 0.5 * gross) tips.push('Operating expenses are elevated; review recent large expenses.')
      const msg = `Revenue insight (${p}):\n- Revenue: $${rev.toFixed(0)}\n- Gross: $${gross.toFixed(0)}\n- Net: $${net.toFixed(0)}\n\nSuggestions:\n${(tips.length? tips:['Open the 3D Universe to explore flows.']).map(t=>`• ${t}`).join('\n')}`
      appendAssistant(msg)
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to analyze revenue', type: 'error' } }))
    }
  }

  function appendAssistant(text: string) {
    try {
      if (!active) return
      const assistantMsg: Message = { id: `m-${Date.now()+1}`, role: 'assistant', content: text, ts: Date.now()+1 }
      setThreads(prev => prev.map(t => t.id === active.id ? { ...t, messages: [...t.messages, assistantMsg] } : t))
    } catch {}
  }

  async function createInvoiceFromParams(params: string) {
    try {
      const { customer = 'Customer', amount = 0, description, dueDate } = parseParams(params)
      const body: any = {
        customerName: String(customer),
        amount: Number(amount) || 0,
        date: new Date().toISOString().slice(0,10),
        description: description || `Invoice for ${customer}`,
        dueDate: dueDate || undefined,
        lineItems: [{ description: description || 'Service', amount: Number(amount) || 0 }]
      }
      await (TransactionsService as any).postInvoice(body)
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Invoice created', type: 'success' } }))
      window.dispatchEvent(new Event('data:refresh'))
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to create invoice', type: 'error' } }))
    }
  }

  async function getFinancialSummary() {
    try {
      const data = await ReportsService.getPnl(undefined, { period: 'Monthly', compare: true } as any)
      const rev = (data?.revenue || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
      const cogs = (data?.cogs || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
      const exp = (data?.expenses || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
      const gross = rev - Math.abs(cogs)
      const net = gross - Math.abs(exp)
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: `Summary — Rev $${rev.toFixed(0)} • Net $${net.toFixed(0)}`, type: 'success' } }))
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to load summary', type: 'error' } }))
    }
  }

  async function recordInvoicePaymentFromParams(params: string) {
    try {
      const { id, invoiceid, paymentid, invoicenumber, amount, date } = parseParams(params)
      const paymentAmount = Number(amount || 0)
      const invoiceId = id || invoiceid
      let targetId = String(invoiceId || '')
      if (!targetId && invoicenumber) {
        try {
          const list = await (TransactionsService as any).listInvoices()
          const found = (list || []).find((inv: any) => String(inv.invoiceNumber || '').toLowerCase() === String(invoicenumber).toLowerCase())
          if (found?.id) targetId = String(found.id)
        } catch {}
      }
      if (!targetId) throw new Error('Invoice not specified')
      if (!(paymentAmount > 0)) throw new Error('Amount must be > 0')
      await (TransactionsService as any).recordInvoicePayment(targetId, { amount: paymentAmount, date })
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Payment recorded for invoice', type: 'success' } }))
      try { window.dispatchEvent(new Event('payments:updated')) } catch {}
      window.dispatchEvent(new Event('data:refresh'))
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to record invoice payment', type: 'error' } }))
    }
  }

  async function recordExpensePaymentFromParams(params: string) {
    try {
      const { id, expenseid, vendorinvoiceno, amount, date, vendor } = parseParams(params)
      const paymentAmount = Number(amount || 0)
      let targetId = String(id || expenseid || '')
      if (!targetId && (vendor || vendorinvoiceno)) {
        try {
          const list = await (ExpensesService as any).listExpenses()
          const found = (list || []).find((e: any) => {
            const matchVendor = vendor ? String(e.vendor || '').toLowerCase() === String(vendor).toLowerCase() : true
            const matchVin = vendorinvoiceno ? String(e.vendorInvoiceNo || '').toLowerCase() === String(vendorinvoiceno).toLowerCase() : true
            return matchVendor && matchVin
          })
          if (found?.id) targetId = String(found.id)
        } catch {}
      }
      if (!targetId) throw new Error('Expense not specified')
      if (!(paymentAmount > 0)) throw new Error('Amount must be > 0')
      await (ExpensesService as any).recordExpensePayment(targetId, { amount: paymentAmount, date })
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Payment recorded for expense', type: 'success' } }))
      try { window.dispatchEvent(new Event('payments:updated')) } catch {}
      window.dispatchEvent(new Event('data:refresh'))
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to record expense payment', type: 'error' } }))
    }
  }

  async function voidPaymentFromParams(params: string) {
    try {
      const { id, paymentid } = parseParams(params)
      const targetId = String(id || paymentid || '')
      if (!targetId) throw new Error('Payment id is required')
      const ok = typeof window !== 'undefined' ? window.confirm('Are you sure you want to void this payment?') : true
      if (!ok) return
      // Either service supports this endpoint
      try {
        await (TransactionsService as any).voidPayment(targetId)
      } catch {
        await (ExpensesService as any).voidPayment(targetId)
      }
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Payment voided', type: 'success' } }))
      try { window.dispatchEvent(new Event('payments:updated')) } catch {}
      window.dispatchEvent(new Event('data:refresh'))
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to void payment', type: 'error' } }))
    }
  }

  async function duplicateInvoiceFromParams(params: string) {
    try {
      const { id, invoiceid, invoicenumber, date, description } = parseParams(params)
      let source: any = null
      try {
        const list = await (TransactionsService as any).listInvoices()
        source = (list || []).find((inv: any) => {
          if (id || invoiceid) return String(inv.id) === String(id || invoiceid)
          if (invoicenumber) return String(inv.invoiceNumber || '').toLowerCase() === String(invoicenumber).toLowerCase()
          return false
        })
      } catch {}
      if (!source) throw new Error('Invoice not found to duplicate')
      const body: any = {
        customerName: String(source.customer || source.customerName || 'Customer'),
        amount: Number(source.amount || source.total || 0),
        date: date || new Date().toISOString().slice(0,10),
        description: description || `Duplicate of ${source.invoiceNumber || source.description || 'invoice'}`,
        dueDate: source.dueDate || undefined,
        lineItems: Array.isArray(source.lineItems) && source.lineItems.length
          ? source.lineItems.map((li: any) => ({ description: li.description || 'Item', amount: Number(li.amount || li.total || 0) }))
          : [{ description: source.description || 'Service', amount: Number(source.amount || 0) }]
      }
      await (TransactionsService as any).postInvoice(body)
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Invoice duplicated', type: 'success' } }))
      window.dispatchEvent(new Event('data:refresh'))
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to duplicate invoice', type: 'error' } }))
    }
  }

  async function duplicateExpenseFromParams(params: string) {
    try {
      const { id, expenseid, date, description } = parseParams(params)
      let source: any = null
      try {
        const list = await (ExpensesService as any).listExpenses()
        source = (list || []).find((e: any) => {
          if (id || expenseid) return String(e.id) === String(id || expenseid)
          return false
        })
      } catch {}
      if (!source) throw new Error('Expense not found to duplicate')
      const body: any = {
        vendorName: String(source.vendor || 'Vendor'),
        amount: Number(source.amount || 0),
        date: date || new Date().toISOString().slice(0,10),
        description: description || `Duplicate of ${source.vendorInvoiceNo || source.description || 'bill'}`,
        lineItems: [{ description: source.category || source.description || 'Expense', amount: Number(source.amount || 0) }]
      }
      await (ExpensesService as any).postExpense(body)
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Expense duplicated', type: 'success' } }))
      window.dispatchEvent(new Event('data:refresh'))
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to duplicate expense', type: 'error' } }))
    }
  }

  function parseParams(raw: string): any {
    // Accept key=value pairs or comma-separated positional
    const out: any = {}
    const s = String(raw || '')
    if (s.includes('=')) {
      s.split(',').forEach(part => {
        const [k, v] = part.split('=').map(t => t?.trim())
        if (!k) return
        const key = k.toLowerCase()
        out[key] = coerce(v)
      })
      return out
    }
    const parts = s.split(',').map(t => t.trim()).filter(Boolean)
    // Heuristic positional mapping: [name, amount, category/desc, date]
    if (parts[0]) out.vendor = out.customer = parts[0]
    if (parts[1]) out.amount = coerce(parts[1])
    if (parts[2]) out.category = out.description = parts[2]
    if (parts[3]) out.date = parts[3]
    return out
  }

  function coerce(v?: string) {
    if (v == null) return v
    const t = String(v).trim().replace(/^\$\s*/, '')
    const n = Number(t)
    if (!isNaN(n)) return n
    return t
  }

  // Accept voice-initiated chat via global event
  useEffect(() => {
    const onSend = (e: any) => {
      const text = e?.detail?.text
      if (!text || !active) return
      const userMsg: Message = { id: `m-${Date.now()}`, role: 'user', content: text, ts: Date.now() }
      setThreads(prev => prev.map(t => t.id === active.id ? { ...t, title: t.messages.length ? t.title : text.slice(0, 30), messages: [...t.messages, userMsg] } : t))
      try { wsRef.current?.send(JSON.stringify({ type: 'chat', message: text, context: { threadId: active.id } })) } catch {}
    }
    window.addEventListener('chat:send', onSend as any)
    return () => window.removeEventListener('chat:send', onSend as any)
  }, [active?.id])

  if (!open) return null

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] pointer-events-none">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 modal-overlay"
          onClick={onClose}
        />
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="pointer-events-auto fixed right-0 top-0 bottom-0 w-full sm:w-[520px] p-3 sm:p-4"
        >
          <ThemedGlassSurface variant="light" className="h-full glass-modal liquid-glass p-0 overflow-hidden" hover={false}>
            {/* Header with callouts */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">AI Chat</div>
                <div className="text-xs text-secondary-contrast">Automate your finance with natural language</div>
              </div>
              <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={onClose}>Close</button>
            </div>
            <div className="p-3 flex gap-2 border-b border-white/10">
              <button className="px-3 py-1.5 text-sm rounded-lg bg-primary/15 text-primary border border-primary/30" onClick={onOpenAiDocument}>Open AI Document</button>
              <button className="px-3 py-1.5 text-sm rounded-lg bg-white/10 text-secondary-contrast border border-white/15 hover:bg-white/15" onClick={() => { try { window.dispatchEvent(new Event('ai:help')) } catch {} }}>How it works</button>
            </div>

            <div className="flex h-[calc(100%-112px)]">
              {/* Threads list */}
              <div className="w-40 sm:w-48 border-r border-white/10 p-2 overflow-y-auto">
                <button className="w-full mb-2 px-2 py-1.5 text-sm rounded-lg bg-white/10 border border-white/10 hover:bg-white/15" onClick={createThread}>+ New Chat</button>
                <div className="space-y-1">
                  {threads.map(t => (
                    <button key={t.id} className={cn('w-full text-left px-2 py-1.5 text-sm rounded-lg border', t.id === (active?.id||'') ? 'bg-primary/15 text-primary border-primary/30' : 'bg-white/5 border-white/10 hover:bg-white/10')} onClick={() => setActiveId(t.id)}>
                      {t.title || 'Untitled'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conversation */}
              <div className="flex-1 flex flex-col">
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {(active?.messages || []).map(m => (
                    <div key={m.id} className={cn('max-w-[80%] px-3 py-2 rounded-lg border', m.role === 'user' ? 'ml-auto bg-primary/15 text-primary border-primary/30' : 'bg-white/10 border-white/10')}>
                      <div className="text-xs text-secondary-contrast mb-0.5">{m.role === 'user' ? 'You' : 'Assistant'}</div>
                      <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t border-white/10 flex items-center gap-2">
                  <input className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none" placeholder="Ask anything…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }} />
                  <select className="px-2 py-2 text-xs rounded bg-white/10 border border-white/10" value={aiMode} onChange={(e) => setAiMode(e.target.value as any)} title="Assistant behavior">
                    <option value="auto">Auto</option>
                    <option value="guide">Guide</option>
                    <option value="act">Act</option>
                  </select>
                  <button className="px-3 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30" onClick={send}>Send</button>
                </div>
              </div>
            </div>
          </ThemedGlassSurface>
        </motion.div>
      </div>
    </ModalPortal>
  )
}

export default ChatDrawer


