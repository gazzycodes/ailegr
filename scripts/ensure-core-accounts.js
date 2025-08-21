import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const core = [
  { code:'1010', name:'Cash', type:'ASSET', normalBalance:'DEBIT' },
  { code:'1200', name:'Accounts Receivable', type:'ASSET', normalBalance:'DEBIT' },
  { code:'1400', name:'Prepaid Expenses', type:'ASSET', normalBalance:'DEBIT' },
  { code:'2010', name:'Accounts Payable', type:'LIABILITY', normalBalance:'CREDIT' },
  { code:'2050', name:'Customer Credits Payable', type:'LIABILITY', normalBalance:'CREDIT' },
  { code:'2150', name:'Sales Tax Payable', type:'LIABILITY', normalBalance:'CREDIT' },
  { code:'2400', name:'Unearned Revenue', type:'LIABILITY', normalBalance:'CREDIT' },
  { code:'3000', name:"Owner's Equity", type:'EQUITY', normalBalance:'CREDIT' },
  { code:'3200', name:'Retained Earnings', type:'EQUITY', normalBalance:'CREDIT' },
  { code:'4010', name:'Product Revenue', type:'REVENUE', normalBalance:'CREDIT' },
  { code:'4020', name:'Service Revenue', type:'REVENUE', normalBalance:'CREDIT' },
  { code:'4910', name:'Sales Discounts', type:'REVENUE', normalBalance:'DEBIT' },
  { code:'5010', name:'Cost of Goods Sold', type:'EXPENSE', normalBalance:'DEBIT' },
  { code:'6020', name:'Office Supplies & Equipment', type:'EXPENSE', normalBalance:'DEBIT' },
  { code:'6030', name:'Software & Technology', type:'EXPENSE', normalBalance:'DEBIT' },
  { code:'6040', name:'Marketing & Advertising', type:'EXPENSE', normalBalance:'DEBIT' },
  { code:'6060', name:'Travel & Transportation', type:'EXPENSE', normalBalance:'DEBIT' },
  { code:'6110', name:'Insurance', type:'EXPENSE', normalBalance:'DEBIT' },
  { code:'6170', name:'Bad Debt Expense', type:'EXPENSE', normalBalance:'DEBIT' },
]

async function main() {
  for (const a of core) {
    await prisma.account.upsert({
      where: { code: a.code },
      update: { name: a.name, type: a.type, normalBalance: a.normalBalance },
      create: a,
    })
  }
  console.log('Core accounts ensured.')
}

main().catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

