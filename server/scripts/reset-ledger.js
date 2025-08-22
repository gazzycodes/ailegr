import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('⚠️  Resetting ledger data (transactions, entries, invoices, expenses)...')

  // Optional: clear pending category approvals first
  try {
    const pca = await prisma.pendingCategoryApproval.deleteMany({})
    console.log(`Deleted PendingCategoryApprovals: ${pca.count}`)
  } catch {}

  // Deleting transactions cascades to entries, expenses, invoices (onDelete: Cascade in schema)
  const txDel = await prisma.transaction.deleteMany({})
  console.log(`Deleted Transactions (and cascades): ${txDel.count}`)

  // Show table counts after reset
  const [tCount, eCount, invCount, expCount] = await Promise.all([
    prisma.transaction.count(),
    prisma.transactionEntry.count(),
    prisma.invoice.count(),
    prisma.expense.count()
  ])

  console.log('Post-reset counts:', {
    transactions: tCount,
    entries: eCount,
    invoices: invCount,
    expenses: expCount
  })

  console.log('✅ Ledger reset complete. Reports will compute to 0 until new postings are added.')
}

main()
  .catch((e) => {
    console.error('❌ Reset failed:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

