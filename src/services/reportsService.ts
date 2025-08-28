import api from './api'

export const ReportsService = {
  async getPnl(asOf?: string, opts?: { period?: 'Monthly'|'Quarterly'|'YTD'|'Annual'; compare?: boolean }) {
    const params: any = {}
    if (asOf) params.asOf = asOf
    if (opts?.period) params.period = opts.period
    if (opts?.compare) params.compare = true
    const { data } = await api.get('/api/reports/pnl', { params })
    return data
  },
  async getBalanceSheet(asOf?: string) {
    const { data } = await api.get('/api/reports/balance-sheet', { params: asOf ? { asOf } : {} })
    return data
  },
  async getTrialBalance(asOf?: string) {
    const { data } = await api.get('/api/reports/trial-balance', { params: asOf ? { asOf } : {} })
    return data
  },
  async getChartOfAccounts() {
    const { data } = await api.get('/api/reports/chart-of-accounts')
    return data
  },
  async getAccountTransactions(accountCode: string, limit = 100) {
    const { data } = await api.get(`/api/accounts/${encodeURIComponent(accountCode)}/transactions`, { params: { limit } })
    return data
  },
  async getInventoryValuation() {
    const { data } = await api.get('/api/reports/inventory-valuation')
    return data
  },
  async updateAccount(code: string, payload: { name?: string; type?: 'ASSET'|'LIABILITY'|'EQUITY'|'REVENUE'|'EXPENSE' }) {
    const { data } = await api.put(`/api/accounts/${encodeURIComponent(code)}`, payload)
    return data
  },
  async deleteAccount(code: string) {
    const { data } = await api.delete(`/api/accounts/${encodeURIComponent(code)}`)
    return data
  }
}

export default ReportsService


