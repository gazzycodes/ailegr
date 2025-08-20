import axios from 'axios'

export type DashboardMetrics = {
  revenue: { current: number; previous: number; trend: 'up' | 'down'; change?: number }
  expenses: { current: number; previous: number; trend: 'up' | 'down'; change?: number }
  profit: { current: number; previous: number; trend: 'up' | 'down'; change?: number }
  cashFlow?: { current: number; previous: number; trend: 'up' | 'down'; change?: number }
}

export type SeriesData = {
  labels?: string[]
  revenue?: number[]
  expenses?: number[]
  profit?: number[]
}

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
})

export async function fetchDashboardMetrics(): Promise<DashboardMetrics | null> {
  try {
    const res = await api.get('/api/dashboard')
    const m = res.data?.metrics
    if (!m) return null

    const revenue = Number(m.totalRevenue || 0)
    const expenses = Number(m.totalExpenses || 0)
    const profit = Number(m.netProfit ?? (revenue - expenses))

    // Best-effort previous values from response if any
    const previousRevenue = Number(m.previousRevenue || revenue)
    const previousExpenses = Number(m.previousExpenses || expenses)
    const previousProfit = Number(m.previousNetProfit || profit)

    return {
      revenue: { current: revenue, previous: previousRevenue, trend: revenue >= previousRevenue ? 'up' : 'down' },
      expenses: { current: expenses, previous: previousExpenses, trend: expenses >= previousExpenses ? 'up' : 'down' },
      profit: { current: profit, previous: previousProfit, trend: profit >= previousProfit ? 'up' : 'down' },
      cashFlow: undefined
    }
  } catch (e) {
    console.warn('Dashboard metrics fetch failed, proceeding without real KPIs', e)
    return null
  }
}

export async function fetchDashboardData(): Promise<{ metrics: DashboardMetrics | null; aiInsights: any[] }> {
  try {
    const res = await api.get('/api/dashboard')
    const m = res.data?.metrics
    const ai = Array.isArray(res.data?.aiInsights) ? res.data.aiInsights : []
    if (!m) return { metrics: null, aiInsights: ai }
    const revenue = Number(m.totalRevenue || 0)
    const expenses = Number(m.totalExpenses || 0)
    const profit = Number(m.netProfit ?? (revenue - expenses))
    const previousRevenue = Number(m.previousRevenue || revenue)
    const previousExpenses = Number(m.previousExpenses || expenses)
    const previousProfit = Number(m.previousNetProfit || profit)
    const metrics: DashboardMetrics = {
      revenue: { current: revenue, previous: previousRevenue, trend: revenue >= previousRevenue ? 'up' : 'down' },
      expenses: { current: expenses, previous: previousExpenses, trend: expenses >= previousExpenses ? 'up' : 'down' },
      profit: { current: profit, previous: previousProfit, trend: profit >= previousProfit ? 'up' : 'down' },
      cashFlow: undefined
    }
    return { metrics, aiInsights: ai }
  } catch (e) {
    console.warn('Dashboard data fetch failed', e)
    return { metrics: null, aiInsights: [] }
  }
}

export async function fetchTimeSeries(months: number = 12): Promise<SeriesData | null> {
  // Try a few likely endpoints; prefer the dedicated metrics endpoint with the requested window
  const attempts = [
    `/api/metrics/time-series?metrics=revenue,expenses,profit&months=${months}`,
    `/api/reports/pnl?groupBy=month&months=${months}`,
    '/api/reports/pnl?period=last12m'
  ]
  for (const path of attempts) {
    try {
      const res = await api.get(path)
      const d = res.data

      // Heuristics to normalize possible shapes
      if (Array.isArray(d?.series)) {
        // Expected shape: { series: { label, revenue, expenses, profit }[] }
        const labels = d.series.map((s: any) => s.label)
        const revenue = d.series.map((s: any) => Number(s.revenue || 0))
        const expenses = d.series.map((s: any) => Number(s.expenses || 0))
        const profit = d.series.map((s: any) => Number(s.profit ?? (Number(s.revenue || 0) - Number(s.expenses || 0))))
        return { labels, revenue, expenses, profit }
      }

      if (d?.revenueByMonth && d?.expensesByMonth) {
        // Shape: { revenueByMonth: number[], expensesByMonth: number[], labels?: string[] }
        const labels = d.labels
        const revenue = d.revenueByMonth.map((n: any) => Number(n || 0))
        const expenses = d.expensesByMonth.map((n: any) => Number(n || 0))
        const profit = revenue.map((r: number, i: number) => r - (expenses[i] || 0))
        return { labels, revenue, expenses, profit }
      }

      // P&L table style shape with totals array
      if (Array.isArray(d?.months) && Array.isArray(d?.totals)) {
        const labels = d.months
        const revenue = d.totals.map((t: any) => Number(t.revenue || 0))
        const expenses = d.totals.map((t: any) => Number(t.expenses || 0))
        const profit = revenue.map((r: number, i: number) => r - (expenses[i] || 0))
        return { labels, revenue, expenses, profit }
      }
    } catch (e) {
      // try next
      continue
    }
  }
  console.warn('No time-series endpoint responded with usable data')
  return null
}

export async function getDashboardWithSeries(months?: number) {
  const [dash, series] = await Promise.all([fetchDashboardData(), fetchTimeSeries(months ?? 12)])
  return { metrics: dash.metrics, series, aiInsights: dash.aiInsights }
}

