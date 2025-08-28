import { prisma } from '../tenancy.js'
import { PostingService } from './posting.service.js'

export class AssetService {
  static clampResidual(cost, residual) {
    const c = Math.max(0, Number(cost || 0))
    let r = Math.max(0, Number(residual || 0))
    if (r > c) r = c
    return r
  }

  static computeMonthlyDepreciation(cost, residual, usefulLifeMonths) {
    const c = Math.max(0, Number(cost || 0))
    const r = AssetService.clampResidual(c, residual)
    const life = Math.max(1, parseInt(String(usefulLifeMonths || 1), 10))
    const dep = (c - r) / life
    return Math.max(0, Number(dep.toFixed(2)))
  }

  static async createAssetFromExpense(expense, opts = {}) {
    const {
      categoryId = null,
      name,
      vendorName,
      acquisitionDate,
      inServiceDate,
      cost,
      residualValue = 0,
      method = 'SL',
      usefulLifeMonths,
      uniqueKey = null
    } = opts

    const safeResidual = AssetService.clampResidual(cost, residualValue)
    const asset = await prisma.asset.create({
      data: {
        categoryId,
        name: name || (expense?.description || expense?.vendor || 'Fixed Asset'),
        vendorName: vendorName || expense?.vendor || null,
        acquisitionDate: acquisitionDate ? new Date(acquisitionDate) : new Date(expense?.date || new Date()),
        inServiceDate: inServiceDate ? new Date(inServiceDate) : new Date(expense?.date || new Date()),
        cost: Number(cost || expense?.amount || 0),
        residualValue: safeResidual,
        method,
        usefulLifeMonths: Math.max(1, parseInt(String(usefulLifeMonths || 36), 10)),
        status: 'active',
        accumulatedDepreciation: 0,
        nextRunOn: AssetService.nextRunFrom(new Date(inServiceDate || expense?.date || new Date())),
        uniqueKey: uniqueKey || null
      }
    })
    await prisma.assetEvent.create({ data: { assetId: asset.id, type: 'acquire', amount: asset.cost, runOn: asset.acquisitionDate, memo: 'Acquisition' } })
    return asset
  }

  static nextRunFrom(inServiceDate) {
    const d = new Date(inServiceDate)
    if (isNaN(d.getTime())) return null
    // Start next month on the same day or last day if shorter
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const day = d.getDate()
    const next = new Date(year, month, 1)
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    const targetDay = Math.min(day, lastDay)
    next.setDate(targetDay)
    next.setHours(2, 0, 0, 0)
    return next
  }

  static async runDueDepreciation(limit = 50) {
    const now = new Date()
    const due = await prisma.asset.findMany({
      where: { status: 'active', nextRunOn: { lte: now } },
      orderBy: { nextRunOn: 'asc' },
      take: limit
    })
    const results = []
    for (const a of due) {
      const res = await AssetService.runOneDepreciation(a)
      results.push(res)
    }
    return results
  }

  static async runOneDepreciation(asset) {
    // Re-read with tenant scoping
    const a = await prisma.asset.findUnique({ where: { id: asset.id } })
    if (!a) return { ok: false, reason: 'not_found' }
    if (String(a.status) !== 'active') return { ok: false, reason: 'inactive' }

    const monthly = AssetService.computeMonthlyDepreciation(a.cost, a.residualValue, a.usefulLifeMonths)
    const remaining = Math.max(0, Number(a.cost) - Number(a.residualValue) - Number(a.accumulatedDepreciation))
    if (remaining <= 0.009) {
      await prisma.asset.update({ where: { id: a.id }, data: { status: 'fully_depreciated', nextRunOn: null } })
      return { ok: true, amount: 0, status: 'completed' }
    }
    const amount = Math.min(remaining, monthly)

    // Build posting payload with idempotent reference
    const runDate = a.nextRunOn || new Date()
    const y = runDate.getFullYear(); const m = String(runDate.getMonth() + 1).padStart(2, '0')
    const ref = `asset:${a.id}:${y}-${m}`

    const payload = {
      type: 'ASSET_DEPRECIATION',
      amount: amount,
      date: runDate.toISOString().slice(0, 10),
      description: `Depreciation for ${a.name} (${y}-${m})`,
      reference: ref,
      // Accounts resolution: prefer category mapping; fallback to 6120 and 1590
      assetAccountCode: null,
      accumulatedAccountCode: null,
      expenseAccountCode: null,
      assetId: a.id
    }

    // Resolve accounts from category if available
    if (a.categoryId) {
      const cat = await prisma.assetCategory.findFirst({ where: { id: a.categoryId } })
      if (cat) {
        payload.expenseAccountCode = cat.expenseAccountCode || '6120'
        payload.accumulatedAccountCode = cat.accumulatedAccountCode || '1590'
      }
    }
    if (!payload.expenseAccountCode) payload.expenseAccountCode = '6120'
    if (!payload.accumulatedAccountCode) payload.accumulatedAccountCode = '1590'

    const post = await PostingService.postAssetDepreciation(payload)
    // Record event and advance nextRunOn
    const nextRun = AssetService.nextRunFrom(runDate)
    await prisma.assetEvent.create({ data: { assetId: a.id, type: 'depreciate', amount, runOn: runDate, journalId: post?.transactionId || null, memo: 'Monthly depreciation' } })
    await prisma.asset.update({ where: { id: a.id }, data: { accumulatedDepreciation: Number(a.accumulatedDepreciation) + amount, nextRunOn: nextRun } })
    return { ok: true, amount, transactionId: post?.transactionId || null, nextRunOn: nextRun }
  }
}

export default AssetService


