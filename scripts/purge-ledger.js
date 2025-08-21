import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.$transaction(async (tx) => {
    // Remove dependent/leaf records first
    await tx.pendingCategoryApproval.deleteMany({})
    await tx.recurringSchedule.deleteMany({})
    await tx.category.updateMany({ data: { usageCount: 0 } })

    // Expenses and Invoices are tied to Transactions via unique FK; deleting transactions will cascade
    await tx.transaction.deleteMany({})

    // Optional: clear customers (comment out if you want to keep)
    // await tx.customer.deleteMany({})
  })
  console.log('All ledger data purged (transactions, entries, expenses, invoices). Accounts preserved.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
}).finally(() => prisma.$disconnect())

