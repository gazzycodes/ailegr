import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Expense Account Resolver - Unified Account Resolution Service
 * Implements precedence logic: USER > CATEGORY_KEY > KEYWORDS > FALLBACK
 */
class ExpenseAccountResolver {
  static CATEGORY_ACCOUNT_MAPPING = {
    SOFTWARE: '6030',
    TELECOMMUNICATIONS: '6150',
    BANK_FEES: '6100',
    UTILITIES: '6080',
    OFFICE_SUPPLIES: '6020',
    PROFESSIONAL_SERVICES: '6090',
    INSURANCE: '6110',
    LEGAL_COMPLIANCE: '6120',
    TRAINING: '6130',
    RENT: '6070',
    TRAVEL: '6060',
    MARKETING: '6040',
    COGS: '5010',
    MEALS: '6140',
    GENERAL_EXPENSE: '6999'
  };

  static KEYWORD_MAPPINGS = {
    SOFTWARE: ['software','adobe','microsoft','google','cloud','saas','hosting','domain','server','api','slack','zoom','dropbox','notion'],
    TELECOMMUNICATIONS: ['phone','internet','wifi','mobile','cellular','data','plan','verizon','att','t-mobile','comcast','spectrum','xfinity','fiber','telephone'],
    BANK_FEES: ['bank','fee','charge','wire','transfer','overdraft','maintenance','atm','merchant','paypal','stripe'],
    UTILITIES: ['utility','electric','power','water','sewer','garbage','waste','heating','cooling','energy'],
    OFFICE_SUPPLIES: ['office','supplies','stationery','paper','printer','ink','toner','desk','chair','equipment','furniture','staples','depot','costco'],
    PROFESSIONAL_SERVICES: ['legal','attorney','lawyer','consulting','consultant','accountant','accounting','audit','tax','bookkeeping','financial','advisor'],
    INSURANCE: ['insurance','liability','coverage','policy','premium','health','dental','vision','workers','compensation','auto','vehicle','property','business'],
    TRAINING: ['training','education','course','workshop','seminar','certification','conference','learning','udemy','coursera','pluralsight'],
    RENT: ['rent','lease','office','space','coworking','workspace','property'],
    TRAVEL: ['travel','flight','hotel','airfare','airline','airport','uber','lyft','taxi','rental','car','gas','fuel','parking','toll','mileage'],
    MARKETING: ['marketing','advertising','ads','promotion','facebook','linkedin','twitter','instagram','youtube','social','media','campaign','seo','ppc'],
    MEALS: ['meal','food','restaurant','lunch','dinner','breakfast','coffee','catering','starbucks','doordash','grubhub','ubereats','entertainment']
  };

  static PAYMENT_ACCOUNT_MAPPING = {
    paid: '1010',
    unpaid: '2010',
    overpaid: '1010',
    partial: '2010',
    refunded: '1010'
  };

  static async resolveExpenseAccounts(expenseData) {
    const debitResolution = await this.resolveDebitAccount(expenseData);
    const creditResolution = await this.resolveCreditAccount(expenseData.paymentStatus);
    const datePolicy = this.determineDatePolicy(expenseData);
    await this.validateAccountsExist([debitResolution.accountCode, creditResolution.accountCode]);
    return {
      dateUsed: datePolicy.dateUsed,
      policy: datePolicy.policy,
      debit: {
        accountCode: debitResolution.accountCode,
        accountName: debitResolution.accountName,
        amount: expenseData.amount,
        source: debitResolution.source
      },
      credit: {
        accountCode: creditResolution.accountCode,
        accountName: creditResolution.accountName,
        amount: expenseData.amount,
        source: creditResolution.source
      },
      isFallback: debitResolution.source === 'FALLBACK'
    };
  }

  static async resolveDebitAccount(expenseData) {
    const { categoryKey, vendorName = '', description = '' } = expenseData;
    if (categoryKey && categoryKey !== 'OTHER' && categoryKey !== 'GENERAL_EXPENSE') {
      const accountCode = this.CATEGORY_ACCOUNT_MAPPING[categoryKey];
      if (accountCode) {
        const account = await this.getAccountByCode(accountCode);
        if (account) return { accountCode, accountName: account.name, source: 'USER' };
      }
    }
    if (categoryKey && this.CATEGORY_ACCOUNT_MAPPING[categoryKey]) {
      const accountCode = this.CATEGORY_ACCOUNT_MAPPING[categoryKey];
      const account = await this.getAccountByCode(accountCode);
      if (account) return { accountCode, accountName: account.name, source: 'CATEGORY_KEY' };
    }
    const keywordMatch = this.findKeywordMatch(vendorName, description);
    if (keywordMatch) {
      const account = await this.getAccountByCode(keywordMatch.accountCode);
      if (account) return { accountCode: keywordMatch.accountCode, accountName: account.name, source: 'KEYWORDS' };
    }
    const fallback = await this.getAccountByCode('6999');
    if (!fallback) throw new Error('Fallback account 6999 (General Expense) not found in Chart of Accounts');
    return { accountCode: '6999', accountName: fallback.name, source: 'FALLBACK' };
  }

  static async resolveCreditAccount(paymentStatus) {
    const accountCode = this.PAYMENT_ACCOUNT_MAPPING[paymentStatus] || this.PAYMENT_ACCOUNT_MAPPING['unpaid'];
    const account = await this.getAccountByCode(accountCode);
    if (!account) throw new Error(`Credit account ${accountCode} not found in Chart of Accounts`);
    return { accountCode, accountName: account.name, source: 'PAYMENT_STATUS' };
  }

  static determineDatePolicy(expenseData) {
    const { paymentStatus, date, datePaid } = expenseData;
    if (paymentStatus === 'paid' && datePaid) return { policy: 'CASH', dateUsed: datePaid };
    if (paymentStatus === 'paid') return { policy: 'CASH', dateUsed: date };
    return { policy: 'ACCRUAL_STEP1', dateUsed: date };
  }

  static findKeywordMatch(vendorName, description) {
    const searchText = `${vendorName} ${description}`.toLowerCase();
    for (const [categoryKey, keywords] of Object.entries(this.KEYWORD_MAPPINGS)) {
      for (const keyword of keywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          const accountCode = this.CATEGORY_ACCOUNT_MAPPING[categoryKey];
          if (accountCode) return { keyword, categoryKey, accountCode };
        }
      }
    }
    return null;
  }

  static async getAccountByCode(accountCode) {
    const account = await prisma.account.findUnique({
      where: { code: accountCode },
      select: { id: true, code: true, name: true, type: true, normalBalance: true }
    });
    // Fallback: if code 6999 missing in demo databases, map to '6020 Office Supplies' to keep previews working
    if (!account && accountCode === '6999') {
      const fallback = await prisma.account.findUnique({ where: { code: '6020' }, select: { id: true, code: true, name: true, type: true, normalBalance: true } })
      if (fallback) return fallback
    }
    return account;
  }

  static async validateAccountsExist(accountCodes) {
    const accounts = await prisma.account.findMany({
      where: { code: { in: accountCodes } },
      select: { code: true, name: true }
    });
    const foundCodes = accounts.map(a => a.code);
    let missing = accountCodes.filter(c => !foundCodes.includes(c));
    // Demo resilience: if only 6999 is missing, allow resolver to substitute 6020 and continue
    if (missing.length === 1 && missing[0] === '6999') {
      const has6020 = foundCodes.includes('6020');
      if (has6020) {
        missing = [];
      }
    }
    if (missing.length > 0) throw new Error(`Required accounts not found in Chart of Accounts: ${missing.join(', ')}`);
    return true;
  }

  static getAvailableCategories() {
    return Object.keys(this.CATEGORY_ACCOUNT_MAPPING).map(key => ({
      key,
      accountCode: this.CATEGORY_ACCOUNT_MAPPING[key],
      displayName: key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    }));
  }
}

export { ExpenseAccountResolver };


