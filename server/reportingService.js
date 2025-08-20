import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

const prisma = new PrismaClient()

export class ReportingService {
  static async getTrialBalance(asOfDate = null) {
    const accounts = await prisma.account.findMany({
      include: {
        debitEntries: { include: { transaction: { select: { date: true } } }, where: asOfDate ? { transaction: { date: { lte: asOfDate } } } : undefined },
        creditEntries: { include: { transaction: { select: { date: true } } }, where: asOfDate ? { transaction: { date: { lte: asOfDate } } } : undefined }
      },
      orderBy: { code: 'asc' }
    })
    const rows = []
    let totalDebits = new Decimal(0)
    let totalCredits = new Decimal(0)
    for (const account of accounts) {
      const debitSum = account.debitEntries.reduce((s, e) => s.add(new Decimal(e.amount)), new Decimal(0))
      const creditSum = account.creditEntries.reduce((s, e) => s.add(new Decimal(e.amount)), new Decimal(0))
      let debitColumn = new Decimal(0)
      let creditColumn = new Decimal(0)
      if (account.normalBalance === 'DEBIT') {
        const net = debitSum.sub(creditSum)
        if (net.gte(0)) debitColumn = net; else creditColumn = net.abs()
      } else {
        const net = creditSum.sub(debitSum)
        if (net.gte(0)) creditColumn = net; else debitColumn = net.abs()
      }
      if (debitColumn.gt(0) || creditColumn.gt(0) || account.debitEntries.length > 0 || account.creditEntries.length > 0) {
        rows.push({
          accountCode: account.code,
          account: account.name,
          accountType: account.type,
          normalBalance: account.normalBalance,
          debit: parseFloat(debitColumn.toFixed(2)),
          credit: parseFloat(creditColumn.toFixed(2)),
          transactionCount: account.debitEntries.length + account.creditEntries.length,
          lastActivity: ReportingService.getLastActivityDate(account)
        })
        totalDebits = totalDebits.add(debitColumn)
        totalCredits = totalCredits.add(creditColumn)
      }
    }
    const difference = totalDebits.sub(totalCredits)
    const isBalanced = difference.abs().lt(0.01)
    return {
      asOf: asOfDate ? asOfDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      rows,
      totals: {
        debit: parseFloat(totalDebits.toFixed(2)),
        credit: parseFloat(totalCredits.toFixed(2)),
        difference: parseFloat(difference.toFixed(2)),
        isBalanced
      },
      summary: {
        totalAccounts: accounts.length,
        activeAccounts: rows.length,
        zeroBalanceAccounts: accounts.length - rows.length,
        totalTransactions: rows.reduce((sum, row) => sum + row.transactionCount, 0)
      }
    }
  }

  static async getProfitAndLoss(asOfDate = null, periodStart = null) {
    // If periodStart provided, filter trial balance up to asOfDate (which includes period constraint already);
    // For current implementation, trial balance uses lte asOfDate; we keep periodStart for future granular filtering.
    const tb = await ReportingService.getTrialBalance(asOfDate)
    const revenueRows = tb.rows.filter(r => r.accountType === 'REVENUE')
    const expenseRows = tb.rows.filter(r => r.accountType === 'EXPENSE')
    const cogsRows = expenseRows.filter(r => r.accountCode.startsWith('5'))
    const opRows = expenseRows.filter(r => r.accountCode.startsWith('6'))
    const totalRevenue = revenueRows.reduce((s, r) => s + r.credit - r.debit, 0)
    const totalCOGS = cogsRows.reduce((s, r) => s + r.debit - r.credit, 0)
    const totalOpEx = opRows.reduce((s, r) => s + r.debit - r.credit, 0)
    const totalExpenses = totalCOGS + totalOpEx
    const grossProfit = totalRevenue - totalCOGS
    const operatingIncome = grossProfit - totalOpEx
    const netProfit = totalRevenue - totalExpenses
    const startIso = (periodStart ? periodStart : new Date(new Date().getFullYear(), new Date().getMonth(), 1)).toISOString().slice(0, 10)
    const endIso = (asOfDate ? asOfDate : new Date()).toISOString().slice(0, 10)
    const period = { start: startIso, end: endIso }
    return {
      period,
      revenue: revenueRows.map(r => ({ name: r.account, amount: r.credit - r.debit })),
      expenses: expenseRows.map(r => ({ name: r.account, amount: r.debit - r.credit })),
      cogs: cogsRows.map(r => ({ name: r.account, amount: r.debit - r.credit })),
      operatingExpenses: opRows.map(r => ({ name: r.account, amount: r.debit - r.credit })),
      totals: {
        revenue: totalRevenue,
        cogs: totalCOGS,
        grossProfit,
        operatingExpenses: totalOpEx,
        operatingIncome,
        netIncome: netProfit,
        expenses: totalExpenses,
        netProfit
      }
    }
  }

  static async getBalanceSheet(asOfDate = null) {
    const tb = await ReportingService.getTrialBalance(asOfDate)
    const pnl = await ReportingService.getProfitAndLoss(asOfDate)
    const assetRows = tb.rows.filter(r => r.accountType === 'ASSET')
    const liabilityRows = tb.rows.filter(r => r.accountType === 'LIABILITY')
    const equityRows = tb.rows.filter(r => r.accountType === 'EQUITY')
    const currentAssets = assetRows.filter(r => r.accountCode.startsWith('10') || r.accountCode.startsWith('11') || r.accountCode.startsWith('12') || r.accountCode.startsWith('13') || r.accountCode.startsWith('14') || r.accountCode.startsWith('15'))
    const nonCurrentAssets = assetRows.filter(r => r.accountCode.startsWith('16') || r.accountCode.startsWith('17') || r.accountCode.startsWith('18') || r.accountCode.startsWith('19'))
    const currentLiabilities = liabilityRows.filter(r => r.accountCode.startsWith('20') || r.accountCode.startsWith('21') || r.accountCode.startsWith('22') || r.accountCode.startsWith('23'))
    const longTermLiabilities = liabilityRows.filter(r => r.accountCode.startsWith('24') || r.accountCode.startsWith('25') || r.accountCode.startsWith('26'))
    const totalCurrentAssets = currentAssets.reduce((s, r) => s + (r.debit - r.credit), 0)
    const totalNonCurrentAssets = nonCurrentAssets.reduce((s, r) => s + (r.debit - r.credit), 0)
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets
    const totalCurrentLiabilities = currentLiabilities.reduce((s, r) => s + (r.credit - r.debit), 0)
    const totalLongTermLiabilities = longTermLiabilities.reduce((s, r) => s + (r.credit - r.debit), 0)
    const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities
    const ownerEquity = equityRows.filter(r => r.accountCode !== '3200').reduce((s, r) => s + (r.credit - r.debit), 0)
    const retainedEarnings = pnl.totals.netProfit
    const totalEquity = ownerEquity + retainedEarnings
    const equationDifference = Math.abs(totalAssets - (totalLiabilities + totalEquity))
    const equationOK = equationDifference < 0.01
    const workingCapital = totalCurrentAssets - totalCurrentLiabilities
    const currentRatio = totalCurrentLiabilities > 0 ? totalCurrentAssets / totalCurrentLiabilities : 0
    const debtToEquityRatio = totalEquity > 0 ? totalLiabilities / totalEquity : 0
    return {
      asOf: asOfDate ? asOfDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      currentAssets: currentAssets.map(r => ({ name: r.account, amount: r.debit - r.credit })),
      nonCurrentAssets: nonCurrentAssets.map(r => ({ name: r.account, amount: r.debit - r.credit })),
      currentLiabilities: currentLiabilities.map(r => ({ name: r.account, amount: r.credit - r.debit })),
      longTermLiabilities: longTermLiabilities.map(r => ({ name: r.account, amount: r.credit - r.debit })),
      equity: [
        ...equityRows.filter(r => r.accountCode !== '3200').map(r => ({ name: r.account, amount: r.credit - r.debit })),
        { name: 'Retained Earnings', amount: retainedEarnings }
      ],
      assets: assetRows.map(r => ({ name: r.account, amount: r.debit - r.credit })),
      liabilities: liabilityRows.map(r => ({ name: r.account, amount: r.credit - r.debit })),
      totals: {
        currentAssets: totalCurrentAssets,
        nonCurrentAssets: totalNonCurrentAssets,
        totalAssets,
        currentLiabilities: totalCurrentLiabilities,
        longTermLiabilities: totalLongTermLiabilities,
        totalLiabilities,
        totalEquity,
        liabilitiesAndEquity: totalLiabilities + totalEquity,
        workingCapital,
        currentRatio: Number(currentRatio.toFixed(2)),
        debtToEquityRatio: Number(debtToEquityRatio.toFixed(2)),
        equationOK,
        equationDifference: Number(equationDifference.toFixed(2)),
        assets: totalAssets,
        liabilities: totalLiabilities,
        equity: totalEquity
      }
    }
  }

  static async getChartOfAccounts() {
    const tb = await ReportingService.getTrialBalance()
    const pnl = await ReportingService.getProfitAndLoss()
    const allAccounts = await prisma.account.findMany({ orderBy: { code: 'asc' } })
    const accounts = allAccounts.map(account => {
      const row = tb.rows.find(r => r.accountCode === account.code)
      let balance = 0
      if (row) {
        balance = account.normalBalance === 'DEBIT' ? row.debit - row.credit : row.credit - row.debit
      }
      if (account.code === '3200') balance = pnl.totals.netProfit
      const transactionCount = row ? row.transactionCount : 0
      const lastActivity = row ? row.lastActivity : null
      const subcategory = ReportingService.getAccountSubcategory(account.code)
      return {
        code: account.code,
        name: account.name,
        type: account.type,
        category: account.type,
        subcategory,
        balance,
        normalBalance: account.normalBalance,
        description: ReportingService.getAccountDescription(account.type),
        isActive: balance !== 0 || transactionCount > 0,
        transactionCount,
        lastActivity,
        createdDate: account.createdAt.toISOString().slice(0, 10),
        status: (balance !== 0 || transactionCount > 0) ? 'Active' : 'Inactive'
      }
    })
    const hierarchy = accounts.reduce((acc, a) => {
      if (!acc[a.category]) acc[a.category] = {}
      if (!acc[a.category][a.subcategory]) acc[a.category][a.subcategory] = []
      acc[a.category][a.subcategory].push(a)
      return acc
    }, {})
    const summary = {
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter(a => a.isActive).length,
      inactiveAccounts: accounts.filter(a => !a.isActive).length,
      accountsByType: {
        ASSET: accounts.filter(a => a.type === 'ASSET').length,
        LIABILITY: accounts.filter(a => a.type === 'LIABILITY').length,
        EQUITY: accounts.filter(a => a.type === 'EQUITY').length,
        REVENUE: accounts.filter(a => a.type === 'REVENUE').length,
        EXPENSE: accounts.filter(a => a.type === 'EXPENSE').length
      },
      totalTransactions: tb.summary.totalTransactions,
      accountsWithActivity: accounts.filter(a => a.transactionCount > 0).length
    }
    return { accounts, hierarchy, summary }
  }

  static async getDashboard() {
    const pnl = await ReportingService.getProfitAndLoss()
    const bs = await ReportingService.getBalanceSheet()
    const tb = await ReportingService.getTrialBalance()
    const sparklineData = Array.from({ length: 30 }).map((_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i));
      return { date: d.toISOString().slice(0, 10), amount: 0 }
    })
    return {
      metrics: {
        totalRevenue: pnl.totals.revenue,
        totalExpenses: pnl.totals.expenses,
        netProfit: pnl.totals.netProfit,
        grossProfit: pnl.totals.grossProfit,
        totalAssets: bs.totals.totalAssets,
        totalLiabilities: bs.totals.totalLiabilities,
        totalEquity: bs.totals.totalEquity,
        transactionCount: tb.summary.totalTransactions
      },
      sparklineData,
      healthChecks: {
        trialBalanceOK: tb.totals.isBalanced,
        balanceSheetOK: bs.totals.equationOK,
        trialBalanceDifference: tb.totals.difference,
        balanceSheetDifference: bs.totals.equationDifference
      }
    }
  }

  static getLastActivityDate(account) {
    const all = [...account.debitEntries, ...account.creditEntries]
    if (all.length === 0) return null
    const latest = all.reduce((l, e) => new Date(e.transaction.date) > new Date(l.transaction.date) ? e : l)
    return latest.transaction.date.toISOString().slice(0, 10)
  }
  static getAccountSubcategory(code) {
    if (code.startsWith('10')) return 'Current Assets'
    if (code.startsWith('11')) return 'Short-term Investments'
    if (code.startsWith('12')) return 'Receivables'
    if (code.startsWith('13')) return 'Inventory'
    if (code.startsWith('14')) return 'Prepaid Expenses'
    if (code.startsWith('15')) return 'Supplies'
    if (code.startsWith('16')) return 'Property & Equipment'
    if (code.startsWith('17')) return 'Intangible Assets'
    if (code.startsWith('20')) return 'Current Liabilities'
    if (code.startsWith('21')) return 'Accrued Liabilities'
    if (code.startsWith('22')) return 'Credit Cards & Short-term Debt'
    if (code.startsWith('24')) return 'Long-term Liabilities'
    if (code.startsWith('25')) return 'Deferred Revenue'
    if (code.startsWith('30')) return 'Owner Equity'
    if (code.startsWith('32')) return 'Retained Earnings'
    if (code.startsWith('40')) return 'Revenue'
    if (code.startsWith('49')) return 'Other Income'
    if (code.startsWith('50')) return 'Cost of Goods Sold'
    if (code.startsWith('60')) return 'Operating Expenses'
    if (code.startsWith('61')) return 'Administrative Expenses'
    if (code.startsWith('62')) return 'Marketing & Sales'
    if (code.startsWith('70')) return 'Non-Operating Expenses'
    return 'Other'
  }
  static getAccountDescription(type) {
    switch (type) {
      case 'ASSET': return 'Resources owned by the business'
      case 'LIABILITY': return 'Debts and obligations owed'
      case 'EQUITY': return "Owner's stake in the business"
      case 'REVENUE': return 'Income earned from operations'
      case 'EXPENSE': return 'Costs incurred in operations'
      default: return 'General ledger account'
    }
  }
}

export default ReportingService
// Note: Avoid duplicate named export; class is already exported above


