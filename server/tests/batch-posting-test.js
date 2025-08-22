import { PrismaClient } from '@prisma/client';
import { PostingService } from '../src/services/posting.service.js';

const prisma = new PrismaClient();

const TEST_PREFIX = 'TEST-POSTING-';

async function upsertAccount(code, name, type, normalBalance) {
  await prisma.account.upsert({
    where: { code },
    update: { name, type, normalBalance },
    create: { code, name, type, normalBalance }
  });
}

async function ensureChartOfAccounts() {
  // Minimal set required for scenarios
  await upsertAccount('1010', 'Cash and Cash Equivalents', 'ASSET', 'DEBIT');
  await upsertAccount('2010', 'Accounts Payable', 'LIABILITY', 'CREDIT');
  await upsertAccount('1200', 'Accounts Receivable', 'ASSET', 'DEBIT');
  await upsertAccount('1400', 'Prepaid Expenses', 'ASSET', 'DEBIT');
  await upsertAccount('2150', 'Sales Tax Payable', 'LIABILITY', 'CREDIT');
  await upsertAccount('4910', 'Sales Discounts', 'REVENUE', 'CREDIT'); // contra-revenue modeled as revenue normal credit
  await upsertAccount('6020', 'Office Supplies Expense', 'EXPENSE', 'DEBIT');
  await upsertAccount('6150', 'Telecommunications Expense', 'EXPENSE', 'DEBIT');
  await upsertAccount('6040', 'Marketing Expense', 'EXPENSE', 'DEBIT');
  await upsertAccount('6999', 'General Expense', 'EXPENSE', 'DEBIT');
  await upsertAccount('4010', 'Sales Revenue', 'REVENUE', 'CREDIT');
  await upsertAccount('4020', 'Services Revenue', 'REVENUE', 'CREDIT');
}

function today() {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function ref(suffix) {
  return `${TEST_PREFIX}${suffix}-${Date.now()}`;
}

async function runExpenseScenarios() {
  const date = today();
  const scenarios = [
    {
      name: 'expense-paid',
      data: {
        vendorName: 'Office Depot',
        amount: '100.00',
        date,
        categoryKey: 'OFFICE_SUPPLIES',
        paymentStatus: 'paid',
        datePaid: date,
        reference: ref('EXP-PAID')
      }
    },
    {
      name: 'expense-unpaid',
      data: {
        vendorName: 'Comcast',
        amount: '200.00',
        date,
        categoryKey: 'TELECOMMUNICATIONS',
        paymentStatus: 'unpaid',
        reference: ref('EXP-UNPAID')
      }
    },
    {
      name: 'expense-partial',
      data: {
        vendorName: 'Vendor Partial',
        amount: '300.00',
        amountPaid: '120.00',
        date,
        categoryKey: 'MARKETING',
        paymentStatus: 'partial',
        reference: ref('EXP-PARTIAL')
      }
    },
    {
      name: 'expense-overpaid',
      data: {
        vendorName: 'Vendor Overpaid',
        amount: '150.00',
        amountPaid: '180.00',
        balanceDue: '-30.00',
        date,
        categoryKey: 'OFFICE_SUPPLIES',
        paymentStatus: 'overpaid',
        reference: ref('EXP-OVERPAID')
      }
    },
    {
      name: 'expense-refund',
      data: {
        vendorName: 'Refund Vendor',
        amount: '-50.00',
        isRefund: true,
        date,
        categoryKey: 'OFFICE_SUPPLIES',
        paymentStatus: 'refunded',
        reference: ref('EXP-REFUND')
      }
    }
  ];

  const results = [];
  for (const sc of scenarios) {
    const res = await PostingService.postTransaction(sc.data);
    results.push({ name: sc.name, ...res });
  }
  return results;
}

async function runInvoiceScenarios() {
  const date = today();
  const scenarios = [
    {
      name: 'invoice-unpaid',
      data: {
        customerName: 'Acme Corp',
        amount: '1000.00',
        date,
        categoryKey: 'OFFICE_SUPPLIES',
        paymentStatus: 'invoice',
        invoiceNumber: `INV-${Date.now()}-U`,
        reference: ref('INV-UNPAID')
      }
    },
    {
      name: 'invoice-paid',
      data: {
        customerName: 'Globex LLC',
        amount: '800.00',
        amountPaid: '800.00',
        date,
        categoryKey: 'CONSULTING',
        paymentStatus: 'paid',
        invoiceNumber: `INV-${Date.now()}-P`,
        reference: ref('INV-PAID')
      }
    },
    {
      name: 'invoice-overpaid',
      data: {
        customerName: 'Initech',
        amount: '500.00',
        amountPaid: '600.00',
        date,
        categoryKey: 'SOFTWARE',
        paymentStatus: 'overpaid',
        invoiceNumber: `INV-${Date.now()}-O`,
        reference: ref('INV-OVERPAID')
      }
    },
    {
      name: 'invoice-tax-discount',
      data: {
        customerName: 'Umbrella Inc',
        amount: '1000.00',
        subtotal: '900.00',
        date,
        categoryKey: 'CONSULTING',
        paymentStatus: 'paid',
        amountPaid: '950.00',
        discount: { enabled: true, type: 'fixed', amount: '50.00', description: 'Promo' },
        taxSettings: { enabled: true, type: 'percentage', rate: '5' },
        invoiceNumber: `INV-${Date.now()}-T`,
        reference: ref('INV-TAXDISC')
      }
    }
  ];

  const results = [];
  for (const sc of scenarios) {
    const res = await PostingService.postInvoiceTransaction(sc.data);
    results.push({ name: sc.name, ...res });
  }
  return results;
}

function summarize(result) {
  const entries = result.entries || [];
  const totalDebits = entries.filter(e => e.debitAccountId).reduce((s, e) => s + Number(e.amount), 0);
  const totalCredits = entries.filter(e => e.creditAccountId).reduce((s, e) => s + Number(e.amount), 0);
  return { transactionId: result.transactionId, reference: result.reference, totalDebits, totalCredits };
}

async function cleanupTestTransactions() {
  const del = await prisma.transaction.deleteMany({ where: { reference: { startsWith: TEST_PREFIX } } });
  return del.count;
}

async function trialBalanceForTests() {
  // Aggregate only entries belonging to test transactions
  const testTx = await prisma.transaction.findMany({
    where: { reference: { startsWith: TEST_PREFIX } },
    select: { id: true }
  });
  const ids = testTx.map(t => t.id);
  if (ids.length === 0) return { debit: 0, credit: 0, difference: 0, isBalanced: true };

  const entries = await prisma.transactionEntry.findMany({
    where: { transactionId: { in: ids } },
    select: { amount: true, debitAccountId: true, creditAccountId: true }
  });
  const debit = entries.filter(e => e.debitAccountId).reduce((s, e) => s + Number(e.amount), 0);
  const credit = entries.filter(e => e.creditAccountId).reduce((s, e) => s + Number(e.amount), 0);
  const difference = Math.abs(debit - credit);
  return { debit, credit, difference, isBalanced: difference < 0.01 };
}

async function main() {
  const args = process.argv.slice(2);
  const keep = args.includes('--keep');

  console.log('🔧 Ensuring Chart of Accounts...');
  await ensureChartOfAccounts();

  console.log('🧹 Cleaning up any previous test transactions...');
  await cleanupTestTransactions();

  console.log('🧪 Running EXPENSE scenarios...');
  const expenseResults = await runExpenseScenarios();
  expenseResults.forEach(r => {
    const s = summarize(r);
    console.log(`  ✅ ${r.message} | ref=${s.reference} | debits=${s.totalDebits.toFixed(2)} credits=${s.totalCredits.toFixed(2)}`);
  });

  console.log('🧪 Running INVOICE scenarios...');
  const invoiceResults = await runInvoiceScenarios();
  invoiceResults.forEach(r => {
    const s = summarize(r);
    console.log(`  ✅ ${r.message} | ref=${s.reference} | debits=${s.totalDebits.toFixed(2)} credits=${s.totalCredits.toFixed(2)}`);
  });

  console.log('🧮 Trial Balance (TEST scope only) ...');
  const tb = await trialBalanceForTests();
  console.log(`  TB totals: debit=${tb.debit.toFixed(2)} credit=${tb.credit.toFixed(2)} difference=${tb.difference.toFixed(2)} balanced=${tb.isBalanced}`);

  if (!keep) {
    console.log('🧹 Cleaning up test transactions...');
    const count = await cleanupTestTransactions();
    console.log(`  🗑️ Deleted ${count} test transactions.`);
  } else {
    console.log('ℹ️ Keeping test transactions (use --keep=false to auto-clean).');
  }
}

main()
  .catch(err => {
    console.error('❌ Batch test failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

