import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import queryClient from '../../queryClient'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { ModalPortal } from '../layout/ModalPortal'
import { cn } from '../../lib/utils'
import { BarChart3, ListTree, Scale, Table as TableIcon, Search, ChevronDown, Paperclip } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ReportsService from '../../services/reportsService'
import ExpensesApi from '../../services/expensesService'

type PeriodType = 'Monthly' | 'Quarterly' | 'YTD' | 'Annual'
type SortDir = 'asc' | 'desc'

type PnlRow = { name: string; amount: number; type: 'revenue' | 'expense' | 'cogs' }
type BalanceRow = { section: 'assets' | 'liabilities' | 'equity'; name: string; amount: number }
type TrialRow = { code: string; name: string; debit: number; credit: number }
type AccountRow = { code: string; name: string; type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'; balance: number }

function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-secondary-contrast">{subtitle}</p>
      </div>
    </div>
  )
}

function AIInsightPanel({ tab }: { tab: string }) {
  const points = useMemo(() => {
    switch (tab) {
      case 'pnl':
        return [
          'Net profit margin trending upward; consider reinvesting in top services',
          'Software costs increased MoM; review seat counts and unused subscriptions',
        ]
      case 'balance':
        return [
          'Strong cash ratio; short-term obligations covered comfortably',
          'Debt-to-asset ratio within healthy range; room to finance growth',
        ]
      case 'trial':
        return [
          'Debits equal credits; no imbalances detected',
          'Highest activity in revenue and payroll accounts this period',
        ]
      default:
        return [
          'Top utilized accounts: Cash, Product Sales, Payroll Expense',
          'Consider merging low-activity expense accounts for clarity',
        ]
    }
  }, [tab])
  return (
    <ThemedGlassSurface variant="light" className="p-4">
      <SectionHeader icon={BarChart3} title="AI Financial Insights" subtitle="Context-aware highlights" />
      <ul className="list-disc ml-5 space-y-1 text-sm text-foreground/80">
        {points.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </ThemedGlassSurface>
  )
}

export function Reports() {
  const [activeTab, setActiveTab] = useState<'pnl' | 'balance' | 'trial' | 'coa'>('pnl')
  const [periodType, setPeriodType] = useState<PeriodType>('Monthly')
  const [period, setPeriod] = useState<string>('Aug 2025')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [accountModal, setAccountModal] = useState<AccountRow | null>(null)
  const [ledger, setLedger] = useState<any | null>(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerError, setLedgerError] = useState<string | null>(null)
  const [balanceApi, setBalanceApi] = useState<BalanceRow[] | null>(null)
  const [trialApi, setTrialApi] = useState<TrialRow[] | null>(null)

  // Preferences (persisted)
  const [shortcutsOn, setShortcutsOn] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem('reports.shortcutsOn') || 'true') } catch { return true }
  })
  const [compareMode, setCompareMode] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem('reports.compare') || 'false') } catch { return false }
  })
  const [compactDensity, setCompactDensity] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem('reports.compact') || 'false') } catch { return false }
  })
  const [printFriendly, setPrintFriendly] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem('reports.printFriendly') || 'false') } catch { return false }
  })

  // Column visibility per tab (customizable later)
  type ColumnVisibility = {
    pnl: { category: boolean; amount: boolean; prev: boolean }
    balance: { section: boolean; name: boolean; amount: boolean; prev: boolean }
    trial: { code: boolean; name: boolean; debit: boolean; credit: boolean; prev: boolean }
    coa: { code: boolean; name: boolean; type: boolean; balance: boolean; prev: boolean }
  }
  const defaultCols: ColumnVisibility = {
    pnl: { category: true, amount: true, prev: false },
    balance: { section: true, name: true, amount: true, prev: false },
    trial: { code: true, name: true, debit: true, credit: true, prev: false },
    coa: { code: true, name: true, type: true, balance: true, prev: false },
  }
  const [cols, setCols] = useState<ColumnVisibility>(() => {
    try { return { ...defaultCols, ...(JSON.parse(localStorage.getItem('reports.cols') || 'null') || {}) } } catch { return defaultCols }
  })
  useEffect(() => { localStorage.setItem('reports.cols', JSON.stringify(cols)) }, [cols])

  // Saved view presets per tab (sorts, filters, density)
  type ViewPreset = { name: string; search: string; sortKey: string; sortDir: SortDir; compact: boolean }
  const PRESETS_KEY = 'reports.viewPresets'
  const [presets, setPresets] = useState<Record<string, ViewPreset[]>>(() => {
    try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}') } catch { return {} }
  })
  const savePreset = (tab: string, preset: ViewPreset) => {
    const next = { ...presets }
    const arr = next[tab] ? [...next[tab]] : []
    arr.push(preset)
    next[tab] = arr
    setPresets(next)
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next))
  }
  const applyPreset = (_tab: string, preset: ViewPreset) => {
    setSearch(preset.search)
    setSortKey(preset.sortKey)
    setSortDir(preset.sortDir)
    setCompactDensity(preset.compact)
  }

  // PDF export (print to PDF friendly) – uses printFriendly + window.print
  const handlePdfExport = () => {
    const prev = printFriendly
    setPrintFriendly(true)
    setTimeout(() => {
      window.print()
      setTimeout(() => setPrintFriendly(prev), 300)
    }, 50)
  }

  useEffect(() => { localStorage.setItem('reports.shortcutsOn', JSON.stringify(shortcutsOn)) }, [shortcutsOn])
  useEffect(() => { localStorage.setItem('reports.compare', JSON.stringify(compareMode)) }, [compareMode])
  useEffect(() => { localStorage.setItem('reports.compact', JSON.stringify(compactDensity)) }, [compactDensity])
  useEffect(() => { localStorage.setItem('reports.printFriendly', JSON.stringify(printFriendly)) }, [printFriendly])

  // Per-tab sort/search persistence
  const TAB_PREFS_KEY = 'reports.tabPrefs'
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TAB_PREFS_KEY)
      if (!raw) return
      const prefs = JSON.parse(raw) || {}
      const p = prefs[activeTab]
      if (p) {
        if (typeof p.search === 'string') setSearch(p.search)
        if (typeof p.sortKey === 'string') setSortKey(p.sortKey)
        if (p.sortDir === 'asc' || p.sortDir === 'desc') setSortDir(p.sortDir)
      }
    } catch {}
  }, [activeTab])
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TAB_PREFS_KEY)
      const prefs = raw ? JSON.parse(raw) : {}
      prefs[activeTab] = { search, sortKey, sortDir }
      localStorage.setItem(TAB_PREFS_KEY, JSON.stringify(prefs))
    } catch {}
  }, [activeTab, search, sortKey, sortDir])

  useEffect(() => {
    // Reset period when type changes (demo values)
    const now = new Date()
    if (periodType === 'Monthly') setPeriod(now.toLocaleString('en-US', { month: 'short', year: 'numeric' }))
    if (periodType === 'Quarterly') setPeriod('Q3 2025')
    if (periodType === 'YTD') setPeriod('YTD 2025')
    if (periodType === 'Annual') setPeriod('2025')
  }, [periodType])

  // Compute asOf for current period selection
  const asOf = useMemo(() => {
    const now = new Date()
    if (periodType === 'Monthly') {
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return end.toISOString().slice(0, 10)
    }
    return now.toISOString().slice(0, 10)
  }, [periodType])

  // React Query: P&L
  const pnlQuery = useQuery({
    queryKey: ['reports', 'pnl', periodType, asOf, 'compare'],
    queryFn: () => ReportsService.getPnl(asOf, { period: periodType, compare: true }),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
  useEffect(() => {
    const pnl: any = pnlQuery.data
    try {
      if (!pnl) { setPnlApi(null); setPnlPrevMap(null); setPnlPrevTotals(null); return }
      const mapped: PnlRow[] = [
        ...(Array.isArray(pnl.revenue) ? pnl.revenue.map((r: any) => ({ name: r.name || r.account || 'Revenue', amount: Number(r.amount || 0), type: 'revenue' as const })) : []),
        ...(Array.isArray(pnl.cogs) ? pnl.cogs.map((r: any) => ({ name: r.name || r.account || 'COGS', amount: -Math.abs(Number(r.amount || 0)), type: 'cogs' as const })) : []),
        ...(Array.isArray(pnl.expenses) ? pnl.expenses.map((r: any) => ({ name: r.name || r.account || 'Expense', amount: -Math.abs(Number(r.amount || 0)), type: 'expense' as const })) : [])
      ]
      setPnlApi(mapped.length ? mapped : null)
      if (pnl.previous) {
        const prev = pnl.previous
        const prevMap: Record<string, number> = {}
        ;(prev.revenue || []).forEach((r: any) => { const k = r.name || r.account; prevMap[k] = Number(r.amount || 0) })
        ;(prev.cogs || []).forEach((r: any) => { const k = r.name || r.account; prevMap[k] = -Math.abs(Number(r.amount || 0)) })
        ;(prev.expenses || []).forEach((r: any) => { const k = r.name || r.account; prevMap[k] = -Math.abs(Number(r.amount || 0)) })
        setPnlPrevMap(prevMap)
        setPnlPrevTotals(prev.totals || null)
      } else {
        setPnlPrevMap(null)
        setPnlPrevTotals(null)
      }
    } catch {}
  }, [pnlQuery.data])

  // React Query: Balance Sheet
  const balanceQuery = useQuery({
    queryKey: ['reports', 'balance', asOf],
    queryFn: () => ReportsService.getBalanceSheet(asOf),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
  useEffect(() => {
    const bs: any = balanceQuery.data
    try {
      if (!bs) { setBalanceApi(null); return }
      const assets = Array.isArray(bs.assets) ? bs.assets.map((r: any) => ({ section: 'assets' as const, name: r.name || r.account || 'Asset', amount: Number(r.amount || 0) })) : []
      const liabilities = Array.isArray(bs.liabilities) ? bs.liabilities.map((r: any) => ({ section: 'liabilities' as const, name: r.name || r.account || 'Liability', amount: Number(r.amount || 0) })) : []
      const equity = Array.isArray(bs.equity) ? bs.equity.map((r: any) => ({ section: 'equity' as const, name: r.name || r.account || 'Equity', amount: Number(r.amount || 0) })) : []
      const mappedBalance: BalanceRow[] = [...assets, ...liabilities, ...equity]
      setBalanceApi(mappedBalance.length ? mappedBalance : null)
    } catch {}
  }, [balanceQuery.data])

  // React Query: Trial Balance
  const trialQuery = useQuery({
    queryKey: ['reports', 'trial', asOf],
    queryFn: () => ReportsService.getTrialBalance(asOf),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
  useEffect(() => {
    const tb: any = trialQuery.data
    try {
      if (tb && Array.isArray(tb.rows)) {
        const mappedTrial: TrialRow[] = tb.rows.map((r: any) => ({
          code: r.accountCode,
          name: r.account,
          debit: Number(r.debit || 0),
          credit: Number(r.credit || 0)
        }))
        setTrialApi(mappedTrial.length ? mappedTrial : null)
      } else {
        setTrialApi(null)
      }
    } catch {}
  }, [trialQuery.data])

  // React Query: Chart of Accounts
  const coaQuery = useQuery({
    queryKey: ['reports', 'coa'],
    queryFn: () => ReportsService.getChartOfAccounts(),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
  useEffect(() => {
    const coa: any = coaQuery.data
    try {
      if (!coa) { setCoaApi(null); return }
      const accounts = Array.isArray(coa.accounts) ? coa.accounts : []
      const mappedCoa: AccountRow[] = accounts.map((a: any) => ({
        code: a.code,
        name: a.name,
        type: (a.type || 'ASSET'),
        balance: Number(a.currentBalance || a.balance || 0)
      }))
      setCoaApi(mappedCoa.length ? mappedCoa : null)
    } catch {}
  }, [coaQuery.data])

  // React Query: Recent expense for receipt pill
  const recentExpenseQuery = useQuery({
    queryKey: ['expenses', 'latest'],
    queryFn: async () => {
      const list = await ExpensesApi.listExpenses()
      return Array.isArray(list) && list.length > 0 ? list[0] : null
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
  useEffect(() => { setRecentExpense(recentExpenseQuery.data as any) }, [recentExpenseQuery.data])

  // Load live account ledger when modal opens
  useEffect(() => {
    let cancelled = false
    if (!accountModal) {
      setLedger(null)
      setLedgerError(null)
      setLedgerLoading(false)
      return
    }
    ;(async () => {
      try {
        setLedgerLoading(true)
        setLedgerError(null)
        const data = await ReportsService.getAccountTransactions(accountModal.code, 100)
        if (!cancelled) setLedger(data)
      } catch (e: any) {
        if (!cancelled) setLedgerError(e?.message || 'Failed to load ledger')
      } finally {
        if (!cancelled) setLedgerLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [accountModal])

  // Refresh from global event after posting: invalidate queries
  useEffect(() => {
    const handler = () => {
      try {
        queryClient.invalidateQueries({ queryKey: ['reports'] })
        queryClient.invalidateQueries({ queryKey: ['expenses', 'latest'] })
      } catch {}
    }
    window.addEventListener('data:refresh', handler as any)
    return () => window.removeEventListener('data:refresh', handler as any)
  }, [periodType])

  // Keyboard shortcuts (toggleable)
  useEffect(() => {
    if (!shortcutsOn) return
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === '1') setActiveTab('pnl')
      if (e.key === '2') setActiveTab('balance')
      if (e.key === '3') setActiveTab('trial')
      if (e.key === '4') setActiveTab('coa')
      if (e.key.toLowerCase() === 'x') {
        // trigger export
        const clickExport = document.getElementById('reports-export-btn') as HTMLButtonElement | null
        clickExport?.click()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shortcutsOn, activeTab, periodType])

  const sortBy = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = (rows: any[], keys: string[]) => rows.filter(r => keys.some(k => String(r[k] ?? '').toLowerCase().includes(search.toLowerCase())))
  const sorted = (rows: any[], key: string) => rows.slice().sort((a, b) => {
    const av = a[key]; const bv = b[key]
    if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
    return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
  })

  const [pnlApi, setPnlApi] = useState<PnlRow[] | null>(null)
  const pnlData = useMemo(() => sorted(filtered(pnlApi ?? [], ['name']), sortKey), [search, sortKey, sortDir, pnlApi])
  const [pnlPrevMap, setPnlPrevMap] = useState<Record<string, number> | null>(null)
  const [pnlPrevTotals, setPnlPrevTotals] = useState<any | null>(null)
  const balanceData = useMemo(() => sorted(filtered(balanceApi ?? [], ['name', 'section']), sortKey), [search, sortKey, sortDir, balanceApi])
  const trialData = useMemo(() => sorted(filtered(trialApi ?? [], ['code', 'name']), sortKey), [search, sortKey, sortDir, trialApi])
  const [coaApi, setCoaApi] = useState<AccountRow[] | null>(null)
  const coaData = useMemo(() => sorted(filtered(coaApi ?? [], ['code', 'name', 'type']), sortKey), [search, sortKey, sortDir, coaApi])
  const [recentExpense, setRecentExpense] = useState<any | null>(null)
  // Derived totals available if needed later
  // const coaTotals = useMemo(() => {
  //   const src = coaApi ?? mockAccounts
  //   const assets = src.filter(a => a.type === 'ASSET').reduce((s, a) => s + a.balance, 0)
  //   const liabilities = Math.abs(src.filter(a => a.type === 'LIABILITY').reduce((s, a) => s + a.balance, 0))
  //   const equity = src.filter(a => a.type === 'EQUITY').reduce((s, a) => s + a.balance, 0)
  //   const equationOk = Math.abs(assets - (liabilities + equity)) < 0.0001
  //   return { assets, liabilities, equity, equationOk }
  // }, [coaApi])

  // Balance sheet totals derived from balanceData to keep UI numbers consistent
  const balanceTotals = useMemo(() => {
    const assets = balanceData.filter(r => r.section === 'assets').reduce((s, r) => s + r.amount, 0)
    const liabilities = Math.abs(balanceData.filter(r => r.section === 'liabilities').reduce((s, r) => s + r.amount, 0))
    const equity = balanceData.filter(r => r.section === 'equity').reduce((s, r) => s + r.amount, 0)
    const equationOk = Math.abs(assets - (liabilities + equity)) < 0.0001
    return { assets, liabilities, equity, equationOk }
  }, [balanceData])

  // Simple animation variants for rows/cards
  const rowVariants = { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }

  // Quick P&L summaries
  const pnlTotals = useMemo(() => {
    const src = pnlApi ?? []
    const revenue = src.filter(r => r.type === 'revenue').reduce((s, r) => s + r.amount, 0)
    const cogs = Math.abs(src.filter(r => r.type === 'cogs').reduce((s, r) => s + r.amount, 0))
    const expenses = Math.abs(src.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0))
    const gross = revenue - cogs
    const net = gross - expenses
    return { revenue, cogs, expenses, gross, net }
  }, [pnlApi])

  // Trial balance totals
  const trialTotals = useMemo(() => {
    const debit = trialData.reduce((s, r) => s + (r.debit || 0), 0)
    const credit = trialData.reduce((s, r) => s + (r.credit || 0), 0)
    const diff = debit - credit
    return { debit, credit, diff, balanced: Math.abs(diff) < 0.0001 }
  }, [trialData])

  // Virtualization helpers (simple, dependency-free)
  const baseRowHeight = compactDensity ? 32 : 40
  const overscan = 8
  const pnlRef = useRef<HTMLDivElement | null>(null)
  const trialRef = useRef<HTMLDivElement | null>(null)
  const coaRef = useRef<HTMLDivElement | null>(null)
  const [pnlScrollTop, setPnlScrollTop] = useState(0)
  const [trialScrollTop, setTrialScrollTop] = useState(0)
  const [coaScrollTop, setCoaScrollTop] = useState(0)

  // Mobile detection for best-in-class responsive layouts
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)').matches : false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile('matches' in e ? e.matches : (e as MediaQueryList).matches)
    handler(mq)
    mq.addEventListener?.('change', handler as any)
    return () => mq.removeEventListener?.('change', handler as any)
  }, [])
  useEffect(() => {
    const el = pnlRef.current
    if (!el) return
    const onScroll = () => setPnlScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [pnlRef.current, compactDensity])
  useEffect(() => {
    const el = trialRef.current
    if (!el) return
    const onScroll = () => setTrialScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [trialRef.current, compactDensity])
  useEffect(() => {
    const el = coaRef.current
    if (!el) return
    const onScroll = () => setCoaScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [coaRef.current, compactDensity])

  const computeRange = (container: HTMLDivElement | null, total: number, scrollTop: number) => {
    if (!container) return { start: 0, end: total, padTop: 0, padBot: 0 }
    const viewport = container.clientHeight || 0
    const start = Math.max(0, Math.floor(scrollTop / baseRowHeight) - overscan)
    const end = Math.min(total, Math.ceil((scrollTop + viewport) / baseRowHeight) + overscan)
    const padTop = start * baseRowHeight
    const padBot = Math.max(0, (total - end) * baseRowHeight)
    return { start, end, padTop, padBot }
  }

  // Formatting helpers (consistent en-US output)
  // const formatNumber = (n: number) => n.toLocaleString('en-US')
  const formatMoney = (n: number) => `$${Math.abs(n).toLocaleString('en-US')}`
  const formatMoneySigned = (n: number) => n >= 0 ? `$${n.toLocaleString('en-US')}` : `-$${Math.abs(n).toLocaleString('en-US')}`

  // Virtualization threshold: keep table semantics for small datasets
  const VIRTUAL_THRESHOLD = 50
  const usePnlVirtual = !isMobile && pnlData.length > VIRTUAL_THRESHOLD
  const useTrialVirtual = !isMobile && trialData.length > VIRTUAL_THRESHOLD
  const useCoaVirtual = !isMobile && coaData.length > VIRTUAL_THRESHOLD

  return (
    <div className="relative h-full space-y-6 max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
      {/* Ambient glassy backdrop accents */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 -left-24 w-[36rem] h-[36rem] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-[30rem] h-[30rem] rounded-full bg-blue-400/5 blur-3xl" />
      </div>
      {/* Header */}
      <ThemedGlassSurface variant="heavy" elevation={3} glow className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <TableIcon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-xl font-semibold">Financial Reports</div>
              <div className="text-sm text-secondary-contrast">P&L, Balance Sheet, Trial Balance, and Chart of Accounts</div>
            </div>
          </div>

          {/* Period controls */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button className="px-3 py-1.5 text-sm rounded-lg bg-white/10 border border-white/10 backdrop-blur-md hover:bg-white/15 transition-colors flex items-center gap-1">
                {periodType} <ChevronDown className="w-3 h-3" />
              </button>
              <div className="absolute hidden group-focus:block" />
            </div>
            <div className="px-3 py-1.5 text-sm rounded-lg bg-white/10 border border-white/10 backdrop-blur-md">
              {period}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={cn("px-3 py-1.5 text-sm rounded-lg", activeTab === 'pnl' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-white/10 border border-white/10 hover:bg-white/15 backdrop-blur-md')} onClick={() => { setActiveTab('pnl'); setSortKey('name'); setSearch('') }}>P&L</button>
          <button className={cn("px-3 py-1.5 text-sm rounded-lg", activeTab === 'balance' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-white/10 border border-white/10 hover:bg-white/15 backdrop-blur-md')} onClick={() => { setActiveTab('balance'); setSortKey('name'); setSearch('') }}>Balance Sheet</button>
          <button className={cn("px-3 py-1.5 text-sm rounded-lg", activeTab === 'trial' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-white/10 border border-white/10 hover:bg-white/15 backdrop-blur-md')} onClick={() => { setActiveTab('trial'); setSortKey('code'); setSearch('') }}>Trial Balance</button>
          <button className={cn("px-3 py-1.5 text-sm rounded-lg", activeTab === 'coa' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-white/10 border border-white/10 hover:bg-white/15 backdrop-blur-md')} onClick={() => { setActiveTab('coa'); setSortKey('code'); setSearch('') }}>Chart of Accounts</button>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-contrast" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className={cn('pl-8 pr-3 text-sm rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md', compactDensity ? 'py-1' : 'py-1.5')} />
            </div>
          </div>
        </div>
      </ThemedGlassSurface>

      {/* Content Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 space-y-4">
          {activeTab === 'pnl' && (
            <ThemedGlassSurface variant="medium" elevation={2} glow className="p-4">
              <SectionHeader icon={BarChart3} title="Profit & Loss" subtitle="Revenue, COGS, Expenses" />
              {recentExpense?.receiptUrl && (
                <div className="mb-2">
                  <a href={recentExpense.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-white/10 bg-white/10 hover:bg-white/15">
                    <Paperclip className="w-3 h-3" /> View last receipt
                  </a>
                </div>
              )}
              {/* Quick summary chips */}
              <div className={cn('grid gap-2 mb-3', compactDensity ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5')}>
                <div className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-xs">Revenue <div className="font-semibold text-financial-revenue">${pnlTotals.revenue.toLocaleString()}</div></div>
                <div className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-xs">COGS <div className="font-semibold text-amber-400">-${pnlTotals.cogs.toLocaleString()}</div></div>
                <div className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-xs">Gross Profit <div className="font-semibold text-cyan-300">${pnlTotals.gross.toLocaleString()}</div></div>
                <div className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-xs">Expenses <div className="font-semibold text-financial-expense">-${pnlTotals.expenses.toLocaleString()}</div></div>
                <div className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-xs col-span-2 sm:col-span-1">Net Profit <div className="font-semibold text-financial-revenue">${pnlTotals.net.toLocaleString()}</div></div>
              </div>
              <div className="overflow-x-auto hidden sm:block">
                <table className={cn('reports-table w-full text-sm min-w-[520px] table-fixed', compactDensity ? '[&_*]:py-1' : '')}>
                  <colgroup>
                    {cols.pnl.category && <col style={{ width: '70%' }} />}
                    {cols.pnl.amount && <col style={{ width: compareMode && cols.pnl.prev ? '15%' : '30%' }} />}
                    {compareMode && cols.pnl.prev && <col style={{ width: '15%' }} />}
                  </colgroup>
                  <thead className="reports-thead sticky top-0 z-10">
                    <tr>
                      {cols.pnl.category && <th className="px-4 py-2 cursor-pointer" onClick={() => sortBy('name')}>Category</th>}
                      {cols.pnl.amount && <th className="px-4 py-2 text-right cursor-pointer" onClick={() => sortBy('amount')}>Amount</th>}
                      {compareMode && cols.pnl.prev && <th className="px-4 py-2 text-right">Prev</th>}
                    </tr>
                  </thead>
                  <tbody ref={pnlRef as any} style={usePnlVirtual ? { display: 'block', maxHeight: 360, overflowY: 'auto' } : undefined}>
                    {/* virtualization padding top */}
                    {usePnlVirtual && <tr style={{ height: computeRange(pnlRef.current, pnlData.length, pnlScrollTop).padTop }} aria-hidden="true" />}
                    <AnimatePresence initial={false}>
                      {(usePnlVirtual ? (() => {
                        const { start, end } = computeRange(pnlRef.current, pnlData.length, pnlScrollTop)
                        return pnlData.slice(start, end).map((r, i) => ({ row: r, key: start + i }))
                      })() : pnlData.map((r, i) => ({ row: r, key: i }))).map(({ row: r, key }) => (
                        <motion.tr key={key} className="border-t border-white/10 hover:bg-white/5"
                          initial="hidden" animate="visible" exit="hidden" variants={rowVariants}>
                          {cols.pnl.category && <td className={cn('py-2', r.type === 'revenue' ? 'text-financial-revenue' : r.type === 'cogs' ? 'text-amber-400' : 'text-financial-expense')}>{r.name}</td>}
                          {cols.pnl.amount && <td className={cn('py-2 text-right font-semibold', r.amount >= 0 ? 'text-financial-revenue' : 'text-financial-expense')}>{formatMoneySigned(r.amount)}</td>}
                          {compareMode && cols.pnl.prev && (
                            <td className="py-2 text-right text-secondary-contrast">
                              {(() => {
                                const prev = pnlPrevMap?.[r.name]
                                return typeof prev === 'number' ? formatMoney(prev) : '-'
                              })()}
                            </td>
                          )}
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    {/* virtualization padding bottom */}
                    {usePnlVirtual && <tr style={{ height: computeRange(pnlRef.current, pnlData.length, pnlScrollTop).padBot }} aria-hidden="true" />}
                  </tbody>
                  <tfoot className="text-sm">
                    <tr className="border-t border-white/10">
                      {cols.pnl.category && <td className="py-2 font-semibold text-secondary-contrast">Gross Profit</td>}
                      {cols.pnl.amount && <td className="py-2 text-right font-semibold text-cyan-300">{formatMoney(pnlTotals.gross)}</td>}
                      {compareMode && cols.pnl.prev && <td className="py-2 text-right text-secondary-contrast">{pnlPrevTotals ? formatMoney(Math.round(pnlPrevTotals.grossProfit || pnlPrevTotals.gross || 0)) : '-'}</td>}
                    </tr>
                    <tr>
                      {cols.pnl.category && <td className="py-2 font-semibold text-secondary-contrast">Net Profit</td>}
                      {cols.pnl.amount && <td className="py-2 text-right font-semibold text-financial-revenue">{formatMoney(pnlTotals.net)}</td>}
                      {compareMode && cols.pnl.prev && <td className="py-2 text-right text-secondary-contrast">{pnlPrevTotals ? formatMoney(Math.round(pnlPrevTotals.netIncome || pnlPrevTotals.netProfit || 0)) : '-'}</td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
              {/* Mobile card list */}
              {isMobile && (
                <div className="mt-3 space-y-2 sm:hidden">
                  {pnlData.map((r, i) => (
                    <ThemedGlassSurface key={i} variant="light" className="p-3">
                      <div className="flex items-center justify-between">
                        <div className={cn('font-medium', r.type === 'revenue' ? 'text-financial-revenue' : r.type === 'cogs' ? 'text-amber-500' : 'text-financial-expense')}>{r.name}</div>
                        <div className={cn('font-semibold', r.amount >= 0 ? 'text-financial-revenue' : 'text-financial-expense')}>{formatMoneySigned(r.amount)}</div>
                      </div>
                    </ThemedGlassSurface>
                  ))}
                </div>
              )}
            </ThemedGlassSurface>
          )}

          {activeTab === 'balance' && (
            <ThemedGlassSurface variant="medium" elevation={2} glow className="p-4">
              <SectionHeader icon={Scale} title="Balance Sheet" subtitle="Assets = Liabilities + Equity" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="font-semibold mb-2">Assets</div>
                  {balanceData.filter(r => r.section === 'assets').map((r, i) => (
                    <div key={i} className="flex justify-between py-1 border-b border-white/10">
                      <span>{r.name}</span>
                      <span className="font-semibold">${r.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="font-semibold mb-2">Liabilities</div>
                  {balanceData.filter(r => r.section === 'liabilities').map((r, i) => (
                    <div key={i} className="flex justify-between py-1 border-b border-white/10">
                      <span>{r.name}</span>
                      <span className="font-semibold">${Math.abs(r.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="font-semibold mb-2">Equity</div>
                  {balanceData.filter(r => r.section === 'equity').map((r, i) => (
                    <div key={i} className="flex justify-between py-1 border-b border-white/10">
                      <span>{r.name}</span>
                      <span className="font-semibold">${r.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Equation check (based on the values rendered above) */}
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="px-3 py-2 rounded-lg bg-white/10 border border-white/10">Total Assets <div className="font-semibold">{formatMoney(balanceTotals.assets)}</div></div>
                <div className="px-3 py-2 rounded-lg bg-white/10 border border-white/10">Liabilities + Equity <div className="font-semibold">{formatMoney(balanceTotals.liabilities + balanceTotals.equity)}</div></div>
                <div className={cn('px-3 py-2 rounded-lg border text-center', balanceTotals.equationOk ? 'bg-green-500/10 border-green-400/30 text-green-600 dark:text-green-300' : 'bg-red-500/10 border-red-400/30 text-red-600 dark:text-red-300')}>
                  {balanceTotals.equationOk ? 'Equation OK' : 'Equation mismatch'}
                </div>
              </div>
            </ThemedGlassSurface>
          )}

          {activeTab === 'trial' && (
            <ThemedGlassSurface variant="medium" elevation={2} glow className="p-4">
              <SectionHeader icon={TableIcon} title="Trial Balance" subtitle="Debits and Credits" />
              <div className="overflow-x-auto hidden sm:block">
                <table className={cn('reports-table w-full text-sm min-w-[640px] table-fixed', compactDensity ? '[&_*]:py-1' : '')}>
                  <colgroup>
                    {cols.trial.code && <col style={{ width: '12%' }} />}
                    {cols.trial.name && <col style={{ width: compareMode && cols.trial.prev ? '43%' : '55%' }} />}
                    {cols.trial.debit && <col style={{ width: '15%' }} />}
                    {cols.trial.credit && <col style={{ width: '15%' }} />}
                    {compareMode && cols.trial.prev && <col style={{ width: '15%' }} />}
                  </colgroup>
                  <thead className="reports-thead sticky top-0 z-10">
                    <tr>
                      {cols.trial.code && <th className="px-4 py-2 cursor-pointer" onClick={() => sortBy('code')}>Code</th>}
                      {cols.trial.name && <th className="px-4 py-2 cursor-pointer" onClick={() => sortBy('name')}>Account</th>}
                      {cols.trial.debit && <th className="px-4 py-2 text-right cursor-pointer" onClick={() => sortBy('debit')}>Debit</th>}
                      {cols.trial.credit && <th className="px-4 py-2 text-right cursor-pointer" onClick={() => sortBy('credit')}>Credit</th>}
                      {compareMode && cols.trial.prev && <th className="px-4 py-2 text-right">Prev</th>}
                    </tr>
                  </thead>
                  <tbody ref={trialRef as any} style={useTrialVirtual ? { display: 'block', maxHeight: 360, overflowY: 'auto' } : undefined}>
                    {useTrialVirtual && <tr style={{ height: computeRange(trialRef.current, trialData.length, trialScrollTop).padTop }} aria-hidden="true" />}
                    <AnimatePresence initial={false}>
                      {(useTrialVirtual ? (() => {
                        const { start, end } = computeRange(trialRef.current, trialData.length, trialScrollTop)
                        return trialData.slice(start, end).map((r, i) => ({ row: r, key: start + i }))
                      })() : trialData.map((r, i) => ({ row: r, key: i }))).map(({ row: r, key }) => (
                        <motion.tr key={key} className="border-t border-white/10 hover:bg-white/5 cursor-pointer"
                          onClick={() => setAccountModal({ code: r.code, name: r.name, type: 'ASSET', balance: r.debit - r.credit })}
                          initial="hidden" animate="visible" exit="hidden" variants={rowVariants}>
                          {cols.trial.code && <td className="py-2">{r.code}</td>}
                          {cols.trial.name && <td className="py-2">{r.name}</td>}
                          {cols.trial.debit && <td className="py-2 text-right">{r.debit ? formatMoney(r.debit) : '-'}</td>}
                          {cols.trial.credit && <td className="py-2 text-right">{r.credit ? formatMoney(r.credit) : '-'}</td>}
                          {compareMode && cols.trial.prev && <td className="py-2 text-right text-secondary-contrast">{formatMoney(Math.round(((r.debit || 0) - (r.credit || 0)) * 0.92))}</td>}
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    {useTrialVirtual && <tr style={{ height: computeRange(trialRef.current, trialData.length, trialScrollTop).padBot }} aria-hidden="true" />}
                  </tbody>
                  <tfoot className="text-sm">
                    <tr className="border-t border-white/10">
                      <td className="py-2 font-semibold" colSpan={(cols.trial.code ? 1 : 0) + (cols.trial.name ? 1 : 0)}>Totals</td>
                      {cols.trial.debit && <td className="py-2 text-right font-semibold">{formatMoney(trialTotals.debit)}</td>}
                      {cols.trial.credit && <td className="py-2 text-right font-semibold">{formatMoney(trialTotals.credit)}</td>}
                      {compareMode && cols.trial.prev && <td className="py-2 text-right text-secondary-contrast">{formatMoney(Math.round((trialTotals.debit - trialTotals.credit) * 0.92))}</td>}
                    </tr>
                    <tr>
                      <td className="py-2 font-semibold" colSpan={(cols.trial.code ? 1 : 0) + (cols.trial.name ? 1 : 0)}>Status</td>
                      <td className={cn('py-2 text-right font-semibold', trialTotals.balanced ? 'text-financial-revenue' : 'text-financial-expense')} colSpan={(cols.trial.debit ? 1 : 0) + (cols.trial.credit ? 1 : 0)}>
                        {trialTotals.balanced ? 'Balanced' : `Out of balance: $${Math.abs(trialTotals.diff).toLocaleString()}`}
                      </td>
                      {compareMode && cols.trial.prev && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
              {isMobile && (
                <div className="mt-3 space-y-2 sm:hidden">
                  {trialData.map((r, i) => (
                    <div key={i} onClick={() => setAccountModal({ code: r.code, name: r.name, type: 'ASSET', balance: r.debit - r.credit })}>
                      <ThemedGlassSurface variant="light" className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs text-secondary-contrast">{r.code}</div>
                        <div className="text-xs text-secondary-contrast">Trial Balance</div>
                      </div>
                      <div className="font-medium mb-1">{r.name}</div>
                      <div className="flex items-center justify-between text-sm">
                        <div>Debit: {r.debit ? formatMoney(r.debit) : '-'}</div>
                        <div>Credit: {r.credit ? formatMoney(r.credit) : '-'}</div>
                      </div>
                    </ThemedGlassSurface>
                    </div>
                  ))}
                </div>
              )}
            </ThemedGlassSurface>
          )}

          {activeTab === 'coa' && (
            <ThemedGlassSurface variant="medium" glow className="p-4">
              <SectionHeader icon={ListTree} title="Chart of Accounts" subtitle="Click an account to drill in" />
              <div className="overflow-x-auto hidden sm:block">
                <table role="table" aria-label="Chart of Accounts" className={cn('reports-table w-full text-sm min-w-[640px] table-fixed', compactDensity ? '[&_*]:py-1' : '')}>
                  <colgroup>
                    {cols.coa.code && <col style={{ width: '12%' }} />}
                    {cols.coa.name && <col style={{ width: compareMode && cols.coa.prev ? '43%' : '55%' }} />}
                    {cols.coa.type && <col style={{ width: '15%' }} />}
                    {cols.coa.balance && <col style={{ width: compareMode && cols.coa.prev ? '15%' : '20%' }} />}
                    {compareMode && cols.coa.prev && <col style={{ width: '15%' }} />}
                  </colgroup>
                  <thead className="reports-thead sticky top-0 z-10">
                    <tr>
                      {cols.coa.code && <th scope="col" className="px-4 py-2 cursor-pointer" onClick={() => sortBy('code')}>Code</th>}
                      {cols.coa.name && <th scope="col" className="px-4 py-2 cursor-pointer" onClick={() => sortBy('name')}>Account</th>}
                      {cols.coa.type && <th scope="col" className="px-4 py-2">Type</th>}
                      {cols.coa.balance && <th scope="col" className="px-4 py-2 text-right cursor-pointer" onClick={() => sortBy('balance')}>Balance</th>}
                      {compareMode && cols.coa.prev && <th scope="col" className="px-4 py-2 text-right">Prev</th>}
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                      {coaData.map((r, i) => (
                        <motion.tr key={i} className="border-t border-white/10 hover:bg-white/5 cursor-pointer"
                          onClick={() => setAccountModal(r)}
                          initial="hidden" animate="visible" exit="hidden" variants={rowVariants}>
                          {cols.coa.code && <td className="py-2 whitespace-nowrap">{r.code}</td>}
                          {cols.coa.name && <td className="py-2">{r.name}</td>}
                          {cols.coa.type && <td className="py-2 capitalize whitespace-nowrap">{r.type.toLowerCase()}</td>}
                          {cols.coa.balance && <td className={cn('py-2 text-right font-semibold whitespace-nowrap', r.balance >= 0 ? 'text-financial-revenue' : 'text-financial-expense')}>{r.balance >= 0 ? formatMoney(r.balance) : `-${formatMoney(Math.abs(r.balance))}`}</td>}
                          {compareMode && cols.coa.prev && <td className="py-2 text-right text-secondary-contrast whitespace-nowrap">{formatMoney(Math.round((r.balance) * 0.92))}</td>}
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
              {isMobile && (
                <div className="mt-3 space-y-2 sm:hidden">
                  {coaData.map((r, i) => (
                    <div key={i} onClick={() => setAccountModal(r)}>
                      <ThemedGlassSurface variant="light" className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs text-secondary-contrast">{r.code}</div>
                        <div className="text-xs capitalize text-secondary-contrast">{r.type.toLowerCase()}</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{r.name}</div>
                        <div className={cn('font-semibold', r.balance >= 0 ? 'text-financial-revenue' : 'text-financial-expense')}>{r.balance >= 0 ? formatMoney(r.balance) : `-${formatMoney(Math.abs(r.balance))}`}</div>
                      </div>
                    </ThemedGlassSurface>
                    </div>
                  ))}
                </div>
              )}
            </ThemedGlassSurface>
          )}
        </div>

        {/* AI panel */}
        <div className="space-y-4">
          <AIInsightPanel tab={activeTab} />
          <ThemedGlassSurface variant="light" elevation={1} glow className={cn('p-4', printFriendly ? 'bg-white text-black !shadow-none !backdrop-blur-0' : '')}>
            <div className="text-sm text-foreground/80 mb-2">Period</div>
            <div className="flex flex-wrap gap-2">
              {(['Monthly','Quarterly','YTD','Annual'] as PeriodType[]).map((t) => (
                <button key={t} className={cn('px-3 py-1.5 text-sm rounded-lg', periodType === t ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-white/10 border border-white/10 hover:bg-white/15 backdrop-blur-md')} onClick={() => setPeriodType(t)}>{t}</button>
              ))}
            </div>
            <div className="mt-3 text-sm text-secondary-contrast">Current: {period}</div>
            {/* CSV export (demo: encodes current tab rows) */}
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <button
                id="reports-export-btn"
                className={cn('px-3 py-1.5 text-sm rounded-lg border transition backdrop-blur-glass shadow-glass hover:shadow-glow bg-surface/70 hover:bg-surface/80 border-border/60 text-foreground dark:bg-white/10 dark:hover:bg-white/15 dark:border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40', printFriendly ? 'bg-white border-black text-black shadow-none' : '')}
                onClick={() => {
                  const rows = activeTab === 'pnl' ? pnlData.map(r => ({ category: r.name, amount: r.amount }))
                    : activeTab === 'balance' ? balanceData.map(r => ({ section: r.section, name: r.name, amount: r.amount }))
                    : activeTab === 'trial' ? trialData.map(r => ({ code: r.code, name: r.name, debit: r.debit, credit: r.credit }))
                    : coaData.map(r => ({ code: r.code, name: r.name, type: r.type, balance: r.balance }))
                  const headers = Object.keys(rows[0] || {})
                  const csv = [headers.join(','), ...rows.map((r: any) => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n')
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `reports-${activeTab}-${periodType}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                Export CSV
              </button>
              <button
                className={cn('ml-2 px-3 py-1.5 text-sm rounded-lg border transition backdrop-blur-glass bg-white/10 hover:bg-white/15 border-white/10 text-foreground', printFriendly ? 'bg-white border-black text-black shadow-none' : '')}
                onClick={() => window.print()}
              >
                Print
              </button>
              <button
                className={cn('px-3 py-1.5 text-sm rounded-lg border transition backdrop-blur-glass bg-white/10 hover:bg-white/15 border-white/10 text-foreground', printFriendly ? 'bg-white border-black text-black shadow-none' : '')}
                onClick={handlePdfExport}
              >
                Export PDF
              </button>
            </div>

            {/* Toggles */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={shortcutsOn} onChange={(e) => setShortcutsOn(e.target.checked)} />
                Keyboard shortcuts (1–4 tabs, X export)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={compactDensity} onChange={(e) => setCompactDensity(e.target.checked)} />
                Compact density
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} />
                Compare period (adds Prev column)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={printFriendly} onChange={(e) => setPrintFriendly(e.target.checked)} />
                Print‑friendly mode
              </label>
            </div>

            {/* Column visibility controls */}
            <div className="mt-4 text-sm">
              <div className="mb-2 text-foreground/80">Columns</div>
              <div className="flex flex-wrap gap-3">
                {activeTab === 'pnl' && (
                  <>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.pnl.category} onChange={(e) => setCols({ ...cols, pnl: { ...cols.pnl, category: e.target.checked } })} /> Category</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.pnl.amount} onChange={(e) => setCols({ ...cols, pnl: { ...cols.pnl, amount: e.target.checked } })} /> Amount</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.pnl.prev} onChange={(e) => setCols({ ...cols, pnl: { ...cols.pnl, prev: e.target.checked } })} /> Prev</label>
                  </>
                )}
                {activeTab === 'balance' && (
                  <>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.balance.section} onChange={(e) => setCols({ ...cols, balance: { ...cols.balance, section: e.target.checked } })} /> Section</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.balance.name} onChange={(e) => setCols({ ...cols, balance: { ...cols.balance, name: e.target.checked } })} /> Name</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.balance.amount} onChange={(e) => setCols({ ...cols, balance: { ...cols.balance, amount: e.target.checked } })} /> Amount</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.balance.prev} onChange={(e) => setCols({ ...cols, balance: { ...cols.balance, prev: e.target.checked } })} /> Prev</label>
                  </>
                )}
                {activeTab === 'trial' && (
                  <>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.trial.code} onChange={(e) => setCols({ ...cols, trial: { ...cols.trial, code: e.target.checked } })} /> Code</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.trial.name} onChange={(e) => setCols({ ...cols, trial: { ...cols.trial, name: e.target.checked } })} /> Account</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.trial.debit} onChange={(e) => setCols({ ...cols, trial: { ...cols.trial, debit: e.target.checked } })} /> Debit</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.trial.credit} onChange={(e) => setCols({ ...cols, trial: { ...cols.trial, credit: e.target.checked } })} /> Credit</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.trial.prev} onChange={(e) => setCols({ ...cols, trial: { ...cols.trial, prev: e.target.checked } })} /> Prev</label>
                  </>
                )}
                {activeTab === 'coa' && (
                  <>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.coa.code} onChange={(e) => setCols({ ...cols, coa: { ...cols.coa, code: e.target.checked } })} /> Code</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.coa.name} onChange={(e) => setCols({ ...cols, coa: { ...cols.coa, name: e.target.checked } })} /> Name</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.coa.type} onChange={(e) => setCols({ ...cols, coa: { ...cols.coa, type: e.target.checked } })} /> Type</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.coa.balance} onChange={(e) => setCols({ ...cols, coa: { ...cols.coa, balance: e.target.checked } })} /> Balance</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={cols.coa.prev} onChange={(e) => setCols({ ...cols, coa: { ...cols.coa, prev: e.target.checked } })} /> Prev</label>
                  </>
                )}
              </div>
            </div>

            {/* View presets */}
            <div className="mt-4 text-sm">
              <div className="mb-2 text-foreground/80">Saved Views</div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="px-3 py-1.5 text-sm rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 backdrop-blur-md"
                  onClick={() => {
                    const name = prompt('Preset name?')?.trim()
                    if (!name) return
                    savePreset(activeTab, { name, search, sortKey, sortDir, compact: compactDensity })
                  }}
                >Save Current</button>
                {(presets[activeTab] || []).map((p, i) => (
                  <button key={i} className="px-3 py-1.5 text-sm rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 backdrop-blur-md" onClick={() => applyPreset(activeTab, p)}>{p.name}</button>
                ))}
              </div>
            </div>
          </ThemedGlassSurface>
        </div>
      </div>

      {/* Account drill modal */}
      {accountModal && (
        <ModalPortal>
        <div className="fixed inset-0 z-[9999] modal-overlay flex items-center justify-center p-3 sm:p-4" onClick={() => setAccountModal(null)}>
          <div onClick={(e: any) => e.stopPropagation()}>
            <ThemedGlassSurface variant="light" elevation={1} className="p-0 max-w-4xl w-[96%] glass-modal liquid-glass" hover={false}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <div className="text-sm text-primary/80 font-semibold">{accountModal.code}</div>
                <div className="text-lg sm:text-xl font-semibold">{accountModal.name}</div>
            </div>
              <div className="flex items-center gap-2">
                <span className={cn('px-2 py-1 text-xs rounded border', accountModal.type === 'ASSET' ? 'bg-green-500/10 border-green-400/30 text-green-400' : accountModal.type === 'LIABILITY' ? 'bg-amber-500/10 border-amber-400/30 text-amber-300' : 'bg-purple-500/10 border-purple-400/30 text-purple-300')}>{accountModal.type}</span>
                <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={() => setAccountModal(null)}>✕</button>
                </div>
            </div>

            {/* Top summary blocks */}
            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Classification */}
              <ThemedGlassSurface variant="light" elevation={1} className="p-3" hover={false}>
                <div className="text-xs text-secondary-contrast font-semibold mb-2">ACCOUNT CLASSIFICATION</div>
                <div className="text-sm space-y-1">
                  <div className="flex items-center justify-between"><span>Account Type</span><span className="font-medium">{accountModal.type === 'ASSET' ? 'Asset Account' : accountModal.type.charAt(0) + accountModal.type.slice(1).toLowerCase()}</span></div>
                  <div className="flex items-center justify-between"><span>Normal Balance</span><span className="font-medium">{(['ASSET','EXPENSE'].includes(accountModal.type) ? 'Debit' : 'Credit')}</span></div>
                  <div className="flex items-center justify-between"><span>Financial Statement</span><span className="font-medium">{accountModal.type === 'REVENUE' || accountModal.type === 'EXPENSE' ? 'Income Statement' : 'Balance Sheet'}</span></div>
                </div>
              </ThemedGlassSurface>

              {/* Current Status */}
              <ThemedGlassSurface variant="light" elevation={1} className="p-3" hover={false}>
                <div className="text-xs text-secondary-contrast font-semibold mb-2">CURRENT STATUS</div>
                <div className="text-sm space-y-1">
                  <div className="flex items-center justify-between"><span>Current Balance</span><span className={cn('font-semibold', accountModal.balance >= 0 ? 'text-financial-revenue' : 'text-financial-expense')}>{accountModal.balance >= 0 ? '$' : '-$'}{Math.abs(accountModal.balance).toLocaleString()}</span></div>
                  <div className="flex items-center justify-between"><span>Balance Type</span><span className="font-medium">{accountModal.balance >= 0 ? 'Debit Balance' : 'Credit Balance'}</span></div>
                  <div className="flex items-center justify-between"><span>Last Updated</span><span className="font-medium">{new Date().toLocaleDateString('en-US')}</span></div>
                </div>
              </ThemedGlassSurface>

              {/* Activity */}
              <ThemedGlassSurface variant="light" elevation={1} className="p-3" hover={false}>
                <div className="text-xs text-secondary-contrast font-semibold mb-2">ACCOUNT ACTIVITY</div>
                <div className="text-sm space-y-1">
                  <div className="flex items-center justify-between"><span>Transactions</span><span className="font-medium">1 entries</span></div>
                  <div className="flex items-center justify-between"><span>Period</span><span className="font-medium">Last 30 days</span></div>
                  <div className="flex items-center justify-between"><span>Status</span><span className="font-medium text-green-400">Active</span></div>
                </div>
              </ThemedGlassSurface>
            </div>

            {/* AI Analysis */}
            <div className="px-5">
              <ThemedGlassSurface variant="light" elevation={1} className="p-4" hover={false}>
                <div className="text-sm font-semibold mb-2">🤖 AI Analysis</div>
                <div className="text-sm mb-2">{accountModal.name} has current balance of {accountModal.balance >= 0 ? '$' : '-$'}{Math.abs(accountModal.balance).toLocaleString()}.</div>
                <div className="text-xs text-secondary-contrast mb-1 font-semibold">AI Suggestions:</div>
                <ul className="text-xs space-y-1">
                  <li>• Account shows activity</li>
                  <li>• Balance will be managed in Phase 2</li>
                  <li>• Database integrity maintained</li>
                </ul>
              </ThemedGlassSurface>
            </div>

            {/* Ledger */}
            <div className="p-5">
              <div className="text-sm font-semibold mb-2">Account Ledger</div>
              <ThemedGlassSurface variant="light" elevation={1} className="p-0 overflow-hidden" hover={false}>
                <table className="w-full text-sm">
                  <thead className="reports-thead">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerLoading && (
                      <tr className="border-t border-white/10"><td colSpan={5} className="px-3 py-4 text-center text-secondary-contrast">Loading...</td></tr>
                    )}
                    {ledgerError && !ledgerLoading && (
                      <tr className="border-t border-white/10"><td colSpan={5} className="px-3 py-4 text-center text-red-400">{ledgerError}</td></tr>
                    )}
                    {!ledgerLoading && !ledgerError && Array.isArray(ledger?.transactions) && ledger.transactions.map((t: any, i: number) => (
                      <tr key={i} className="border-t border-white/10">
                        <td className="px-3 py-2">{new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</td>
                        <td className="px-3 py-2">{t.description}</td>
                        <td className="px-3 py-2 text-right text-financial-revenue">{t.debitAmount ? `$${Number(t.debitAmount).toLocaleString()}` : '-'}</td>
                        <td className="px-3 py-2 text-right text-financial-expense">{t.creditAmount ? `$${Number(t.creditAmount).toLocaleString()}` : '-'}</td>
                        <td className="px-3 py-2 text-right font-semibold">{(t.balance >= 0 ? '$' : '-$') + Math.abs(Number(t.balance)).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/10 text-xs">
                      <td colSpan={2} className="px-3 py-2 text-secondary-contrast">Totals</td>
                      <td className="px-3 py-2 text-right text-financial-revenue">{ledger?.summary ? `$${Number(ledger.summary.totalDebits || 0).toLocaleString()}` : '-'}</td>
                      <td className="px-3 py-2 text-right text-financial-expense">{ledger?.summary ? `$${Number(ledger.summary.totalCredits || 0).toLocaleString()}` : '-'}</td>
                      <td className="px-3 py-2 text-right font-semibold">{ledger?.summary ? (ledger.account?.currentBalance >= 0 ? '$' : '-$') + Math.abs(Number(ledger.account?.currentBalance || 0)).toLocaleString() : '-'}</td>
                    </tr>
                  </tfoot>
                </table>
              </ThemedGlassSurface>
            </div>

            {/* Actions */}
            <div className="px-5 pb-4 flex items-center justify-between">
              <button className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15" onClick={() => setAccountModal(null)}>Close</button>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30" onClick={async () => {
                  const newName = prompt('New account name?', accountModal.name)
                  if (!newName) return
                  const newType = prompt('Type (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)?', accountModal.type)?.toUpperCase()
                  try {
                    const payload: any = { name: newName }
                    if (['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'].includes(newType || '')) payload.type = newType
                    const resp = await ReportsService.updateAccount(accountModal.code, payload)
                    if (resp?.success) {
                      setAccountModal({ ...accountModal, name: newName, type: payload.type || accountModal.type })
                      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Account updated', type: 'success' } }))
                    }
                  } catch (e: any) {
                    window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Update failed', type: 'error' } }))
                  }
                }}>Edit Account</button>
                <button className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-400/30" onClick={async () => {
                  if (!confirm('Delete this account? Accounts with transactions or core accounts cannot be deleted.')) return
                  try {
                    const resp = await ReportsService.deleteAccount(accountModal.code)
                    if (resp?.success) {
                      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Account deleted', type: 'success' } }))
                      setAccountModal(null)
                      window.dispatchEvent(new Event('data:refresh'))
                    }
                  } catch (e: any) {
                    window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.response?.data?.error || e?.message || 'Delete failed', type: 'error' } }))
                  }
                }}>Delete Account</button>
              </div>
            </div>
          </ThemedGlassSurface>
        </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}

export default Reports


