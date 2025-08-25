import { prisma } from '../tenancy.js';


/**
 * Expense Account Resolver - Unified Account Resolution Service
 * Implements precedence logic: USER > CATEGORY_KEY > KEYWORDS > FALLBACK
 */
class ExpenseAccountResolver {
  static CATEGORY_ACCOUNT_MAPPING = {
    SOFTWARE: '6030',
    TELECOMMUNICATIONS: '6160',
    BANK_FEES: '6015',
    UTILITIES: '6080',
    OFFICE_SUPPLIES: '6020',
    PROFESSIONAL_SERVICES: '6090',
    INSURANCE: '6115',
    LEGAL_COMPLIANCE: '6100',
    TRAINING: '6170',
    RENT: '6070',
    TRAVEL: '6060',
    MARKETING: '6040',
    COGS: '5010',
    MEALS: '6180',
    GENERAL_EXPENSE: '6999'
  };

  static KEYWORD_MAPPINGS = {
    SOFTWARE: ['software','adobe','microsoft','google','cloud','saas','hosting','domain','server','api','slack','zoom','dropbox','notion','github','gitlab','figma'],
    TELECOMMUNICATIONS: ['phone','internet','wifi','mobile','cellular','data','plan','verizon','att','t-mobile','comcast','spectrum','xfinity','fiber','telephone','isp','broadband','static ip','cloudwire'],
    BANK_FEES: ['bank','fee','charge','wire','transfer','overdraft','maintenance','atm','merchant','paypal','stripe'],
    UTILITIES: ['utility','utilities','electric','power','water','sewer','garbage','waste','heating','cooling','energy','pg&e','pge','coned','aqua','aquapure','water delivery','bottled water','dispenser','cooler','jug','jugs','gallon','culligan','sparklett','sparkletts','arrowhead','primo','nestle'],
    OFFICE_SUPPLIES: ['office','supplies','stationery','paper','printer','ink','toner','desk','chair','equipment','furniture','staples','depot','costco'],
    PROFESSIONAL_SERVICES: ['legal','attorney','lawyer','consulting','consultant','accountant','accounting','audit','tax','bookkeeping','financial','advisor'],
    INSURANCE: ['insurance','liability','coverage','policy','premium','health','dental','vision','workers','compensation','auto','vehicle','property','business'],
    TRAINING: ['training','education','course','workshop','seminar','certification','conference','learning','udemy','coursera','pluralsight'],
    RENT: ['rent','lease','office','space','coworking','workspace','property'],
    TRAVEL: ['travel','flight','hotel','airfare','airline','airport','uber','lyft','taxi','rental','car','gas','fuel','parking','toll','mileage','airbnb','delta','united','american'],
    MARKETING: ['marketing','advertising','ads','promotion','facebook','linkedin','twitter','instagram','youtube','social','media','campaign','seo','ppc'],
    MEALS: ['meal','food','restaurant','lunch','dinner','breakfast','coffee','catering','starbucks','doordash','grubhub','ubereats','entertainment','chipotle','mcdonalds','kfc']
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
    const creditResolution = await this.resolveCreditAccount(expenseData.paymentStatus, expenseData.amount);
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
    // 0) AI-suggested account code (if provided and exists)
    try {
      const suggested = (expenseData && (expenseData.suggestedAccountCode || expenseData.accountCode)) ? String(expenseData.suggestedAccountCode || expenseData.accountCode).trim() : ''
      if (suggested) {
        const acc = await this.getAccountByCode(suggested)
        if (acc) return { accountCode: acc.code, accountName: acc.name, source: 'AI_SUGGESTED' }
      }
    } catch {}
    // Prefer obvious utility water delivery patterns before AI/keywords
    try {
      const text = `${vendorName} ${description}`.toLowerCase()
      if (/(\baquapure\b|\bwater\b|bottled water|dispenser|cooler|jug|jugs|gallon|culligan|sparklett|sparkletts|arrowhead|primo)/i.test(text)) {
        const acc = await this.getAccountByCode(this.CATEGORY_ACCOUNT_MAPPING.UTILITIES)
        if (acc) return { accountCode: acc.code, accountName: acc.name, source: 'HEURISTIC_UTILITIES' }
      }
      // Payment processor fees (Stripe/PayPal/Square etc.) → 6230 if available
      if (/(stripe|paypal|square|braintree|merchant|processor)/i.test(text)) {
        const acc = await this.getAccountByCode('6230')
        if (acc) return { accountCode: acc.code, accountName: acc.name, source: 'HEURISTIC_PROCESSOR_FEES' }
      }
      // Cloud hosting (AWS/Azure/GCP/hosting) → 6240 if available
      if (/(aws|amazon web services|azure|gcp|google cloud|cloudfront|s3|ec2|digitalocean|linode|vultr|cloudflare|hosting|server)/i.test(text)) {
        const acc = await this.getAccountByCode('6240')
        if (acc) return { accountCode: acc.code, accountName: acc.name, source: 'HEURISTIC_CLOUD_HOSTING' }
      }
    } catch {}
    // 1) If a category key is provided, honor it
    if (categoryKey && categoryKey !== 'OTHER' && categoryKey !== 'GENERAL_EXPENSE') {
      const accountCode = this.CATEGORY_ACCOUNT_MAPPING[categoryKey];
      if (accountCode) {
        const account = await this.getAccountByCode(accountCode);
        if (account) return { accountCode, accountName: account.name, source: 'USER' };
      }
    }
    // 2) AI-assisted account selection using actual Chart of Accounts (names + codes)
    try {
      const accounts = await prisma.account.findMany({ select: { code: true, name: true } })
      if (accounts && accounts.length) {
        const list = accounts.map(a => `${a.code} — ${a.name}`).join('\n')
        const base = process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
        if (process.env.GEMINI_API_KEY) {
          const axios = (await import('axios')).default
          const prompt = `Pick the BEST matching expense account from my Chart of Accounts for this expense. Return ONLY JSON {"accountCode":"6XXX","reason":"..."}.
Text: "${description}" Vendor: "${vendorName}"
Chart of Accounts:\n${list}`
          try {
            const url = `${base}?key=${process.env.GEMINI_API_KEY}`
            const { data } = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] }, { headers: { 'Content-Type': 'application/json' } })
            let content = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
            content = content.trim()
            if (content.startsWith('```')) content = content.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '')
            const parsed = JSON.parse(content)
            const aiCode = String(parsed?.accountCode || '').replace(/[^0-9]/g, '')
            if (aiCode) {
              const aiAcc = await this.getAccountByCode(aiCode)
              if (aiAcc) return { accountCode: aiAcc.code, accountName: aiAcc.name, source: 'AI' }
            }
          } catch (e) {
            // Normalize AI errors into silent fallback to keyword matching
          }
        }
      }
    } catch {}
    // 3) Keyword mapping heuristic
    const keywordMatch = this.findKeywordMatch(vendorName, description);
    if (keywordMatch) {
      const account = await this.getAccountByCode(keywordMatch.accountCode);
      if (account) return { accountCode: keywordMatch.accountCode, accountName: account.name, source: 'KEYWORDS' };
    }
    // 4) Fallback
    const fallback = await this.getAccountByCode('6999');
    if (!fallback) throw new Error('Fallback account 6999 (General Expense) not found in Chart of Accounts');
    return { accountCode: '6999', accountName: fallback.name, source: 'FALLBACK' };
  }

  static async resolveCreditAccount(paymentStatus, amount) {
    // For refunds (negative amount), treat as cash movement regardless of status
    try { if (parseFloat(amount) < 0) { const acc = await this.getAccountByCode('1010'); if (acc) return { accountCode: acc.code, accountName: acc.name, source: 'REFUND' } } } catch {}
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
    const account = await prisma.account.findFirst({
      where: { code: accountCode },
      select: { id: true, code: true, name: true, type: true, normalBalance: true }
    });
    // Fallback: if code 6999 missing in demo databases, map to '6020 Office Supplies' to keep previews working
    if (!account && accountCode === '6999') {
      const fallback = await prisma.account.findFirst({ where: { code: '6020' }, select: { id: true, code: true, name: true, type: true, normalBalance: true } })
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


