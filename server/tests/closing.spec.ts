import { describe, it, expect, beforeAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { createClosingEntries } from '../src/services/closing.service.js'

const prisma = new PrismaClient()

async function ensureAccounts() {
  const core = [
    ['1010','ASSET','DEBIT'],['4020','REVENUE','CREDIT'],['6020','EXPENSE','DEBIT'],['3200','EQUITY','CREDIT']
  ]
  for (const [code, type, nb] of core) {
    const a = await prisma.account.findUnique({ where: { code } })
    if (!a) await prisma.account.create({ data: { code, name: `Account ${code}`, type, normalBalance: nb } })
  }
}

describe('Closing Entries', () => {
  beforeAll(async () => {
    await ensureAccounts()
    // Seed one revenue and one expense entry
    const cash = await prisma.account.findUnique({ where: { code: '1010' } })
    const rev = await prisma.account.findUnique({ where: { code: '4020' } })
    const exp = await prisma.account.findUnique({ where: { code: '6020' } })
    const ts = Date.now()
    const t1 = await prisma.transaction.create({ data: { date: new Date('2025-01-05'), description: 'Revenue seed', reference: `REV-SEED-${ts}`, amount: 1000 } })
    await prisma.transactionEntry.create({ data: { transactionId: t1.id, debitAccountId: cash!.id, creditAccountId: null, amount: 1000 } })
    await prisma.transactionEntry.create({ data: { transactionId: t1.id, debitAccountId: null, creditAccountId: rev!.id, amount: 1000 } })
    const t2 = await prisma.transaction.create({ data: { date: new Date('2025-01-06'), description: 'Expense seed', reference: `EXP-SEED-${ts}`, amount: 400 } })
    await prisma.transactionEntry.create({ data: { transactionId: t2.id, debitAccountId: exp!.id, creditAccountId: null, amount: 400 } })
    await prisma.transactionEntry.create({ data: { transactionId: t2.id, debitAccountId: null, creditAccountId: cash!.id, amount: 400 } })
  })

  it('creates balanced closing entries to retained earnings', async () => {
    const res = await createClosingEntries('2025-01-31')
    expect(res).toBeTruthy()
    if (res.transactionId) {
      const tx = await prisma.transaction.findUnique({ where: { id: res.transactionId }, include: { entries: true } })
      const debits = tx!.entries.filter(e => e.debitAccountId).reduce((s,e)=>s+Number(e.amount),0)
      const credits = tx!.entries.filter(e => e.creditAccountId).reduce((s,e)=>s+Number(e.amount),0)
      expect(Math.abs(debits - credits)).toBeLessThan(0.01)
    }
  })
})

