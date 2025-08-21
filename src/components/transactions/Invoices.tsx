import { useEffect, useMemo, useRef, useState } from 'react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { useTheme } from '../../theme/ThemeProvider'
import { ModalPortal } from '../layout/ModalPortal'
import { cn } from '../../lib/utils'
import { FileText, Search, Plus, Printer, Download, X, CheckCircle2, Clock3, AlertCircle, RefreshCcw, Wallet } from 'lucide-react'
import { TransactionsService } from '../../services/transactionsService'

type InvoiceStatus = 'PAID' | 'UNPAID' | 'OVERDUE' | 'PARTIAL' | 'CREDIT' | 'RECURRING' | 'PROFORMA'

type Invoice = {
  id: string
  number: string
  date: string
  dueDate: string
  customer: string
  status: InvoiceStatus
  amount: number
}

const statusOrder: Record<InvoiceStatus, number> = {
  PAID: 0,
  UNPAID: 1,
  OVERDUE: 2,
  PARTIAL: 3,
  CREDIT: 4,
  RECURRING: 5,
  PROFORMA: 6
}

const statusLabel: Record<InvoiceStatus, string> = {
  PAID: 'Paid',
  UNPAID: 'Unpaid',
  OVERDUE: 'Overdue',
  PARTIAL: 'Partial',
  CREDIT: 'Credit Note',
  RECURRING: 'Recurring',
  PROFORMA: 'Proforma'
}

const statusToneClass: Record<InvoiceStatus, string> = {
  PAID: 'bg-green-500/15 border-green-400/30 text-green-600 dark:text-green-300',
  UNPAID: 'bg-amber-500/10 border-amber-400/25 text-amber-600 dark:text-amber-300',
  OVERDUE: 'bg-red-500/10 border-red-400/30 text-red-600 dark:text-red-300',
  PARTIAL: 'bg-blue-500/10 border-blue-400/25 text-blue-600 dark:text-blue-300',
  CREDIT: 'bg-cyan-500/10 border-cyan-400/25 text-cyan-600 dark:text-cyan-300',
  RECURRING: 'bg-purple-500/10 border-purple-400/25 text-purple-600 dark:text-purple-300',
  PROFORMA: 'bg-neutral-500/10 border-neutral-400/25 text-foreground'
}

// Removed MOCK_INVOICES; we always fetch from API

type SortKey = 'number' | 'date' | 'dueDate' | 'customer' | 'status' | 'amount'
type SortDir = 'asc' | 'desc'

export function Invoices() {
  const { isDark } = useTheme()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeStatuses, setActiveStatuses] = useState<InvoiceStatus[]>(() => {
    try { return JSON.parse(localStorage.getItem('invoices.statuses') || '[]') || [] } catch { return [] }
  })
  const [compact, setCompact] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem('invoices.compact') || 'false') } catch { return false }
  })
  const [printFriendly] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem('invoices.print') || 'false') } catch { return false }
  })
  const [detail, setDetail] = useState<Invoice | null>(null)
  const [newModal, setNewModal] = useState<boolean>(false)

  // Persistence
  useEffect(() => { localStorage.setItem('invoices.statuses', JSON.stringify(activeStatuses)) }, [activeStatuses])
  useEffect(() => { localStorage.setItem('invoices.compact', JSON.stringify(compact)) }, [compact])
  useEffect(() => { localStorage.setItem('invoices.print', JSON.stringify(printFriendly)) }, [printFriendly])

  // Load invoices from backend
  const [invoices, setInvoices] = useState<Invoice[]>([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const list = await TransactionsService.listInvoices()
        if (cancelled) return
        const mapped: Invoice[] = Array.isArray(list) ? list.map((it: any) => ({
          id: it.id,
          number: it.invoiceNumber || it.number || it.reference || `INV-${it.id}`,
          date: (it.date ? new Date(it.date) : new Date()).toISOString().slice(0,10),
          dueDate: (it.dueDate ? new Date(it.dueDate) : new Date()).toISOString().slice(0,10),
          customer: it.customer || it.transaction?.description?.replace(/^Invoice:\s*/i,'') || 'Customer',
          status: (it.status || 'SENT') === 'PAID' ? 'PAID' : 'UNPAID',
          amount: Number(it.amount || it.transaction?.amount || 0)
        })) : []
        if (mapped.length) setInvoices(mapped)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load invoices')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Data pipeline
  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      const q = search.trim().toLowerCase()
      const matchesQuery = q === '' || inv.number.toLowerCase().includes(q) || inv.customer.toLowerCase().includes(q)
      const matchesStatus = activeStatuses.length === 0 || activeStatuses.includes(inv.status)
      return matchesQuery && matchesStatus
    })
  }, [search, activeStatuses, invoices])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'status') cmp = statusOrder[a.status] - statusOrder[b.status]
      else if (sortKey === 'amount') cmp = a.amount - b.amount
      else if (sortKey === 'date' || sortKey === 'dueDate') cmp = a[sortKey].localeCompare(b[sortKey])
      else cmp = String(a[sortKey]).localeCompare(String(b[sortKey]))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  // Virtualization
  const listRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const baseRow = compact ? 44 : 56
  const overscan = 10
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const onScroll = () => setScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [listRef.current, compact])
  const computeRange = (container: HTMLDivElement | null, total: number, st: number) => {
    if (!container) return { start: 0, end: total, padTop: 0, padBot: 0 }
    const viewport = container.clientHeight || 0
    const start = Math.max(0, Math.floor(st / baseRow) - overscan)
    const end = Math.min(total, Math.ceil((st + viewport) / baseRow) + overscan)
    const padTop = start * baseRow
    const padBot = Math.max(0, (total - end) * baseRow)
    return { start, end, padTop, padBot }
  }
  const useVirtual = sorted.length > 60

  const formatMoney = (n: number) => `$${n.toLocaleString('en-US')}`

  const toggleStatus = (s: InvoiceStatus) => {
    setActiveStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  const sortBy = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'date' || key === 'dueDate' ? 'desc' : 'asc') }
  }

  const exportCsv = () => {
    const rows = sorted.map(r => ({ number: r.number, date: r.date, dueDate: r.dueDate, customer: r.customer, status: statusLabel[r.status], amount: r.amount }))
    const headers = Object.keys(rows[0] || {})
    const csv = [headers.join(','), ...rows.map((r: any) => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoices.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="relative h-full space-y-6 max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
      {/* Ambient accents */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-20 -left-24 w-[30rem] h-[30rem] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-[28rem] h-[28rem] rounded-full bg-blue-400/5 blur-3xl" />
      </div>

      {/* Header */}
      <ThemedGlassSurface variant="heavy" glow className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-xl font-semibold">Invoices</div>
              <div className="text-sm text-secondary-contrast">Create, manage, and track invoices</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 text-sm rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 backdrop-blur-md flex items-center gap-1" onClick={() => setNewModal(true)}>
              <Plus className="w-3.5 h-3.5" /> New Invoice
            </button>
            <button className={cn('px-3 py-1.5 text-sm rounded-lg border transition backdrop-blur-glass bg-white/10 hover:bg-white/15 border-white/10 text-foreground', printFriendly ? 'bg-white border-black text-black shadow-none' : '')} onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" />
            </button>
            <button className={cn('px-3 py-1.5 text-sm rounded-lg border transition backdrop-blur-glass bg-white/10 hover:bg-white/15 border-white/10 text-foreground', printFriendly ? 'bg-white border-black text-black shadow-none' : '')} onClick={exportCsv}>
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-contrast" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by number or customer" className={cn('pl-8 pr-3 text-sm rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md', compact ? 'py-1' : 'py-1.5')} />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['PAID','UNPAID','OVERDUE','PARTIAL','CREDIT','RECURRING','PROFORMA'] as InvoiceStatus[]).map(s => (
              <button key={s} onClick={() => toggleStatus(s)} className={cn('px-2.5 py-1 text-xs rounded-lg border transition-colors', statusToneClass[s], activeStatuses.includes(s) ? 'ring-1 ring-primary/40' : 'opacity-80 hover:opacity-100')}>{statusLabel[s]}</button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} /> Compact
          </label>
        </div>
      </ThemedGlassSurface>

      {/* Table/Card block */}
      <ThemedGlassSurface variant="medium" glow className="p-4">
        {loading && <div className="text-sm text-secondary-contrast">Loading invoices...</div>}
        {error && !loading && <div className="text-sm text-red-400">{error}</div>}
        <div className="overflow-x-auto hidden sm:block">
          <div ref={listRef as any} style={useVirtual ? { maxHeight: 420, overflowY: 'auto' } : undefined}>
            <table className={cn('reports-table w-full text-sm min-w-[720px] table-fixed', compact ? '[&_*]:py-1' : '')}>
              <colgroup>
                <col style={{ width: '14%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead className="reports-thead sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 cursor-pointer" onClick={() => sortBy('number')}>Invoice #</th>
                  <th className="px-4 py-2 cursor-pointer" onClick={() => sortBy('date')}>Date</th>
                  <th className="px-4 py-2 cursor-pointer" onClick={() => sortBy('dueDate')}>Due</th>
                  <th className="px-4 py-2 cursor-pointer" onClick={() => sortBy('customer')}>Customer</th>
                  <th className="px-4 py-2 cursor-pointer" onClick={() => sortBy('status')}>Status</th>
                  <th className="px-4 py-2 text-right cursor-pointer" onClick={() => sortBy('amount')}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {useVirtual && <tr style={{ height: computeRange(listRef.current, sorted.length, scrollTop).padTop }} aria-hidden="true" />}
                {(useVirtual ? (() => {
                  const { start, end } = computeRange(listRef.current, sorted.length, scrollTop)
                  return sorted.slice(start, end).map((r, i) => ({ row: r, key: start + i }))
                })() : sorted.map((r, i) => ({ row: r, key: i }))).map(({ row: inv, key }) => (
                  <tr key={key} className="border-t border-white/10 hover:bg-white/5 cursor-pointer" onClick={() => setDetail(inv)}>
                    <td className="py-2">{inv.number}</td>
                    <td className="py-2">{inv.date}</td>
                    <td className="py-2">{inv.dueDate}</td>
                    <td className="py-2 truncate">{inv.customer}</td>
                    <td className="py-2">
                      <span className={cn('px-2 py-0.5 text-xs rounded-md border', statusToneClass[inv.status])}>{statusLabel[inv.status]}</span>
                    </td>
                    <td className="py-2 text-right font-semibold">{formatMoney(inv.amount)}</td>
                  </tr>
                ))}
                {useVirtual && <tr style={{ height: computeRange(listRef.current, sorted.length, scrollTop).padBot }} aria-hidden="true" />}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden mt-2 space-y-2">
          {sorted.map((inv, i) => (
            <div key={i} onClick={() => setDetail(inv)}>
              <ThemedGlassSurface variant="light" className="p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-secondary-contrast">{inv.date} → {inv.dueDate}</div>
                <span className={cn('px-2 py-0.5 text-[10px] rounded border', statusToneClass[inv.status])}>{statusLabel[inv.status]}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="font-medium">{inv.number} • {inv.customer}</div>
                <div className="font-semibold">{formatMoney(inv.amount)}</div>
              </div>
              </ThemedGlassSurface>
            </div>
          ))}
        </div>
      </ThemedGlassSurface>

      {/* Detail Modal */}
      {detail && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] modal-overlay flex items-center justify-center p-4" onClick={() => setDetail(null)}>
            <div onClick={(e: any) => e.stopPropagation()}>
              <ThemedGlassSurface variant="light" className="p-6 max-w-2xl w-[92%] glass-modal liquid-glass" hover={false}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="text-lg font-semibold">{detail.number}</div>
                  <div className="text-sm text-secondary-contrast">{detail.customer} • {detail.date} → Due {detail.dueDate}</div>
                </div>
                <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={() => setDetail(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className={cn('px-2 py-0.5 text-xs rounded-md border', statusToneClass[detail.status])}>{statusLabel[detail.status]}</span>
                <span className="text-sm text-foreground/80 ml-auto">Amount: <span className="font-semibold">{formatMoney(detail.amount)}</span></span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ThemedGlassSurface variant={isDark ? 'medium' : 'light'} className="p-3">
                  <div className="text-sm font-medium mb-2">Actions</div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <button className="px-2.5 py-1 rounded border border-white/10 bg-white/10 hover:bg-white/15 backdrop-blur-md flex items-center gap-1" onClick={async () => {
                      try {
                        const id = (detail as any).id
                        await TransactionsService.markInvoicePaid(id)
                        setInvoices(prev => prev.map(v => v.id === id ? { ...v, status: 'PAID' } : v))
                        window.dispatchEvent(new Event('data:refresh'))
                      } catch (e: any) {
                        window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to mark paid', type: 'error' } }))
                      }
                    }}><CheckCircle2 className="w-3.5 h-3.5" /> Mark Paid</button>
                    <button className="px-2.5 py-1 rounded border border-white/10 bg-white/10 hover:bg-white/15 backdrop-blur-md flex items-center gap-1"><Download className="w-3.5 h-3.5" /> PDF</button>
                    <button className="px-2.5 py-1 rounded border border-white/10 bg-white/10 hover:bg-white/15 backdrop-blur-md flex items-center gap-1"><RefreshCcw className="w-3.5 h-3.5" /> Duplicate</button>
                    <button className="px-2.5 py-1 rounded border border-white/10 bg-white/10 hover:bg-white/15 backdrop-blur-md flex items-center gap-1" onClick={async () => {
                      try {
                        const id = (detail as any).id
                        const amt = prompt('Payment amount?', String(detail.amount))
                        if (!amt) return
                        const date = prompt('Payment date (YYYY-MM-DD)?', new Date().toISOString().slice(0,10)) || undefined
                        await TransactionsService.recordInvoicePayment(id, { amount: parseFloat(amt), date })
                        setInvoices(prev => prev.map(v => v.id === id ? { ...v, status: 'PAID' } : v))
                        window.dispatchEvent(new Event('data:refresh'))
                      } catch (e: any) {
                        window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to record payment', type: 'error' } }))
                      }
                    }}><Wallet className="w-3.5 h-3.5" /> Record Payment</button>
                  </div>
                </ThemedGlassSurface>
                <ThemedGlassSurface variant={isDark ? 'medium' : 'light'} className="p-3">
                  <div className="text-sm font-medium mb-2">Recent Activity</div>
                  <ul className="text-sm space-y-1">
                    <li className="flex items-center gap-2"><Clock3 className="w-3.5 h-3.5 text-muted-contrast" /> Created {detail.date}</li>
                    <li className="flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5 text-muted-contrast" /> Due {detail.dueDate}</li>
                  </ul>
                </ThemedGlassSurface>
              </div>
              </ThemedGlassSurface>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* New Invoice Modal */}
      {newModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] modal-overlay flex items-center justify-center p-4" onClick={() => setNewModal(false)}>
            <div onClick={(e: any) => e.stopPropagation()}>
              <ThemedGlassSurface variant="light" className="p-6 max-w-2xl w-[92%] glass-modal liquid-glass" hover={false}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="text-lg font-semibold">New Invoice</div>
                  <div className="text-sm text-secondary-contrast">Fill details and create.
                  </div>
                </div>
                <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={() => setNewModal(false)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <InvoiceForm onClose={() => setNewModal(false)} onCreated={(inv) => {
                setInvoices(prev => [inv, ...prev])
                setNewModal(false)
                window.dispatchEvent(new Event('data:refresh'))
              }} />
              </ThemedGlassSurface>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}

export default Invoices


function InvoiceForm({ onClose, onCreated }: { onClose: () => void; onCreated: (inv: Invoice) => void }) {
  const [customer, setCustomer] = useState('')
  const [number, setNumber] = useState('')
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [dueDate, setDueDate] = useState<string>(() => new Date(new Date().setDate(new Date().getDate()+14)).toISOString().slice(0,10))
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    try {
      setSaving(true)
      setError(null)
      const payload = {
        customerName: customer,
        amount: parseFloat(amount || '0'),
        date,
        description: `Invoice for ${customer}`,
        invoiceNumber: number || undefined,
        paymentStatus: 'paid' as const
      }
      const res = await TransactionsService.postInvoice(payload)
      const inv: Invoice = {
        id: res?.transactionId || String(Date.now()),
        number: payload.invoiceNumber || `INV-${Date.now()}`,
        date,
        dueDate,
        customer,
        status: 'PAID',
        amount: payload.amount
      }
      onCreated(inv)
    } catch (e: any) {
      setError(e?.message || 'Failed to create invoice')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-secondary-contrast">Customer</span>
          <input value={customer} onChange={e=>setCustomer(e.target.value)} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" placeholder="Customer name" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-secondary-contrast">Invoice #</span>
          <input value={number} onChange={e=>setNumber(e.target.value)} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" placeholder="INV-2042" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-secondary-contrast">Date</span>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-secondary-contrast">Due Date</span>
          <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-secondary-contrast">Amount</span>
          <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" placeholder="0.00" />
        </label>
      </div>
      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="px-3 py-1.5 text-sm rounded-lg border transition backdrop-blur-glass bg-white/10 hover:bg-white/15 border-white/10 text-foreground" onClick={onClose} disabled={saving}>Close</button>
        <button className="px-3 py-1.5 text-sm rounded-lg bg-primary/20 text-primary border border-primary/30" onClick={submit} disabled={saving || !customer || !amount}>Create</button>
      </div>
    </div>
  )
}
