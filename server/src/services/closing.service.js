import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function createClosingEntries(asOfInput) {
  const asOf = asOfInput ? new Date(asOfInput) : new Date()
  if (isNaN(asOf.getTime())) throw new Error('Invalid asOf date')

  const equity = await prisma.account.findUnique({ where: { code: '3200' } })
  if (!equity) throw new Error('Retained Earnings (3200) not found')

  const ref = `CLOSE-${asOf.toISOString().slice(0,10)}`
  const exists = await prisma.transaction.findUnique({ where: { reference: ref } })
  if (exists) return { isExisting: true, transactionId: exists.id }

  const revAndExp = await prisma.account.findMany({ where: { type: { in: ['REVENUE','EXPENSE'] } }, select: { id: true, code: true, name: true, type: true, normalBalance: true } })
  const accountIdToBal = new Map()
  for (const acc of revAndExp) {
    const entries = await prisma.transactionEntry.findMany({
      where: { OR: [{ debitAccountId: acc.id }, { creditAccountId: acc.id }], transaction: { date: { lte: asOf } } },
      include: { transaction: { select: { date: true } } }
    })
    let running = 0
    for (const e of entries) {
      if (e.debitAccountId === acc.id) running += parseFloat(e.amount)
      if (e.creditAccountId === acc.id) running -= parseFloat(e.amount)
    }
    const balance = acc.normalBalance === 'CREDIT' ? -running : running
    if (Math.abs(balance) > 0.009) accountIdToBal.set(acc.id, { account: acc, balance })
  }
  if (accountIdToBal.size === 0) return { isExisting: false, transactionId: null, message: 'Nothing to close' }

  const txId = await prisma.$transaction(async (tx) => {
    const header = await tx.transaction.create({ data: { date: asOf, description: `Closing Entries as of ${asOf.toISOString().slice(0,10)}`, reference: ref, amount: 0, customFields: { type: 'closing_entries' } } })
    let totalDebits = 0, totalCredits = 0
    for (const { account, balance } of accountIdToBal.values()) {
      if (account.type === 'REVENUE') {
        const amt = Math.abs(balance)
        await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: account.id, creditAccountId: null, amount: amt, description: `Close ${account.code} - ${account.name}` } })
        totalDebits += amt
      } else if (account.type === 'EXPENSE') {
        const amt = Math.abs(balance)
        await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: null, creditAccountId: account.id, amount: amt, description: `Close ${account.code} - ${account.name}` } })
        totalCredits += amt
      }
    }
    const net = totalDebits - totalCredits
    if (net > 0) {
      await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: null, creditAccountId: equity.id, amount: net, description: 'Close to Retained Earnings (Net Income)' } })
      totalCredits += net
    } else if (net < 0) {
      const amt = Math.abs(net)
      await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: equity.id, creditAccountId: null, amount: amt, description: 'Close to Retained Earnings (Net Loss)' } })
      totalDebits += amt
    }
    if (Math.abs(totalDebits - totalCredits) > 0.01) throw new Error('Closing entries not balanced')
    return header.id
  })
  return { isExisting: false, transactionId: txId }
}

