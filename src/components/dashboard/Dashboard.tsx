import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import queryClient from '../../queryClient'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3
} from 'lucide-react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { FinancialMetricCard } from './FinancialMetricCard'
import { LiquidCashFlowVisualization } from './LiquidCashFlowVisualization'
import { BusinessHealthOrb } from './BusinessHealthOrb'
import { PredictiveInsights } from './PredictiveInsights'
import { useTheme } from '../../theme/ThemeProvider'
import { cn } from '../../lib/utils'
import SegmentedControl from '../themed/SegmentedControl'
import PremiumLoader from '../themed/PremiumLoader'
import ExpensesApi from '../../services/expensesService'
import { listInvoices } from '../../services/transactionsService'
import { FinancialDataService } from '../../services/financialDataService'

interface DashboardProps {
  businessHealth: number
}



type RecentItem = { id: string; description: string; amount: number; type: 'expense' | 'revenue'; category?: string; date?: string }

export function Dashboard({ businessHealth }: DashboardProps) {
  const [timeRange, setTimeRange] = useState<'1M' | '3M' | '6M' | '1Y'>('1M')
  const [isLoading, setIsLoading] = useState(true)
  const { currentTheme } = useTheme()
  const [recent, setRecent] = useState<RecentItem[]>([])

  // Simulate loading state
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1000)
    return () => clearTimeout(timer)
  }, [])

  // Container animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.5,
        ease: [0.23, 1, 0.32, 1]
      }
    }
  }

  // Real data state with safe fallback for development
  const [financialData, setFinancialData] = useState(() => ({
    revenue: { current: 125840, previous: 98760, trend: 'up' as const, change: 27.4 },
    expenses: { current: 89340, previous: 76890, trend: 'up' as const, change: 16.2 },
    profit: { current: 36500, previous: 21870, trend: 'up' as const, change: 66.9 },
    cashFlow: { current: 45200, previous: 32100, trend: 'up' as const, change: 40.8 },
    series: undefined as undefined | { labels?: string[]; revenue?: number[]; expenses?: number[]; profit?: number[] }
  }))

  const monthsForRange = (range: '1M' | '3M' | '6M' | '1Y') => {
    switch (range) {
      case '1M': return 1
      case '3M': return 3
      case '6M': return 6
      default: return 12
    }
  }

  const dashboardQuery = useQuery({
    queryKey: ['dashboard', timeRange],
    queryFn: async () => {
      const res = await FinancialDataService.getDashboardData()
      return res
    },
    select: (result: any) => {
      if (!result?.metrics) return null
      const m = result.metrics
      return {
        revenue: { current: Number(m.totalRevenue || 0), previous: Number(m.totalRevenue || 0), trend: 'up' as const, change: 0 },
        expenses: { current: Number(m.totalExpenses || 0), previous: Number(m.totalExpenses || 0), trend: 'up' as const, change: 0 },
        profit: { current: Number(m.netProfit || 0), previous: Number(m.netProfit || 0), trend: 'up' as const, change: 0 },
        cashFlow: { current: Number((m.netProfit ?? (m.totalRevenue - m.totalExpenses)) || 0), previous: Number((m.netProfit ?? (m.totalRevenue - m.totalExpenses)) || 0), trend: 'up' as const, change: 0 },
        series: undefined,
        aiInsights: Array.isArray(result.aiInsights) ? result.aiInsights : []
      }
    },
    placeholderData: (prev) => prev,
    staleTime: 15000,
    refetchInterval: 30000,
  })

  // Recent activity: merge latest expenses (negative) and invoices (positive), sort desc by date
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [expenses, invoices] = await Promise.all([
          ExpensesApi.listExpenses().catch(() => []),
          listInvoices().catch(() => [])
        ])
        if (cancelled) return
        const expItems: RecentItem[] = (Array.isArray(expenses) ? expenses : []).slice(0, 50).map((e: any) => ({
          id: e.id,
          description: e.description || e.transaction?.description || `Expense: ${e.vendor}`,
          amount: -Math.abs(Number(e.amount || 0)),
          type: 'expense',
          category: e.categoryKey,
          date: e.date || e.transaction?.date
        }))
        const invItems: RecentItem[] = (Array.isArray(invoices) ? invoices : []).slice(0, 50).map((i: any) => ({
          id: i.id,
          description: i.description || i.transaction?.description || `Invoice: ${i.customer}`,
          amount: Math.abs(Number(i.amount || i.transaction?.amount || 0)),
          type: 'revenue',
          category: 'Invoice',
          date: i.date || i.transaction?.date
        }))
        const merged = [...expItems, ...invItems]
          .filter(it => Number.isFinite(it.amount))
          .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
          .slice(0, 10)
        setRecent(merged)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const d: any = dashboardQuery.data
    if (d) {
      setFinancialData({
        revenue: d.revenue,
        expenses: d.expenses,
        profit: d.profit,
        cashFlow: d.cashFlow,
        series: d.series
      } as any)
    }
  }, [dashboardQuery.data])

  // Listen for global refresh events from posting flows
  useEffect(() => {
    const handler = async () => {
      try { queryClient.invalidateQueries({ queryKey: ['dashboard'] }) } catch {}
    }
    window.addEventListener('data:refresh', handler as any)
    return () => window.removeEventListener('data:refresh', handler as any)
  }, [timeRange])

  if (isLoading) {
    return <PremiumLoader title="Initializing Financial Universe" subtitle="Loading your financial command center..." />
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="h-full space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      {/* Header Section - Multi-breakpoint Responsive Layout */}
      <motion.div variants={itemVariants}>
        {/* Title Section */}
        <div className="flex flex-col 2xl:flex-row 2xl:items-center 2xl:justify-between 2xl:gap-8">
          <div className="flex-1 min-w-0">
            <h1 className={cn(
              "text-2xl sm:text-3xl font-bold mb-2 truncate",
              // Theme-aware title colors for proper visibility
              currentTheme === 'light' 
                ? "text-gray-900 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent"
                : currentTheme === 'blue'
                ? "text-white bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent"
                : currentTheme === 'green'
                ? "text-white bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent"
                : "text-white bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent"
            )}>
              Financial Command Center
            </h1>
            <p className="text-secondary-contrast text-sm sm:text-base">
              Real-time business intelligence at your fingertips
            </p>
          </div>

          {/* Extra Large Screen (≥1536px/~1580px) - Timeframe Selector Next to Title */}
          <div className="hidden 2xl:flex flex-shrink-0">
            <SegmentedControl
              options={[
                { value: '1M', label: '1M' },
                { value: '3M', label: '3M' },
                { value: '6M', label: '6M' },
                { value: '1Y', label: '1Y' },
              ] as any}
              value={timeRange}
              onChange={(v: any) => setTimeRange(v)}
            />
          </div>
        </div>

        {/* Subtle positioning for <1580px - Test the visual flow */}
        <div className="2xl:hidden flex justify-end mt-3">
          <SegmentedControl
            options={[
              { value: '1M', label: '1M' },
              { value: '3M', label: '3M' },
              { value: '6M', label: '6M' },
              { value: '1Y', label: '1Y' },
            ] as any}
            value={timeRange}
            onChange={(v: any) => setTimeRange(v)}
          />
        </div>
      </motion.div>

      {/* Top Row - Key Metrics */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
      >
        <FinancialMetricCard
          title="Revenue"
          value={financialData.revenue.current}
          previousValue={financialData.revenue.previous}
          trend={financialData.revenue.trend}
          change={financialData.revenue.change ?? 0}
          icon={DollarSign}
          color="revenue"
          sparkline={(financialData as any).series?.revenue}
        />

        <FinancialMetricCard
          title="Expenses"
          value={financialData.expenses.current}
          previousValue={financialData.expenses.previous}
          trend={financialData.expenses.trend}
          change={financialData.expenses.change ?? 0}
          icon={TrendingDown}
          color="expense"
          sparkline={(financialData as any).series?.expenses}
        />

        <FinancialMetricCard
          title="Net Profit"
          value={financialData.profit.current}
          previousValue={financialData.profit.previous}
          trend={financialData.profit.trend}
          change={financialData.profit.change ?? 0}
          icon={TrendingUp}
          color="profit"
          sparkline={(financialData as any).series?.profit}
        />

        <FinancialMetricCard
          title="Cash Flow"
          value={financialData.cashFlow.current}
          previousValue={financialData.cashFlow.previous}
          trend={financialData.cashFlow.trend}
          change={financialData.cashFlow.change ?? 0}
          icon={Activity}
          color="primary"
          sparkline={(() => {
            const s = (financialData as any).series
            if (!s?.revenue || !s?.expenses) return undefined
            return s.revenue.map((r: number, i: number) => r - (s.expenses[i] || 0))
          })()}
        />
      </motion.div>

      {/* Middle Row - Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Liquid Cash Flow Visualization */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <LiquidCashFlowVisualization
            data={financialData as any}
            timeRange={timeRange}
            activeMetric="revenue"
          />
        </motion.div>

        {/* Business Health Orb */}
        <motion.div variants={itemVariants}>
          <BusinessHealthOrb
            healthScore={businessHealth}
            metrics={financialData as any}
          />
        </motion.div>
      </div>

      {/* Bottom Row - Insights and Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Predictive Insights */}
        <motion.div variants={itemVariants}>
          <PredictiveInsights
            businessHealth={businessHealth}
            metrics={financialData as any}
          />
          {dashboardQuery.data?.aiInsights && dashboardQuery.data.aiInsights.length > 0 && (
            <div className="mt-4 text-sm">
              <div className="font-semibold mb-2">AI Insights (Server)</div>
              <ul className="list-disc ml-5 space-y-1">
                {dashboardQuery.data.aiInsights.map((it: any) => (
                  <li key={it.id ?? it.message} className="text-foreground/80">{it.message ?? String(it)}</li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>

        {/* Recent Transactions */}
        <motion.div variants={itemVariants}>
          <ThemedGlassSurface variant="medium" className="p-6 h-full">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Recent Activity</h3>
                <p className="text-sm text-secondary-contrast">Latest financial movements</p>
              </div>
            </div>

            <div className="space-y-3">
              <AnimatePresence>
                {recent.map((transaction, index) => (
                  <motion.div
                    key={transaction.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-surface/50 transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        transaction.type === 'revenue' ? "bg-financial-revenue" : "bg-financial-expense"
                      )} />
                      <div>
                        <div className="text-sm font-medium group-hover:text-primary transition-colors">
                          {transaction.description}
                        </div>
                        <div className="text-xs text-muted-contrast">
                          {transaction.category}
                        </div>
                      </div>
                    </div>
                    <div className={cn(
                      "text-sm font-semibold",
                      transaction.amount > 0 ? "text-financial-revenue" : "text-financial-expense"
                    )}>
                      {transaction.amount > 0 ? '+' : ''}${Math.abs(transaction.amount).toLocaleString()}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full mt-4 p-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition-all"
            >
              View All Transactions
            </motion.button>
          </ThemedGlassSurface>
        </motion.div>
      </div>
    </motion.div>
  )
}
