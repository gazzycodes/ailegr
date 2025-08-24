import { useEffect, useMemo, useRef, useState } from 'react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { useTheme } from '../../theme/ThemeProvider'
import { ModalPortal } from '../layout/ModalPortal'
import { cn } from '../../lib/utils'
import { FileText, Search, Plus, Printer, Download, X, CheckCircle2, Clock3, RefreshCcw, Wallet, Paperclip } from 'lucide-react'
import { TransactionsService } from '../../services/transactionsService'
import ExpensesService from '../../services/expensesService'
import RecurringModal from '../recurring/RecurringModal'

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

type Bill = {
  id: string
  vendor: string
  vendorInvoiceNo?: string | null
  date: string
  status: InvoiceStatus
  amount: number
  amountPaid?: number
  balanceDue?: number
  paymentStatusRaw?: string
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

export function Invoices() {
  const { isDark } = useTheme()
  const [search, setSearch] = useState('')
  type SortKey = 'number' | 'date' | 'dueDate' | 'customer' | 'status' | 'amount'
  type SortDir = 'asc' | 'desc'
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
  const [billDetail, setBillDetail] = useState<Bill | null>(null)
  const [newModal, setNewModal] = useState<boolean>(false)
  const [recurringOpen, setRecurringOpen] = useState<boolean>(false)
  const [viewMode, setViewMode] = useState<'AR' | 'AP'>('AR')
  const [dateStart, setDateStart] = useState<string>('')
  const [dateEnd, setDateEnd] = useState<string>('')
  const [arStatusBusy, setArStatusBusy] = useState(false)
  const [apStatusBusy, setApStatusBusy] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [payments, setPayments] = useState<any[]>([])
  const [billPayments, setBillPayments] = useState<any[]>([])
  const isOverpaid = (status: InvoiceStatus | string) => String(status).toUpperCase() === 'OVERPAID'
  const sumPayments = (list: any[]) => list.reduce((s, p) => s + Number(p?.amount || 0), 0)
  // Data state needs to be declared before effects that reference it
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [bills, setBills] = useState<Bill[]>([])

  // Persistence
  useEffect(() => { localStorage.setItem('invoices.statuses', JSON.stringify(activeStatuses)) }, [activeStatuses])
  useEffect(() => { localStorage.setItem('invoices.compact', JSON.stringify(compact)) }, [compact])
  useEffect(() => { localStorage.setItem('invoices.print', JSON.stringify(printFriendly)) }, [printFriendly])

  useEffect(() => {
    const onRefresh = () => setRefreshTick((x) => x + 1)
    window.addEventListener('data:refresh', onRefresh)
    window.addEventListener('payments:updated', onRefresh)
    return () => {
      window.removeEventListener('data:refresh', onRefresh)
      window.removeEventListener('payments:updated', onRefresh)
    }
  }, [])

  // Load payments when a detail modal opens
  useEffect(() => {
    ;(async () => {
      try {
        if (detail) {
          const list = await (TransactionsService as any).listInvoicePayments((detail as any).id)
          setPayments(list)
        } else setPayments([])
      } catch {}
    })()
  }, [detail, refreshTick])

  useEffect(() => {
    ;(async () => {
      try {
        if (billDetail) {
          let list = await (ExpensesService as any).listExpensePayments(billDetail.id).catch(() => [])
          // Ensure synthetic initial payment exists if server hasn't included it yet
          const fromBills = Number((bills.find(b => b.id === billDetail.id)?.amountPaid) || 0)
          const fromDetail = Number((billDetail as any)?.amountPaid || 0)
          const cfPaid = Math.max(fromBills, fromDetail)
          const hasInitial = Array.isArray(list) && list.some((p: any) => String(p?.customFields?.origin || '') === 'initial')
          if (cfPaid > 0 && (!Array.isArray(list) || list.length === 0 || !hasInitial)) {
            const refBill = bills.find(b => b.id === billDetail.id)
            const synthetic = {
              id: `initial:${billDetail.id}`,
              date: billDetail.date,
              amount: cfPaid,
              reference: refBill?.vendorInvoiceNo || `EXP-${billDetail.id}`,
              description: 'Initial payment at posting',
              customFields: { type: 'expense_payment', origin: 'initial' }
            }
            list = [...(list || []), synthetic]
          }
          // Sort desc by date for display
          list.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          setBillPayments(list)
          // Compute from list plus transaction customFields fallback (authoritative)
          const paidFromList = list.reduce((s: number, p: any) => s + Number(p?.amount || 0), 0)
          const paidSum = (Array.isArray(list) && list.length > 0) ? paidFromList : cfPaid
          const dueCalc = Math.max(0, billDetail.amount - paidSum)
          const raw = (paidSum - billDetail.amount) > 0.01 ? 'overpaid' : (dueCalc <= 0.01 ? 'paid' : (paidSum > 0.01 ? 'partial' : 'unpaid'))
          const nextStatus: InvoiceStatus = dueCalc <= 0.01 ? 'PAID' : paidSum > 0.01 ? 'PARTIAL' : 'UNPAID'
          setBillDetail(prev => prev ? { ...prev, amountPaid: paidSum, balanceDue: dueCalc, status: nextStatus, paymentStatusRaw: raw } : prev)
        } else setBillPayments([])
      } catch {}
    })()
  }, [billDetail, refreshTick, bills])

  // Load data
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        if (viewMode === 'AR') {
        const list = await TransactionsService.listInvoices()
        if (cancelled) return
        const mapped: Invoice[] = Array.isArray(list) ? list.map((it: any) => {
          const amount = Number(it.amount || it.transaction?.customFields?.invoiceTotal || 0)
          const paid = Number(it?.transaction?.customFields?.amountPaid || 0)
          const due = Math.max(0, amount - paid)
          let status: InvoiceStatus = 'UNPAID'
          const db = String(it.status || 'SENT').toUpperCase()
          if (db === 'PAID') status = 'PAID'
          else if (db === 'OVERDUE') status = due > 0 && paid > 0 ? 'PARTIAL' : 'OVERDUE'
          else if (paid > 0 && due > 0) status = 'PARTIAL'
          else status = 'UNPAID'
          return {
            id: it.id,
            number: it.invoiceNumber || it.number || it.reference || `INV-${it.id}`,
            date: (it.date ? new Date(it.date) : new Date()).toISOString().slice(0,10),
            dueDate: (it.dueDate ? new Date(it.dueDate) : new Date()).toISOString().slice(0,10),
            customer: it.customer || it.transaction?.description?.replace(/^Invoice:\s*/i,'') || 'Customer',
            status,
            amount
          }
        }) : []
          setInvoices(mapped)
        } else {
          const list = await ExpensesService.listExpenses()
          if (cancelled) return
          const mapped: Bill[] = Array.isArray(list) ? list.map((e: any) => {
            const raw = String(e?.transaction?.customFields?.paymentStatus || 'unpaid').toLowerCase()
            const status: InvoiceStatus = raw === 'paid' ? 'PAID' : raw === 'partial' ? 'PARTIAL' : raw === 'overpaid' ? 'PAID' : 'UNPAID'
            const amountPaid = Number(e?.transaction?.customFields?.amountPaid || 0)
            const balanceDue = Number(e?.transaction?.customFields?.balanceDue ?? Math.max(0, Number(e.amount || 0) - amountPaid))
            return {
              id: e.id,
              vendor: e.vendor || 'Vendor',
              vendorInvoiceNo: e.vendorInvoiceNo || null,
              date: (e.date ? new Date(e.date) : new Date()).toISOString().slice(0,10),
              status,
              amount: Number(e.amount || 0),
              amountPaid,
              balanceDue,
              paymentStatusRaw: raw
            }
          }) : []
          setBills(mapped)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || `Failed to load ${viewMode === 'AR' ? 'invoices' : 'bills'}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [viewMode, refreshTick])

  const inDateRange = (d: string) => {
    if (!dateStart && !dateEnd) return true
    const t = new Date(d).getTime()
    if (dateStart && t < new Date(dateStart).getTime()) return false
    if (dateEnd && t > new Date(dateEnd).getTime()) return false
    return true
  }

  // Data pipeline - AR
  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      const q = search.trim().toLowerCase()
      const matchesQuery = q === '' || inv.number.toLowerCase().includes(q) || inv.customer.toLowerCase().includes(q)
      const matchesStatus = activeStatuses.length === 0 || activeStatuses.includes(inv.status)
      return matchesQuery && matchesStatus && inDateRange(inv.date)
    })
  }, [search, activeStatuses, invoices, dateStart, dateEnd])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'status') cmp = statusOrder[a.status] - statusOrder[b.status]
      else if (sortKey === 'amount') cmp = a.amount - b.amount
      else if (sortKey === 'date' || sortKey === 'dueDate') cmp = a[sortKey].localeCompare((b as any)[sortKey])
      else cmp = String((a as any)[sortKey]).localeCompare(String((b as any)[sortKey]))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  // Data pipeline - AP
  const filteredBills = useMemo(() => {
    return bills.filter(b => {
      const q = search.trim().toLowerCase()
      const matchesQuery = q === '' || (b.vendor?.toLowerCase().includes(q)) || (b.vendorInvoiceNo ? String(b.vendorInvoiceNo).toLowerCase().includes(q) : false)
      const matchesStatus = activeStatuses.length === 0 || activeStatuses.includes(b.status)
      return matchesQuery && matchesStatus && inDateRange(b.date)
    })
  }, [search, activeStatuses, bills, dateStart, dateEnd])

  const sortedBills = useMemo(() => {
    const arr = [...filteredBills]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'status') cmp = statusOrder[a.status] - statusOrder[b.status]
      else if (sortKey === 'amount') cmp = a.amount - b.amount
      else if (sortKey === 'date') cmp = a.date.localeCompare(b.date)
      else if (sortKey === 'customer') cmp = String(a.vendor).localeCompare(String(b.vendor))
      else if (sortKey === 'number') cmp = String(a.vendorInvoiceNo || '').localeCompare(String(b.vendorInvoiceNo || ''))
      else cmp = 0
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filteredBills, sortKey, sortDir])

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
  const useVirtual = (viewMode === 'AR' ? sorted.length : sortedBills.length) > 60

  const formatMoney = (n: number) => `$${n.toLocaleString('en-US')}`

  // AP detail totals: prefer actual payment list, but fall back to transaction customFields immediately after posting
  const paidDisplay = useMemo(() => Math.max(sumPayments(billPayments), Math.max(0, Number(billDetail?.amountPaid || 0))), [billPayments, billDetail])
  const dueDisplay = useMemo(() => Math.max(0, (billDetail?.amount || 0) - paidDisplay), [billDetail, paidDisplay])

  const toggleStatus = (s: InvoiceStatus) => {
    setActiveStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  const sortBy = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'date' || key === 'dueDate' ? 'desc' : 'asc') }
  }

  const exportCsv = () => {
    if (viewMode === 'AR') {
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
    } else {
      const rows = sortedBills.map(r => ({ vendor: r.vendor, vendorInvoiceNo: r.vendorInvoiceNo || '', date: r.date, status: statusLabel[r.status], amount: r.amount }))
      const headers = Object.keys(rows[0] || {})
      const csv = [headers.join(','), ...rows.map((r: any) => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bills.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
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
              <div className="text-xl font-semibold">{viewMode === 'AR' ? 'Invoices (AR)' : 'Bills (AP)'}</div>
              <div className="text-sm text-secondary-contrast">{viewMode === 'AR' ? 'Create, manage, and track invoices' : 'Review vendor bills and AP'}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white/10 border border-white/10 rounded-lg overflow-hidden backdrop-blur-md">
              <button className={cn('px-3 py-1.5 text-sm transition', viewMode === 'AR' ? 'bg-white/15' : 'hover:bg-white/5')} onClick={() => setViewMode('AR')}>AR Invoices</button>
              <button className={cn('px-3 py-1.5 text-sm transition', viewMode === 'AP' ? 'bg-white/15' : 'hover:bg-white/5')} onClick={() => setViewMode('AP')}>AP Bills</button>
            </div>
            {viewMode === 'AR' && (
            <button className="px-3 py-1.5 text-sm rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 backdrop-blur-md flex items-center gap-1" onClick={() => setNewModal(true)}>
              <Plus className="w-3.5 h-3.5" /> New Invoice
            </button>
            )}
            {viewMode === 'AR' && (
            <button className="px-3 py-1.5 text-sm rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 backdrop-blur-md flex items-center gap-1" onClick={() => setRecurringOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> New Recurring
            </button>
            )}
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
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={viewMode === 'AR' ? 'Search by number or customer' : 'Search by vendor or vendor invoice no.'} className={cn('pl-8 pr-3 text-sm rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md', compact ? 'py-1' : 'py-1.5')} />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['PAID','UNPAID','OVERDUE','PARTIAL','CREDIT','RECURRING','PROFORMA'] as InvoiceStatus[]).map(s => (
              <button key={s} onClick={() => toggleStatus(s)} className={cn('px-2.5 py-1 text-xs rounded-lg border transition-colors', statusToneClass[s], activeStatuses.includes(s) ? 'ring-1 ring-primary/40' : 'opacity-80 hover:opacity-100')}>{statusLabel[s]}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="px-2 py-1 text-sm rounded bg-white/10 border border-white/10 focus:bg-white/15 outline-none" />
            <span className="text-secondary-contrast text-sm">→</span>
            <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="px-2 py-1 text-sm rounded bg-white/10 border border-white/10 focus:bg-white/15 outline-none" />
            <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} /> Compact
          </label>
          </div>
        </div>
      </ThemedGlassSurface>

      {/* Table/Card block */}
      <ThemedGlassSurface variant="medium" glow className="p-4">
        {loading && <div className="text-sm text-secondary-contrast">Loading {viewMode === 'AR' ? 'invoices' : 'bills'}...</div>}
        {error && !loading && <div className="text-sm text-red-400">{error}</div>}
        {viewMode === 'AR' ? (
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
                        <div className="flex items-center gap-1">
                      <span className={cn('px-2 py-0.5 text-xs rounded-md border', statusToneClass[inv.status])}>{statusLabel[inv.status]}</span>
                        </div>
                    </td>
                    <td className="py-2 text-right font-semibold">{formatMoney(inv.amount)}</td>
                  </tr>
                ))}
                {useVirtual && <tr style={{ height: computeRange(listRef.current, sorted.length, scrollTop).padBot }} aria-hidden="true" />}
              </tbody>
            </table>
          </div>
        </div>
        ) : (
          <div className="overflow-x-auto hidden sm:block">
            <div ref={listRef as any} style={useVirtual ? { maxHeight: 420, overflowY: 'auto' } : undefined}>
              <table className={cn('reports-table w-full text-sm min-w-[720px] table-fixed', compact ? '[&_*]:py-1' : '')}>
                <colgroup>
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '20%' }} />
                </colgroup>
                <thead className="reports-thead sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2 cursor-pointer" onClick={() => sortBy('customer')}>Vendor</th>
                    <th className="px-4 py-2 cursor-pointer" onClick={() => sortBy('number')}>Vendor Invoice No.</th>
                    <th className="px-4 py-2 cursor-pointer" onClick={() => sortBy('date')}>Date</th>
                    <th className="px-4 py-2 cursor-pointer" onClick={() => sortBy('status')}>Status</th>
                    <th className="px-4 py-2 text-right cursor-pointer" onClick={() => sortBy('amount')}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {useVirtual && <tr style={{ height: computeRange(listRef.current, sortedBills.length, scrollTop).padTop }} aria-hidden="true" />}
                  {(useVirtual ? (() => {
                    const { start, end } = computeRange(listRef.current, sortedBills.length, scrollTop)
                    return sortedBills.slice(start, end).map((r, i) => ({ row: r, key: start + i }))
                  })() : sortedBills.map((r, i) => ({ row: r, key: i }))).map(({ row: bill, key }) => (
                    <tr key={key} className="border-t border-white/10 hover:bg-white/5 cursor-pointer" onClick={() => setBillDetail(bill)}>
                      <td className="py-2 truncate">{bill.vendor}</td>
                      <td className="py-2">{bill.vendorInvoiceNo || '-'}</td>
                      <td className="py-2">{bill.date}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-1">
                          <span className={cn('px-2 py-0.5 text-xs rounded-md border', statusToneClass[bill.status])}>{statusLabel[bill.status]}</span>
                          {String(bill.paymentStatusRaw || '').toLowerCase() === 'overpaid' && (
                            <span className="px-2 py-0.5 text-[11px] rounded-md border bg-red-500/15 border-red-400/30 text-red-300">Overpaid</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-right font-semibold">
                        {formatMoney(bill.amount)}
                        {(bill.amountPaid != null || bill.balanceDue != null) && (
                          <div className="mt-0.5 text-xs font-normal text-secondary-contrast">
                            Paid {formatMoney(Math.max(0, Number(bill.amountPaid || 0)))} • Due {formatMoney(Math.max(0, Number(bill.balanceDue ?? (bill.amount - (bill.amountPaid || 0)))))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {useVirtual && <tr style={{ height: computeRange(listRef.current, sortedBills.length, scrollTop).padBot }} aria-hidden="true" />}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Mobile cards */}
        <div className="sm:hidden mt-2 space-y-2">
          {viewMode === 'AR' ? (
            sorted.map((inv, i) => (
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
            ))
          ) : (
            sortedBills.map((bill, i) => (
              <div key={i} onClick={() => setBillDetail(bill)}>
                <ThemedGlassSurface variant="light" className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs text-secondary-contrast">{bill.date}</div>
                  <span className={cn('px-2 py-0.5 text-[10px] rounded border', statusToneClass[bill.status])}>{statusLabel[bill.status]}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="font-medium">{bill.vendor} • {bill.vendorInvoiceNo || '-'}</div>
                  <div className="text-right">
                    <div className="font-semibold">{formatMoney(bill.amount)}</div>
                    <div className="text-[11px] text-secondary-contrast">Paid {formatMoney(Math.max(0, Number(bill.amountPaid || 0)))} • Due {formatMoney(Math.max(0, Number(bill.balanceDue ?? (bill.amount - (bill.amountPaid || 0)))))}
                    </div>
                  </div>
                </div>
                </ThemedGlassSurface>
              </div>
            ))
          )}
        </div>
      </ThemedGlassSurface>

      {/* AR Detail Modal */}
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
                {(sumPayments(payments) - detail.amount > 0.01) && (
                  <span className="px-2 py-0.5 text-[11px] rounded-md border bg-red-500/15 border-red-400/30 text-red-300">Overpaid</span>
                )}
                <span className="text-sm text-foreground/80 ml-auto">Amount: <span className="font-semibold">{formatMoney(detail.amount)}</span></span>
                <span className="text-xs text-secondary-contrast">Paid {formatMoney(sumPayments(payments))} • Due {formatMoney(Math.max(0, detail.amount - sumPayments(payments)))}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ThemedGlassSurface variant={isDark ? 'medium' : 'light'} className="p-3">
                  <div className="text-sm font-medium mb-2">Actions</div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <button className="px-2.5 py-1 rounded border border-white/10 bg-white/10 hover:bg-white/15 backdrop-blur-md flex items-center gap-1" onClick={async () => {
                      try {
                        if (!detail) return
                        const id = (detail as any).id
                        const next = detail.status === 'PAID' ? 'UNPAID' : 'PAID'
                        setArStatusBusy(true)
                        if (next === 'PAID') {
                        await TransactionsService.markInvoicePaid(id)
                        } else {
                          await (TransactionsService as any).markInvoiceUnpaid(id)
                        }
                        setInvoices(prev => prev.map(v => v.id === id ? { ...v, status: next } : v))
                        setDetail({ ...detail, status: next })
                        window.dispatchEvent(new CustomEvent('toast', { detail: { message: `Invoice marked ${next === 'PAID' ? 'paid' : 'unpaid'}.`, type: 'success' } }))
                        window.dispatchEvent(new Event('data:refresh'))
                      } catch (e: any) {
                        const msg = e?.response?.data?.error || e?.message || 'Failed to update status'
                        window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } }))
                      } finally {
                        setArStatusBusy(false)
                      }
                    }} disabled={arStatusBusy}><CheckCircle2 className="w-3.5 h-3.5" /> {detail.status === 'PAID' ? 'Mark Unpaid' : 'Mark Paid'}</button>
                    <button className="px-2.5 py-1 rounded border border-white/10 bg-white/10 hover:bg-white/15 backdrop-blur-md flex items-center gap-1"><Download className="w-3.5 h-3.5" /> PDF</button>
                    <button className="px-2.5 py-1 rounded border border-white/10 bg-white/10 hover:bg-white/15 backdrop-blur-md flex items-center gap-1"><RefreshCcw className="w-3.5 h-3.5" /> Duplicate</button>
                    <button className="px-2.5 py-1 rounded border border-white/10 bg-white/10 hover:bg-white/15 backdrop-blur-md flex items-center gap-1" onClick={async () => {
                      try {
                        const id = (detail as any).id
                        const amt = prompt('Payment amount?', String(Math.max(0, detail.amount - sumPayments(payments))))
                        if (!amt) return
                        const date = prompt('Payment date (YYYY-MM-DD)?', new Date().toISOString().slice(0,10)) || undefined
                        const res = await TransactionsService.recordInvoicePayment(id, { amount: parseFloat(amt), date })
                        const nextUiStatus: InvoiceStatus = String(res?.invoiceStatus || '').toUpperCase() === 'PAID'
                          ? ((detail.amount - (sumPayments(payments) + parseFloat(amt))) > 0.01 ? 'PARTIAL' : 'PAID')
                          : 'UNPAID'
                        setInvoices(prev => prev.map(v => v.id === id ? { ...v, status: nextUiStatus } : v))
                        setDetail({ ...detail!, status: nextUiStatus })
                        window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Payment recorded', type: 'success' } }))
                        window.dispatchEvent(new Event('payments:updated'))
                      } catch (e: any) {
                        const msg = e?.response?.data?.error || e?.message || 'Failed to record payment'
                        window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } }))
                      }
                    }}><Wallet className="w-3.5 h-3.5" /> Record Payment</button>
                  </div>
                </ThemedGlassSurface>
                <ThemedGlassSurface variant={isDark ? 'medium' : 'light'} className="p-3">
                  <div className="text-sm font-medium mb-2">Payments</div>
                  <ul className="text-sm space-y-1 max-h-44 overflow-auto">
                    <li className="flex items-center gap-2"><Clock3 className="w-3.5 h-3.5 text-muted-contrast" /> Created {detail.date} • Due {detail.dueDate}</li>
                    {payments.map((p, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span className="text-secondary-contrast">{new Date(p.date).toISOString().slice(0,10)} • {p.reference}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{formatMoney(Number(p.amount))}</span>
                          <button className="px-2 py-0.5 text-xs rounded border border-white/10 hover:bg-white/10" onClick={async () => {
                            try {
                              const newAmtStr = prompt('Edit payment amount', String(p.amount))
                              if (!newAmtStr) return
                              const newDate = prompt('Edit payment date (YYYY-MM-DD)', new Date(p.date).toISOString().slice(0,10)) || undefined
                              // void then repost
                              await (TransactionsService as any).voidPayment(p.id)
                              await TransactionsService.recordInvoicePayment((detail as any).id, { amount: parseFloat(newAmtStr), date: newDate })
                              window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Payment updated', type: 'success' } }))
                              window.dispatchEvent(new Event('payments:updated'))
                            } catch (e: any) {
                              const msg = e?.response?.data?.error || e?.message || 'Failed to edit payment'
                              window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } }))
                            }
                          }}>Edit</button>
                          <button className="px-2 py-0.5 text-xs rounded border border-white/10 hover:bg-white/10" onClick={async () => {
                            try {
                              if (String(p?.customFields?.origin || '') === 'initial') {
                                window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Initial posting payment cannot be voided.', type: 'info' } }))
                                return
                              }
                              if (!confirm('Void this payment?')) return
                              await (TransactionsService as any).voidPayment(p.id)
                              // Immediate local update for smoother UX
                              setPayments(prev => prev.filter(row => row.id !== p.id))
                              const newPaid = Math.max(0, sumPayments(payments) - Number(p.amount))
                              const newDue = Math.max(0, detail.amount - newPaid)
                              const nextStatusLocal: InvoiceStatus = newDue <= 0.01 ? 'PAID' : newPaid > 0.01 ? 'PARTIAL' : 'UNPAID'
                              setDetail(prev => prev ? { ...prev, status: nextStatusLocal } : prev)
                              setInvoices(prev => prev.map(v => v.id === (detail as any).id ? { ...v, status: nextStatusLocal } : v))
                              window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Payment voided', type: 'success' } }))
                              setTimeout(() => window.dispatchEvent(new Event('payments:updated')), 100)
                            } catch (e: any) {
                              const msg = e?.response?.data?.error || e?.message || 'Failed to void'
                              window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } }))
                            }
                          }}>Void</button>
                        </div>
                      </li>
                    ))}
                    {payments.length === 0 && <li className="text-secondary-contrast">No payments yet</li>}
                  </ul>
                </ThemedGlassSurface>
              </div>
              </ThemedGlassSurface>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* AP Bill Detail Modal */}
      {billDetail && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] modal-overlay flex items-center justify-center p-4" onClick={() => setBillDetail(null)}>
            <div onClick={(e: any) => e.stopPropagation()}>
              <ThemedGlassSurface variant="light" className="p-6 max-w-2xl w-[92%] glass-modal liquid-glass" hover={false}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="text-lg font-semibold">{billDetail.vendor} • {billDetail.vendorInvoiceNo || '-'}</div>
                  <div className="text-sm text-secondary-contrast">{billDetail.date}</div>
                </div>
                <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={() => setBillDetail(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className={cn('px-2 py-0.5 text-xs rounded-md border', statusToneClass[billDetail.status])}>{statusLabel[billDetail.status]}</span>
                {String(billDetail.paymentStatusRaw || '').toLowerCase() === 'overpaid' && (
                  <span className="px-2 py-0.5 text-[11px] rounded-md border bg-red-500/15 border-red-400/30 text-red-300">Overpaid</span>
                )}
                <span className="text-sm text-foreground/80 ml-auto">Amount: <span className="font-semibold">{formatMoney(billDetail.amount)}</span></span>
                <span className="text-xs text-secondary-contrast">Paid {formatMoney(paidDisplay)} • Due {formatMoney(dueDisplay)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ThemedGlassSurface variant={isDark ? 'medium' : 'light'} className="p-3">
                  <div className="text-sm font-medium mb-2">Actions</div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <button className="px-2.5 py-1 rounded border border-white/10 bg-white/10 hover:bg-white/15 backdrop-blur-md flex items-center gap-1" onClick={async () => {
                      try {
                        const id = billDetail.id
                        const next = billDetail.status === 'PAID' ? 'UNPAID' : 'PAID'
                        setApStatusBusy(true)
                        if (next === 'PAID') {
                          await (ExpensesService as any).markExpensePaid(id)
                        } else {
                          await (ExpensesService as any).markExpenseUnpaid(id)
                        }
                        setBills(prev => prev.map(v => v.id === id ? { ...v, status: next } : v))
                        setBillDetail({ ...billDetail, status: next })
                        window.dispatchEvent(new CustomEvent('toast', { detail: { message: `Bill marked ${next === 'PAID' ? 'paid' : 'unpaid'}.`, type: 'success' } }))
                        window.dispatchEvent(new Event('data:refresh'))
                      } catch (e: any) {
                        const msg = e?.response?.data?.error || e?.message || 'Failed to update status'
                        window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } }))
                      } finally {
                        setApStatusBusy(false)
                      }
                    }} disabled={apStatusBusy}><CheckCircle2 className="w-3.5 h-3.5" /> {billDetail.status === 'PAID' ? 'Mark Unpaid' : 'Mark Paid'}</button>
                    <label className="px-2.5 py-1 rounded border border-white/10 bg-white/10 hover:bg-white/15 backdrop-blur-md flex items-center gap-1 cursor-pointer">
                      <Paperclip className="w-3.5 h-3.5" /> Attach Receipt
                      <input type="file" className="hidden" onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        try {
                          await (ExpensesService as any).attachReceipt(billDetail.id, f)
                          window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Receipt attached', type: 'success' } }))
                        } catch (err: any) {
                          window.dispatchEvent(new CustomEvent('toast', { detail: { message: err?.message || 'Failed to attach', type: 'error' } }))
                        }
                      }} />
                    </label>
                    <button className="px-2.5 py-1 rounded border border-white/10 bg-white/10 hover:bg-white/15 backdrop-blur-md flex items-center gap-1" onClick={async () => {
                      try {
                        const id = billDetail.id
                        const amt = prompt('Payment amount?', String(billDetail.amount))
                        if (!amt) return
                        const date = prompt('Payment date (YYYY-MM-DD)?', new Date().toISOString().slice(0,10)) || undefined
                        const res = await (ExpensesService as any).recordExpensePayment(id, { amount: parseFloat(amt), date })
                        const next = String(res?.paymentStatus || '').toLowerCase()
                        const statusMap: any = { paid: 'PAID', partial: 'PARTIAL', overpaid: 'PAID' }
                        const nextStatus: InvoiceStatus = statusMap[next] || 'PAID'
                        const newPaid = Number(res?.amountPaid ?? ((billDetail.amountPaid || 0) + parseFloat(amt)))
                        const newDue = Number(res?.balanceDue ?? Math.max(0, billDetail.amount - newPaid))
                        setBills(prev => prev.map(v => v.id === id ? { ...v, status: nextStatus, amountPaid: newPaid, balanceDue: newDue, paymentStatusRaw: next } : v))
                        setBillDetail({ ...billDetail, status: nextStatus, amountPaid: newPaid, balanceDue: newDue, paymentStatusRaw: next })
                        window.dispatchEvent(new CustomEvent('toast', { detail: { message: `Payment recorded (${nextStatus === 'PARTIAL' ? 'partial' : 'paid'})`, type: 'success' } }))
                        window.dispatchEvent(new Event('payments:updated'))
                      } catch (e: any) {
                        const msg = e?.response?.data?.error || e?.message || 'Failed to record payment'
                        window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } }))
                      }
                    }}><Wallet className="w-3.5 h-3.5" /> Record Payment</button>
                    <button className="px-2.5 py-1 rounded border border-white/10 bg-white/10 hover:bg-white/15 backdrop-blur-md flex items-center gap-1"><RefreshCcw className="w-3.5 h-3.5" /> Duplicate</button>
                  </div>
                </ThemedGlassSurface>
                <ThemedGlassSurface variant={isDark ? 'medium' : 'light'} className="p-3">
                  <div className="text-sm font-medium mb-2">Payments</div>
                  <ul className="text-sm space-y-1 max-h-44 overflow-auto">
                    <li className="flex items-center gap-2"><Clock3 className="w-3.5 h-3.5 text-muted-contrast" /> Created {billDetail.date}</li>
                    {billPayments.map((p, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span className="text-secondary-contrast">{new Date(p.date).toISOString().slice(0,10)} • {p.reference} {String(p?.customFields?.origin || '') === 'initial' ? '• Initial payment at posting' : ''}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{formatMoney(Number(p.amount))}</span>
                          <button className="px-2 py-0.5 text-xs rounded border border-white/10 hover:bg-white/10" onClick={async () => {
                            try {
                              const newAmtStr = prompt('Edit payment amount', String(p.amount))
                              if (!newAmtStr) return
                              const newDate = prompt('Edit payment date (YYYY-MM-DD)', new Date(p.date).toISOString().slice(0,10)) || undefined
                              if (String(p?.customFields?.origin || '') === 'initial') {
                                window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Initial posting payment cannot be edited here.', type: 'info' } }))
                              } else {
                                const amtNum = parseFloat(newAmtStr)
                                const delta = amtNum - Number(p.amount)
                                if (Math.abs(delta) < 0.005) return
                                if (delta > 0) {
                                  await (ExpensesService as any).recordExpensePayment(billDetail.id, { amount: delta, date: newDate })
                                } else {
                                  // For decreases, void the original and re-post the new amount
                                  await (ExpensesService as any).voidPayment(p.id)
                                  await new Promise(r => setTimeout(r, 20))
                                  await (ExpensesService as any).recordExpensePayment(billDetail.id, { amount: amtNum, date: newDate })
                                }
                              }
                              window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Payment updated', type: 'success' } }))
                              window.dispatchEvent(new Event('payments:updated'))
                            } catch (e: any) {
                              const msg = e?.response?.data?.error || e?.message || 'Failed to edit payment'
                              window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } }))
                            }
                          }}>Edit</button>
                          <button className="px-2 py-0.5 text-xs rounded border border-white/10 hover:bg-white/10" onClick={async () => {
                            try {
                              if (!confirm('Void this payment?')) return
                              if (String(p?.customFields?.origin || '') !== 'initial') {
                                await (ExpensesService as any).voidPayment(p.id)
                              } else {
                                window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Initial posting payment cannot be voided.', type: 'info' } }))
                                return
                              }
                              window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Payment voided', type: 'success' } }))
                              // Force local removal of the voided row for immediate UX
                              setBillPayments(prev => prev.filter(row => row.id !== p.id))
                              // Recompute local Paid/Due + status immediately
                              const newPaidLocal = Math.max(0, paidDisplay - Number(p.amount))
                              const newDueLocal = Math.max(0, billDetail.amount - newPaidLocal)
                              const nextStatusLocal: InvoiceStatus = newDueLocal <= 0.01 ? 'PAID' : newPaidLocal > 0.01 ? 'PARTIAL' : 'UNPAID'
                              setBillDetail(prev => prev ? { ...prev, amountPaid: newPaidLocal, balanceDue: newDueLocal, status: nextStatusLocal } : prev)
                              // Debounce the server refresh slightly to avoid flicker back to stale CF
                              setTimeout(() => window.dispatchEvent(new Event('payments:updated')), 120)
                            } catch (e: any) {
                              const msg = e?.response?.data?.error || e?.message || 'Failed to void'
                              window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } }))
                            }
                          }}>Void</button>
                        </div>
                      </li>
                    ))}
                    {billPayments.length === 0 && <li className="text-secondary-contrast">No payments yet</li>}
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

      {recurringOpen && (
        <RecurringModal open={recurringOpen} onClose={() => setRecurringOpen(false)} seed={{ type: 'INVOICE' }} />
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
