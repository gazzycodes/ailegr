// Compatibility shim: preserves old imports of `services/realData`
// by delegating to the live API services. Safe to remove once all
// branches switch to FinancialDataService/ReportsService directly.

import { FinancialDataService } from './financialDataService'

type Trend = 'up' | 'down'

export type DashboardMetrics = {
  revenue: { current: number; previous: number; trend: Trend; change?: number }
  expenses: { current: number; previous: number; trend: Trend; change?: number }
  profit: { current: number; previous: number; trend: Trend; change?: number }
  cashFlow?: { current: number; previous: number; trend: Trend; change?: number }
}

export type SeriesData = {
  labels?: string[]
  revenue?: number[]
  expenses?: number[]
  profit?: number[]
} | null

export async function fetchDashboardData(): Promise<{ metrics: DashboardMetrics | null; aiInsights: any[] }> {
  const res = await FinancialDataService.getDashboardData().catch(() => null)
  const m = (res as any)?.metrics || {}
  if (!res || !res.metrics) {
    return { metrics: null, aiInsights: [] }
  }
  const revenue = Number(m.totalRevenue || 0)
  const expenses = Number(m.totalExpenses || 0)
  const profit = Number(m.netProfit ?? (revenue - expenses))
  const metrics: DashboardMetrics = {
    revenue: { current: revenue, previous: revenue, trend: 'up' },
    expenses: { current: expenses, previous: expenses, trend: 'up' },
    profit: { current: profit, previous: profit, trend: 'up' },
    cashFlow: { current: profit, previous: profit, trend: 'up' }
  }
  return { metrics, aiInsights: Array.isArray((res as any)?.aiInsights) ? (res as any).aiInsights : [] }
}

export async function getDashboardWithSeries(months = 12): Promise<{ metrics: DashboardMetrics | null; series: SeriesData; aiInsights: any[] }>
{
  const dash = await fetchDashboardData()
  // If a metrics time-series endpoint is added, map it here; returning null series is OK for callers.
  return { metrics: dash.metrics, series: null, aiInsights: dash.aiInsights }
}

