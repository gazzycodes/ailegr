import { describe, it, expect, beforeAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { PostingService } from '../src/services/posting.service.js'

const prisma = new PrismaClient()

async function ensureCore() {
  const codes = ['1010','1200','2010','4020','4910','2050','2150','1400','2400','6170','6999','6020']
  for (const code of codes) {
    const exists = await prisma.account.findUnique({ where: { code } })
    if (!exists) {
      await prisma.account.create({ data: {
        code,
        name: `Account ${code}`,
        type: ['1010','1200','1400'].includes(code) ? 'ASSET' : ['2010','2050','2150','2400'].includes(code) ? 'LIABILITY' : ['4020','4910'].includes(code) ? 'REVENUE' : ['6170','6999','6020'].includes(code) ? 'EXPENSE' : 'ASSET',
        normalBalance: ['4020','4910','2010','2050','2150','2400','3000','3200'].includes(code) ? 'CREDIT' : 'DEBIT'
      } })
    }
  }
}

describe('PostingService - Expenses', () => {
  beforeAll(async () => { await ensureCore() })

  it('posts standard paid expense', async () => {
    const payload = {
      vendorName: 'Acme Supplies', amount: '100.00', date: '2025-01-10', categoryKey: 'OFFICE_SUPPLIES', paymentStatus: 'paid', reference: `TEST-EXP-${Date.now()}`
    }
    const v = PostingService.validateExpensePayload(payload)
    expect(v.isValid).toBe(true)
    const res = await PostingService.postTransaction(v.normalizedData)
    expect(res.entries.length).toBe(2)
  })

  it('handles overpaid expense to 1400', async () => {
    const payload = {
      vendorName: 'Overpay Co', amount: '100.00', amountPaid: '120.00', date: '2025-01-11', categoryKey: 'OFFICE_SUPPLIES', paymentStatus: 'overpaid', reference: `TEST-EXP-OVR-${Date.now()}`
    }
    const v = PostingService.validateExpensePayload(payload)
    expect(v.isValid).toBe(true)
    const res = await PostingService.postTransaction(v.normalizedData)
    expect(res.entries.length).toBe(3)
  })

  it('handles refund expense (negative amount)', async () => {
    const payload = {
      vendorName: 'Refund Co', amount: '-50.00', date: '2025-01-12', categoryKey: 'OFFICE_SUPPLIES', paymentStatus: 'paid', isRefund: true, reference: `TEST-EXP-RFD-${Date.now()}`
    }
    const v = PostingService.validateExpensePayload(payload)
    expect(v.isValid).toBe(true)
    const res = await PostingService.postTransaction(v.normalizedData)
    expect(res.entries.length).toBe(2)
  })
})

describe('PostingService - Invoices', () => {
  beforeAll(async () => { await ensureCore() })

  it('posts prepaid invoice to 2400', async () => {
    const payload: any = {
      customerName: 'Client A', amount: '1000.00', amountPaid: '1000.00', date: '2025-02-01', paymentStatus: 'prepaid', reference: `TEST-INV-PPD-${Date.now()}`
    }
    const v = PostingService.validateInvoicePayload(payload)
    expect(v.isValid).toBe(true)
    const res = await PostingService.postInvoiceTransaction(v.normalizedData)
    expect(res.entries.length).toBeGreaterThan(0)
  })
})

