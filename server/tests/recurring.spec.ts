import { describe, it, expect, beforeAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { PostingService } from '../src/services/posting.service.js'

const prisma = new PrismaClient()

async function ensureCore() {
  const codes = ['1010','2010','6020','6999']
  for (const code of codes) {
    const exists = await prisma.account.findUnique({ where: { code } })
    if (!exists) await prisma.account.create({ data: { code, name: `Account ${code}`, type: code==='2010'?'LIABILITY':(code==='1010'?'ASSET':'EXPENSE'), normalBalance: code==='2010'?'CREDIT':'DEBIT' } })
  }
}

describe('Recurring Processor', () => {
  beforeAll(async () => { await ensureCore() })

  it('creates a recurring schedule and processes one run', async () => {
    const schedule = await prisma.recurringSchedule.create({
      data: {
        type: 'expense', vendor: 'Recurring Vendor', amount: 42.5, categoryKey: 'OFFICE_SUPPLIES', description: 'Monthly subscription',
        startDate: new Date('2025-02-01'), endDate: null, frequency: 'monthly', dayOfMonth: null, dayOfWeek: null, nextRunDate: new Date('2025-02-01'), isActive: true
      }
    })
    // Mimic server processor logic
    const payload = {
      vendorName: schedule.vendor!, amount: schedule.amount.toString(), date: schedule.nextRunDate.toISOString().slice(0,10), categoryKey: schedule.categoryKey, paymentStatus: 'unpaid', description: schedule.description || undefined, reference: `RECUR-${schedule.id}-${schedule.nextRunDate.getTime()}`
    }
    const v = PostingService.validateExpensePayload(payload)
    expect(v.isValid).toBe(true)
    const res = await PostingService.postTransaction(v.normalizedData)
    expect(res.transactionId).toBeTruthy()
  })
})

