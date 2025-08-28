import { prisma } from '../tenancy.js';
import { ExpenseAccountResolver } from './expense-account-resolver.service.js';


/**
 * PostingService - Centralized Double-Entry Bookkeeping Engine
 * 
 * Phase 2 Implementation: Handles expense transactions with proper double-entry logic
 * Phase 3 Ready: Extensible for invoices and other transaction types
 * 
 * Features:
 * - Atomic transaction processing with Prisma transactions
 * - Idempotency protection via unique references
 * - Account resolution via ExpenseAccountResolver
 * - Complete double-entry validation
 * - Comprehensive error handling and rollback
 */
class PostingService {

  /**
   * Normalize/sanitize an invoice number. Returns null if invalid.
   */
  static normalizeInvoiceNumber(raw) {
    try {
      if (!raw) return null;
      let s = String(raw).trim();
      if (!s) return null;
      // Reject obvious non-numbers and dates
      if (/^invoice\s*(date|dt)?$/i.test(s)) return null;
      if (/^date$/i.test(s)) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; // ISO date
      if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return null; // MDY/DMY
      // Remove surrounding label fragments if any
      s = s.replace(/^#/, '').replace(/\s+/g, '');
      // Must contain at least one digit
      if (!/[0-9]/.test(s)) return null;
      // Allowed characters
      if (!/^[A-Za-z0-9][A-Za-z0-9._\-\/]*$/.test(s)) return null;
      if (s.length < 3 || s.length > 40) return null;
      return s;
    } catch {
      return null;
    }
  }

  /**
   * Main posting method for expense transactions
   * Implements Phase 2 MVP requirements with full double-entry bookkeeping
   * 
   * @param {Object} expenseData - Canonical expense data
   * @returns {Promise<Object>} - Posting result with transaction details
   */
  static async postTransaction(expenseData) {
    console.log(`📝 PostingService.postTransaction() starting for ${expenseData.vendorName}`);
    console.log(`🔍 EXPENSE DATA RECEIVED:`, JSON.stringify({
      vendor: expenseData.vendorName,
      amount: expenseData.amount,
      amountPaid: expenseData.amountPaid,
      balanceDue: expenseData.balanceDue,
      paymentStatus: expenseData.paymentStatus
    }, null, 2));
    
    try {
      // Step 1: Generate idempotent reference if not provided
      const reference = expenseData.reference || this.generateReference('EXP', expenseData);
      console.log(`🔗 Using reference: ${reference}`);
      
      // Step 2: Check for existing transaction (idempotency)
      const existingTransaction = await this.checkExistingTransaction(reference);
      if (existingTransaction) {
        console.log(`🔄 Idempotent response: Transaction ${reference} already exists`);
        return this.formatExistingTransactionResponse(existingTransaction);
      }
      
      // Step 3: Resolve accounts using ExpenseAccountResolver
      const accountResolution = await ExpenseAccountResolver.resolveExpenseAccounts(expenseData);
      console.log(`✅ Accounts resolved: Dr ${accountResolution.debit.accountCode}, Cr ${accountResolution.credit.accountCode}`);
      
      // Step 4: Get account IDs from database
      const accounts = await this.getAccountsByCode([
        accountResolution.debit.accountCode,
        accountResolution.credit.accountCode
      ]);
      
      // Step 5: Create complete transaction with double-entry in atomic operation
      // Pre-compute totals and payments for storage on transaction
      const totalForStorage = parseFloat(expenseData.amount) || 0;
      let amountPaidForStorage = 0;
      try {
        amountPaidForStorage = expenseData.amountPaid != null ? parseFloat(expenseData.amountPaid) : 0;
        if (!Number.isFinite(amountPaidForStorage)) amountPaidForStorage = 0;
      } catch {}
      let balanceDueForStorage = expenseData.balanceDue != null ? parseFloat(expenseData.balanceDue) : (totalForStorage - amountPaidForStorage);
      if (!Number.isFinite(balanceDueForStorage)) balanceDueForStorage = totalForStorage - amountPaidForStorage;

      const result = await prisma.$transaction(async (tx) => {
        // Create Transaction header
        const transaction = await tx.transaction.create({
          data: {
            date: new Date(accountResolution.dateUsed),
            description: this.buildTransactionDescription(expenseData),
            reference: reference,
            amount: parseFloat(expenseData.amount),
            customFields: {
              type: 'expense',
              vendorName: expenseData.vendorName,
              categoryKey: expenseData.categoryKey,
              paymentStatus: expenseData.paymentStatus,
              amountPaid: amountPaidForStorage,
              initialAmountPaid: amountPaidForStorage,
              balanceDue: balanceDueForStorage,
              policy: accountResolution.policy,
              source: 'PostingService',
              isRecurring: !!expenseData.recurring,
              recurringRuleId: expenseData.recurringRuleId || null,
              // Items & Tax panel fields
              subtotal: (() => { try {
                // Compute subtotal from gross and tax if not provided
                const gross = parseFloat(expenseData.amount) || 0
                let taxAmt = 0
                try { taxAmt = parseFloat(expenseData?.tax?.amount||0) || 0 } catch {}
                const sub = Math.max(0, gross - taxAmt)
                return Number(sub.toFixed(2))
              } catch { return parseFloat(expenseData.amount)||0 } })(),
              tax: expenseData?.tax || null,
              splitByLineItems: !!expenseData.splitByLineItems,
              lineItems: Array.isArray(expenseData.lineItems) ? expenseData.lineItems : []
            }
          }
        });

        // Double entry using expense logic (supports tax and line items)
        const useSplit = !!expenseData.splitByLineItems || (Array.isArray(expenseData.lineItems) && expenseData.lineItems.length > 0)
        const entries = useSplit
          ? await PostingService.createDoubleEntryRecordsSplit(tx, transaction.id, accounts, accountResolution, expenseData)
          : await PostingService.createDoubleEntryRecords(tx, transaction.id, accounts, accountResolution, expenseData)

        // Validate
        this.validateDoubleEntryBalance(entries);

        // Create linked Expense record for downstream payment APIs
        let expenseRow = null
        try {
          expenseRow = await tx.expense.create({
            data: {
              transactionId: transaction.id,
              vendor: String(expenseData.vendorName || '').trim(),
              vendorInvoiceNo: expenseData.vendorInvoiceNo ? String(expenseData.vendorInvoiceNo) : null,
              categoryId: null,
              categoryKey: expenseData.categoryKey || null,
              date: new Date(accountResolution.dateUsed),
              amount: parseFloat(expenseData.amount),
              description: expenseData.description || this.buildTransactionDescription(expenseData),
              receiptUrl: expenseData.receiptUrl || null,
              customFields: {
                splitByLineItems: !!expenseData.splitByLineItems,
                lineItems: Array.isArray(expenseData.lineItems) ? expenseData.lineItems : []
              },
              isRecurring: !!expenseData.recurring,
              isPending: false
            }
          })
        } catch (e) {
          // Non-fatal: payment flows will fall back to transaction customFields, but smoke expects expenseId
          try { console.warn('[expense:create] failed to create Expense row:', e?.message || e) } catch {}
        }

        return {
          transactionId: transaction.id,
          expenseId: expenseRow?.id || null,
          amount: parseFloat(expenseData.amount),
          entries
        };
      });

      return result;
    } catch (error) {
      console.error('❌ Error in PostingService.postTransaction:', error);
      throw error;
    }
  }

  /**
   * Creates proper double-entry records for expense transaction
   * Debit: Expense Account | Credit: Cash/Accounts Payable
   */
  static async createDoubleEntryRecords(tx, transactionId, accounts, accountResolution, expenseData) {
    const amount = parseFloat(expenseData.amount);
    const entries = [];

    // Handle negative amounts (refunds) by swapping debit/credit logic
    const isRefund = amount < 0;
    const absAmount = Math.abs(amount);

    if (isRefund) {
      // Refund logic: Reverse the original expense transaction
      // Entry 1: DEBIT cash/AP account (opposite of original credit)
      const debitEntry = await tx.transactionEntry.create({
        data: {
          transactionId: transactionId,
          debitAccountId: accounts.credit.id, // Was credit account, now debit
          creditAccountId: null,
          amount: absAmount,
          description: `REFUND: ${this.buildCreditDescription(expenseData, accountResolution.credit.accountName)}`
        }
      });
      entries.push(debitEntry);

      // Entry 2: CREDIT expense account (opposite of original debit)
      const creditEntry = await tx.transactionEntry.create({
        data: {
          transactionId: transactionId,
          debitAccountId: null,
          creditAccountId: accounts.debit.id, // Was debit account, now credit
          amount: absAmount,
          description: `REFUND: ${accountResolution.debit.accountName} - ${expenseData.vendorName}`
        }
      });
      entries.push(creditEntry);

      console.log(`📊 Refund entries created: Dr ${accountResolution.credit.accountCode} $${absAmount} | Cr ${accountResolution.debit.accountCode} $${absAmount}`);
    } else {
      // Normal expense logic with optional tax split
      let taxAmount = 0;
      try {
        if (expenseData?.taxSettings?.enabled) {
          if (expenseData.taxSettings.type === 'percentage') {
            const rate = parseFloat(expenseData.taxSettings.rate || 0) || 0;
            // Treat input amount as gross; extract tax portion accurately
            const divisor = 1 + (rate / 100)
            const base = divisor > 0 ? (absAmount / divisor) : absAmount
            taxAmount = Math.max(0, +(absAmount - base).toFixed(2))
          } else {
            taxAmount = Math.max(0, parseFloat(expenseData.taxSettings.amount || 0) || 0);
            if (taxAmount > absAmount) taxAmount = absAmount;
          }
          if (expenseData.taxSettings.taxExempt === true) taxAmount = 0;
        }
      } catch {}
      const subtotal = Math.max(0, +(absAmount - taxAmount).toFixed(2));

      // Debit subtotal to expense account (header-level override supported when split is OFF)
      if (subtotal > 0) {
        let debitAcc = accounts.debit
        try {
          const explicitHeader = (expenseData && typeof (expenseData.accountCode) === 'string') ? String(expenseData.accountCode).trim() : ''
          if (explicitHeader) {
            const acc = await prisma.account.findFirst({ where: { code: explicitHeader } })
            if (acc) debitAcc = acc
          }
        } catch {}
        const debitEntry = await tx.transactionEntry.create({
          data: {
            transactionId: transactionId,
            debitAccountId: debitAcc.id,
            creditAccountId: null,
            amount: subtotal,
            description: `${debitAcc.name} - ${expenseData.vendorName}`
          }
        });
        entries.push(debitEntry);
      }

      // Debit tax amount to Tax Expense/Receivable based on company tax regime
      if (taxAmount > 0) {
        // Resolve account codes from CompanyProfile overrides, explicitly scoping by the transaction's tenantId
        let taxAccountCode = '6110'; // default US Sales Tax Expense
        let resolvedRegime = 'US_SALES_TAX'
        try {
          const txHeader = await tx.transaction.findUnique({ where: { id: transactionId }, select: { tenantId: true } })
          const tenantId = txHeader?.tenantId || 'dev'
          const prof = await tx.companyProfile.findFirst({ where: { tenantId }, select: { taxRegime: true, taxAccounts: true } })
          if (prof) {
            const overrides = (prof.taxAccounts || {})
            resolvedRegime = String(prof.taxRegime || '').toUpperCase() || 'US_SALES_TAX'
            if (resolvedRegime === 'VAT') {
              taxAccountCode = (overrides.receivable || '1360')
            } else {
              taxAccountCode = (overrides.expense || '6110')
            }
          }
        } catch {}
        let taxAccount = await tx.account.findFirst({ where: { code: taxAccountCode } });
        if (!taxAccount) taxAccount = await tx.account.findFirst({ where: { code: '6110' } }); // fallback to expense
        if (!taxAccount) throw new Error('Tax account not found in Chart of Accounts');
        const taxDebit = await tx.transactionEntry.create({
          data: {
            transactionId: transactionId,
            debitAccountId: taxAccount.id,
            creditAccountId: null,
            amount: taxAmount,
            description: `Tax on expense - ${expenseData.vendorName}`
          }
        });
        try { if (process.env.DEBUG_TAX === '1') console.log('[TAX_MAP]', { transactionId, taxAccountCode, resolvedRegime, taxAmount }) } catch {}
        entries.push(taxDebit);
      }

      // Credit cash/AP for the full gross amount
      const creditEntry = await tx.transactionEntry.create({
        data: {
          transactionId: transactionId,
          debitAccountId: null,
          creditAccountId: accounts.credit.id,
          amount: absAmount,
          description: this.buildCreditDescription(expenseData, accountResolution.credit.accountName)
        }
      });
      entries.push(creditEntry);

      console.log(`📊 Double-entry created: Dr ${accountResolution.debit.accountCode} $${subtotal}${taxAmount>0?` + Dr 6110 $${taxAmount}`:''} | Cr ${accountResolution.credit.accountCode} $${absAmount}`);
    }

    return entries;
  }

  /**
   * Split-by-line-items variant: debit per line to mapped expense accounts,
   * debit tax to tax account (if any), and credit full gross to cash/AP.
   */
  static async createDoubleEntryRecordsSplit(tx, transactionId, accounts, accountResolution, expenseData) {
    const amount = parseFloat(expenseData.amount);
    const entries = [];
    const isRefund = amount < 0;
    const absAmount = Math.abs(amount);
    if (isRefund) {
      // For simplicity, fallback to standard logic for refunds
      return this.createDoubleEntryRecords(tx, transactionId, accounts, accountResolution, expenseData)
    }

    // Compute tax amount from settings
    let taxAmount = 0;
    try {
      if (expenseData?.taxSettings?.enabled) {
        if (expenseData.taxSettings.type === 'percentage') {
          const rate = parseFloat(expenseData.taxSettings.rate || 0) || 0;
          taxAmount = parseFloat((absAmount * rate / 100).toFixed(2));
        } else {
          taxAmount = Math.max(0, parseFloat(expenseData.taxSettings.amount || 0) || 0);
          if (taxAmount > absAmount) taxAmount = absAmount;
        }
        if (expenseData.taxSettings.taxExempt === true) taxAmount = 0;
      }
    } catch {}
    const subtotal = Math.max(0, +(absAmount - taxAmount).toFixed(2));

    // Create per-line debits scaled to subtotal
    const lines = Array.isArray(expenseData.lineItems) ? expenseData.lineItems : []
    const originalSum = lines.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0)
    const scale = originalSum > 0 ? (subtotal / originalSum) : 1
    let running = 0
    for (let i = 0; i < lines.length; i++) {
      const li = lines[i]
      const raw = parseFloat(li.amount) || 0
      let lineAmount = +(raw * scale).toFixed(2)
      if (i === lines.length - 1) lineAmount = +(subtotal - running).toFixed(2)
      // Map line item to expense account via resolver keywords/category mapping
      let debitAccount = accounts.debit
      let isInventoryProduct = false
      let selectedInventoryAccount = null
      let selectedProduct = null
      try {
        // Prefer explicit override from line item
        const explicit = (li && typeof li.accountCode === 'string') ? String(li.accountCode).trim() : ''
        if (explicit) {
          const acc = await prisma.account.findFirst({ where: { code: explicit } })
          if (acc) debitAccount = acc
        } else {
          // Use resolver to pick best matching expense account for the line
          const { ExpenseAccountResolver } = await import('./expense-account-resolver.service.js')
          const res = await ExpenseAccountResolver.resolveDebitAccount({ categoryKey: null, vendorName: expenseData.vendorName, description: li.description || '' })
          if (res && res.accountCode) {
            const acc = await prisma.account.findFirst({ where: { code: res.accountCode } })
            if (acc) debitAccount = acc
          }
        }
        // Inventory product handling (AP receive): route debit to Inventory and record lot
        try {
          const productId = (li && (li.productId || li.productID || li.product_id)) ? String(li.productId || li.productID || li.product_id) : ''
          if (productId) {
            const product = await tx.product.findUnique({ where: { id: productId } })
            if (product && String(product.type).toLowerCase() === 'inventory') {
              isInventoryProduct = true
              selectedProduct = product
              const invCode = product.inventoryAccountCode || '1300'
              const invAcc = await tx.account.findFirst({ where: { code: invCode } })
              if (!invAcc) throw new Error(`Inventory account ${invCode} not found`)
              debitAccount = invAcc
              selectedInventoryAccount = invAcc
            }
          }
        } catch {}
      } catch {}
      if (lineAmount > 0) {
        const debitEntry = await tx.transactionEntry.create({
          data: { transactionId, debitAccountId: debitAccount.id, creditAccountId: null, amount: lineAmount, description: `${debitAccount.name} - ${expenseData.vendorName}${li.description ? ` (${li.description})` : ''}` }
        })
        entries.push(debitEntry)
        running += lineAmount
        // If inventory product, create an InventoryLot and txn (receive)
        if (isInventoryProduct && selectedProduct && selectedInventoryAccount) {
          try {
            const qty = (() => { try { const qv = (li.quantity!=null? Number(li.quantity): (li.qty!=null? Number(li.qty): 1)); return (Number.isFinite(qv) && qv>0)? qv : 1 } catch { return 1 } })()
            const unitCost = +(lineAmount / qty).toFixed(6)
            await tx.inventoryLot.create({ data: {
              productId: selectedProduct.id,
              receivedOn: new Date(expenseData.date || new Date()),
              qty,
              unitCost,
              remainingQty: qty,
              sourceBillId: null
            } })
            await tx.inventoryTxn.create({ data: {
              productId: selectedProduct.id,
              type: 'receive',
              qty,
              unitCost,
              journalId: transactionId,
              memo: li.description || 'Inventory receipt (AP)'
            } })
          } catch (invErr) {
            // Best-effort; do not fail the AP posting if inventory sidecar fails
            try { console.warn('[inventory][receive] sidecar error:', invErr?.message || invErr) } catch {}
          }
        }
      }
    }

    // Debit tax amount to Tax Expense/Receivable based on regime
    if (taxAmount > 0) {
      let taxAccountCode = '6110';
      let resolvedRegime = 'US_SALES_TAX'
      try {
        const txHeader = await tx.transaction.findUnique({ where: { id: transactionId }, select: { tenantId: true } })
        const tenantId = txHeader?.tenantId || 'dev'
        const prof = await tx.companyProfile.findFirst({ where: { tenantId }, select: { taxRegime: true, taxAccounts: true } })
        if (prof) {
          const overrides = (prof.taxAccounts || {})
          resolvedRegime = String(prof.taxRegime || '').toUpperCase() || 'US_SALES_TAX'
          if (resolvedRegime === 'VAT') taxAccountCode = (overrides.receivable || '1360')
          else taxAccountCode = (overrides.expense || '6110')
        }
      } catch {}
      let taxAccount = await tx.account.findFirst({ where: { code: taxAccountCode } });
      if (!taxAccount) taxAccount = await tx.account.findFirst({ where: { code: '6110' } });
      if (!taxAccount) throw new Error('Tax account not found in Chart of Accounts');
      const taxDebit = await tx.transactionEntry.create({ data: { transactionId, debitAccountId: taxAccount.id, creditAccountId: null, amount: taxAmount, description: `Tax on expense - ${expenseData.vendorName}` } });
      entries.push(taxDebit);
    }

    // Credit cash/AP for the full gross amount
    const creditEntry = await tx.transactionEntry.create({
      data: { transactionId, debitAccountId: null, creditAccountId: accounts.credit.id, amount: absAmount, description: this.buildCreditDescription(expenseData, accountResolution.credit.accountName) }
    });
    entries.push(creditEntry);

    return entries;
  }

  /**
   * Validates that debits equal credits (fundamental accounting equation)
   */
  static validateDoubleEntryBalance(entries) {
    const totalDebits = entries
      .filter(entry => entry.debitAccountId !== null)
      .reduce((sum, entry) => sum + parseFloat(entry.amount), 0);
      
    const totalCredits = entries
      .filter(entry => entry.creditAccountId !== null)
      .reduce((sum, entry) => sum + parseFloat(entry.amount), 0);
    
    const difference = Math.abs(totalDebits - totalCredits);
    
    if (difference > 0.001) { // Allow for tiny rounding differences
      throw new Error(`BALANCED JOURNAL INVARIANT FAILED: Debits ($${totalDebits}) ≠ Credits ($${totalCredits}), Difference: $${difference}`);
    }
    
    console.log(`⚖️ Double-entry validated: Debits=$${totalDebits}, Credits=$${totalCredits} ✅`);
    return true;
  }

  /**
   * Generates unique, idempotent reference for transactions
   */
  static generateReference(type, transactionData) {
    const timestamp = Date.now();
    // Handle both expense (vendorName) and invoice (customerName) data
    const entityName = transactionData.vendorName || transactionData.customerName || 'Unknown';
    const entityHash = this.simpleHash(entityName);
    const amountHash = this.simpleHash(transactionData.amount.toString());
    
    return `${type}-${timestamp}-${entityHash}-${amountHash}`;
  }

  /**
   * Simple hash function for reference generation
   */
  static simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 6);
  }

  /**
   * Checks for existing transaction by reference (idempotency)
   */
  static async checkExistingTransaction(reference) {
    try {
      const existing = await prisma.transaction.findFirst({
        where: { reference: reference },
        include: {
          entries: {
            include: {
              debitAccount: { select: { code: true, name: true } },
              creditAccount: { select: { code: true, name: true } }
            }
          },
          expense: true
        }
      });
      
      return existing;
    } catch (error) {
      console.error('Error checking existing transaction:', error);
      return null;
    }
  }

  /**
   * Formats response for existing transaction (idempotency)
   */
  static formatExistingTransactionResponse(existingTransaction) {
    return {
      transactionId: existingTransaction.id,
      expenseId: existingTransaction.expense?.id,
      reference: existingTransaction.reference,
      amount: existingTransaction.amount.toString(),
      dateUsed: existingTransaction.date.toISOString().split('T')[0],
      entries: existingTransaction.entries,
      isExisting: true,
      message: `Transaction already exists (idempotent): $${existingTransaction.amount}`
    };
  }

  /**
   * Gets account records by codes with validation
   */
  static async getAccountsByCode(accountCodes) {
    try {
      const accounts = await prisma.account.findMany({
        where: { code: { in: accountCodes } },
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          normalBalance: true
        }
      });

      // Create lookup object
      const accountLookup = {};
      accounts.forEach(account => {
        accountLookup[account.code] = account;
      });

      // Validate all required accounts exist
      const missingCodes = accountCodes.filter(code => !accountLookup[code]);
      if (missingCodes.length > 0) {
        throw new Error(`Missing accounts in Chart of Accounts: ${missingCodes.join(', ')}`);
      }

      // Return structured object
      return {
        debit: accountLookup[accountCodes[0]],
        credit: accountLookup[accountCodes[1]]
      };
    } catch (error) {
      console.error('Error fetching accounts:', error);
      throw error;
    }
  }

  /**
   * Builds transaction description for main Transaction record
   */
  static buildTransactionDescription(expenseData) {
    const category = expenseData.categoryKey || 'General';
    return `${category} - ${expenseData.vendorName}`;
  }

  /**
   * Builds credit entry description based on payment status
   */
  static buildCreditDescription(expenseData, creditAccountName) {
    const { paymentStatus, vendorName } = expenseData;
    
    switch (paymentStatus) {
      case 'paid':
        return `Payment to ${vendorName} (Cash)`;
      case 'unpaid':
        return `Bill from ${vendorName} (A/P)`;
      case 'partial':
        return `Partial payment to ${vendorName}`;
      case 'overpaid':
        return `Overpayment to ${vendorName}`;
      default:
        return `Payment to ${vendorName} (${creditAccountName})`;
    }
  }

  /**
   * Validates expense payload and normalizes data
   * Used by server endpoints before calling postTransaction
   */
  static validateExpensePayload(requestBody) {
    const errors = [];
    
    // Required fields validation
    if (!requestBody.vendorName || typeof requestBody.vendorName !== 'string') {
      errors.push('vendorName is required and must be a string');
    }
    // Allow negative amounts for refund transactions
    const amount = parseFloat(requestBody.amount);
    const isRefund = requestBody.isRefund === true || requestBody.isRefundTransaction === true;
    if (!requestBody.amount || isNaN(amount)) {
      errors.push('amount is required and must be a valid number');
    } else if (amount === 0) {
      errors.push('amount cannot be zero');
    } else if (amount > 0) {
      // Positive amounts are valid
    } else if (amount < 0 && !isRefund) {
      errors.push('amount must be positive (use refund transactions for negative amounts)');
    }

    if (!requestBody.date) {
      errors.push('date is required');
    }
    
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (requestBody.date && !dateRegex.test(requestBody.date)) {
      errors.push('date must be in YYYY-MM-DD format');
    }
    
    // Validate payment status (expanded)
    const validPaymentStatuses = [
      'paid',
      'unpaid',
      'partial',
      'overpaid',
      'overdue',
      'voided',
      'draft',
      'refunded'
    ];
    const paymentStatus = requestBody.paymentStatus || 'unpaid';
    if (!validPaymentStatuses.includes(paymentStatus)) {
      errors.push(`paymentStatus must be one of: ${validPaymentStatuses.join(', ')}`);
    }
    
    if (errors.length > 0) {
      return {
        isValid: false,
        errors: errors
      };
    }
    
    // Normalize and return clean data
    // Tax settings normalization (optional)
    let taxSettings = { enabled: false };
    try {
      if (requestBody.taxSettings && (requestBody.taxSettings.enabled === true || requestBody.taxSettings.enabled === 'true')) {
        taxSettings = {
          enabled: true,
          type: (requestBody.taxSettings.type === 'amount' ? 'amount' : 'percentage'),
          name: requestBody.taxSettings.name || 'Tax',
          rate: requestBody.taxSettings.type === 'percentage' ? (parseFloat(requestBody.taxSettings.rate || 0) || 0) : 0,
          amount: requestBody.taxSettings.type === 'amount' ? (parseFloat(requestBody.taxSettings.amount || 0) || 0) : 0,
          taxExempt: !!requestBody.taxSettings.taxExempt
        };
      }
    } catch {}
    // Compute due date: manual dueDate wins; else use dueDays relative to date (default Net-0)
    let computedDueDate = requestBody.dueDate || null
    if (!computedDueDate) {
      try {
        const base = requestBody.date
        if (base) {
          const d = new Date(base)
          if (!isNaN(d.getTime())) {
            let dd = parseInt(String(requestBody.dueDays ?? '0'), 10)
            if (!Number.isFinite(dd)) dd = 0
            if (dd < 0) dd = 0
            if (dd > 365) dd = 365
            d.setDate(d.getDate() + dd)
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const da = String(d.getDate()).padStart(2, '0')
            computedDueDate = `${y}-${m}-${da}`
          }
        }
      } catch {}
    }
    // Normalize line items (optional) with qty/rate support
    let lineItems = []
    try {
      if (Array.isArray(requestBody.lineItems)) {
        lineItems = requestBody.lineItems.map((item, index) => ({
          description: (item && item.description) ? String(item.description) : `Line Item ${index + 1}`,
          amount: (item && item.amount != null) ? +parseFloat(String(item.amount)).toFixed(2) : 0,
          quantity: (item && item.quantity != null) ? parseFloat(String(item.quantity)) : undefined,
          rate: (item && item.rate != null) ? +parseFloat(String(item.rate)).toFixed(2) : undefined,
          category: (item && item.category) ? String(item.category) : undefined
        })
        ).filter(li => (li.description && li.description.trim()) || (li.amount && !isNaN(li.amount)))
      }
    } catch {}

    const normalizedData = {
      vendorName: requestBody.vendorName.trim(),
      vendorInvoiceNo: (requestBody.vendorInvoiceNo && String(requestBody.vendorInvoiceNo).trim()) || null,
      amount: parseFloat(requestBody.amount).toFixed(2),
      date: requestBody.date,
      categoryKey: requestBody.categoryKey || requestBody.category || null,
      paymentStatus: paymentStatus,
      description: requestBody.description || requestBody.notes || `Expense from ${requestBody.vendorName}`,
      notes: requestBody.notes || null,
      receiptUrl: requestBody.receiptUrl || null,
      datePaid: requestBody.datePaid || (paymentStatus === 'paid' ? requestBody.date : null),
      reference: requestBody.reference || null,
      // 🔥 CRITICAL: Include overpaid detection fields
      amountPaid: requestBody.amountPaid ? parseFloat(requestBody.amountPaid).toFixed(2) : null,
      balanceDue: requestBody.balanceDue ? parseFloat(requestBody.balanceDue).toFixed(2) : null,
      invoiceNumber: requestBody.invoiceNumber || null,
      dueDate: computedDueDate || null,
      dueDays: (requestBody.dueDays != null ? Math.max(0, Math.min(365, parseInt(String(requestBody.dueDays), 10) || 0)) : null),
      taxSettings: taxSettings,
      recurring: requestBody.recurring || false,
      overdue: requestBody.overdue || false,
      lineItems
    };
    
    return {
      isValid: true,
      errors: [],
      normalizedData: normalizedData
    };
  }

  /**
   * Invoice/Revenue Posting with Overpayment Support
   * Handles revenue transactions with proper A/R, revenue, and customer credit posting
   * 
   * @param {Object} invoiceData - Invoice data with payment details
   * @returns {Promise<Object>} - Posting result with transaction details
   */
  static async postInvoiceTransaction(invoiceData) {
    console.log(`💰 PostingService.postInvoiceTransaction() starting for ${invoiceData.customerName}`);
    
    try {
      // Step 1: Generate idempotent reference if not provided
      const reference = invoiceData.reference || this.generateReference('INV', invoiceData);
      console.log(`🔗 Using reference: ${reference}`);
      
      // Step 1.5: Idempotency by invoiceNumber (most user-friendly)
      const normalizedInvoiceNumber = this.normalizeInvoiceNumber(invoiceData.invoiceNumber);
      if (normalizedInvoiceNumber) {
        try {
          const existingInvoice = await prisma.invoice.findFirst({
            where: { invoiceNumber: normalizedInvoiceNumber },
            include: { transaction: true }
          });
          if (existingInvoice && existingInvoice.transactionId) {
            // Return existing posting as idempotent success
            const existingTx = await prisma.transaction.findUnique({
              where: { id: existingInvoice.transactionId },
              include: {
                entries: {
                  include: {
                    debitAccount: { select: { code: true, name: true } },
                    creditAccount: { select: { code: true, name: true } }
                  }
                }
              }
            });
            if (existingTx) {
              console.log(`🔄 Idempotent response: Invoice #${normalizedInvoiceNumber} already exists`);
              return {
                transactionId: existingTx.id,
                invoiceId: existingInvoice.id,
                reference: existingTx.reference,
                totalInvoice: parseFloat(existingInvoice.amount),
                amountPaid: parseFloat((existingTx.customFields && existingTx.customFields.amountPaid) || 0),
                balanceDue: parseFloat((existingTx.customFields && existingTx.customFields.balanceDue) || 0),
                overpaidAmount: parseFloat((existingTx.customFields && existingTx.customFields.overpaidAmount) || 0),
                entries: existingTx.entries,
                dateUsed: existingInvoice.date.toISOString().split('T')[0],
                isExisting: true,
                message: `Invoice already exists (number ${normalizedInvoiceNumber}).`,
              };
            }
          }
        } catch (dupCheckErr) {
          // Non-fatal: continue to normal flow; creation will still validate uniqueness
          console.warn('Invoice duplicate check warning:', dupCheckErr?.message || dupCheckErr);
        }
      }

      // Step 2: Check for existing transaction (idempotency)
      const existingTransaction = await this.checkExistingTransaction(reference);
      if (existingTransaction) {
        console.log(`🔄 Idempotent response: Invoice ${reference} already exists`);
        return this.formatExistingTransactionResponse(existingTransaction);
      }
      
      // Step 3: Calculate amounts and determine posting logic
      const totalInvoice = parseFloat(invoiceData.amount);
      const amountPaid = (invoiceData.amountPaid === undefined || invoiceData.amountPaid === null)
        ? 0
        : parseFloat(invoiceData.amountPaid);
      const balanceDue = parseFloat(
        (invoiceData.balanceDue !== undefined && invoiceData.balanceDue !== null)
          ? invoiceData.balanceDue
          : (totalInvoice - amountPaid)
      );
      const overpaidAmount = amountPaid > totalInvoice ? amountPaid - totalInvoice : 0;
      
      console.log(`📊 Invoice amounts: Total=$${totalInvoice}, Paid=$${amountPaid}, Balance=$${balanceDue}, Overpaid=$${overpaidAmount}`);
      
      // Step 4: Resolve accounts for revenue posting
      const accounts = await this.resolveInvoiceAccounts(invoiceData, overpaidAmount);
      
      // Step 5: Create complete transaction with revenue posting in atomic operation
      const result = await prisma.$transaction(async (tx) => {
        // Create Transaction header
        const transaction = await tx.transaction.create({
          data: {
            date: new Date(invoiceData.date),
            description: this.buildInvoiceDescription(invoiceData),
            reference: reference,
            amount: amountPaid, // Total amount received (can be different from invoice total)
            customFields: {
              type: 'invoice',
              customerName: invoiceData.customerName,
              invoiceNumber: invoiceData.invoiceNumber,
              invoiceTotal: totalInvoice,
              amountPaid: amountPaid,
              initialAmountPaid: amountPaid, // enables synthetic initial payment row when posting with partial/paid amount
              balanceDue: balanceDue,
              overpaidAmount: overpaidAmount,
              paymentStatus: invoiceData.paymentStatus,
              dueDate: invoiceData.dueDate || null,
              dueDays: (invoiceData.dueDays != null ? Math.max(0, Math.min(365, parseInt(String(invoiceData.dueDays), 10) || 0)) : null),
              source: 'PostingService',
              // Items & Tax panel fields for AR detail
              subtotal: (() => { try {
                let taxAmount = 0
                if (invoiceData.taxSettings?.enabled) {
                  if (invoiceData.taxSettings.type === 'percentage' && invoiceData.taxSettings.rate) {
                    const afterDiscount = parseFloat(invoiceData.subtotal || totalInvoice) - parseFloat(invoiceData.discount?.amount || 0)
                    taxAmount = afterDiscount * (parseFloat(invoiceData.taxSettings.rate) / 100)
                  } else {
                    taxAmount = parseFloat(invoiceData.taxSettings.amount || 0)
                  }
                  taxAmount = Math.max(0, Math.min(totalInvoice, +parseFloat(String(taxAmount)).toFixed(2)))
                }
                const discountAmount = invoiceData.discount?.enabled ? parseFloat(invoiceData.discount.amount || 0) : 0
                if (invoiceData.subtotal && parseFloat(invoiceData.subtotal) > 0) return +parseFloat(invoiceData.subtotal).toFixed(2)
                return +(totalInvoice - taxAmount - discountAmount).toFixed(2)
              } catch { return null } })(),
              discountAmount: (() => { try { return invoiceData.discount?.enabled ? +(parseFloat(invoiceData.discount.amount || 0).toFixed(2)) : 0 } catch { return 0 } })(),
              taxAmount: (() => { try {
                if (invoiceData.taxSettings?.enabled) {
                  if (invoiceData.taxSettings.type === 'percentage' && invoiceData.taxSettings.rate) {
                    const afterDiscount = parseFloat(invoiceData.subtotal || totalInvoice) - parseFloat(invoiceData.discount?.amount || 0)
                    return +(afterDiscount * (parseFloat(invoiceData.taxSettings.rate) / 100)).toFixed(2)
                  } else {
                    return +(parseFloat(invoiceData.taxSettings.amount || 0).toFixed(2))
                  }
                }
                return 0
              } catch { return 0 } })(),
              lineItems: Array.isArray(invoiceData?.lineItems) ? invoiceData.lineItems.map(li => ({ description: li.description, amount: +(parseFloat(li.amount || 0).toFixed(2)), quantity: (li.quantity!=null? Number(li.quantity): undefined), rate: (li.rate!=null? +parseFloat(String(li.rate)).toFixed(2): undefined) })) : []
            }
          }
        });
        
        // Create Invoice record linked to transaction
        const invoice = await tx.invoice.create({
          data: {
            transactionId: transaction.id,
            customer: invoiceData.customerName,
            invoiceNumber: PostingService.normalizeInvoiceNumber(invoiceData.invoiceNumber) || `INV-${Date.now()}`,
            date: new Date(invoiceData.date),
            amount: totalInvoice,
            description: invoiceData.description || `Invoice for ${invoiceData.customerName}`,
            status: this.determineInvoiceStatus(invoiceData.paymentStatus, balanceDue),
            dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null
          }
        });
        
        // Create revenue posting entries based on payment scenario
        const entries = await this.createInvoiceEntries(
          tx,
          transaction.id,
          accounts,
          {
            totalInvoice,
            amountPaid,
            balanceDue,
            overpaidAmount,
            categoryKey: invoiceData.categoryKey || 'OFFICE_SUPPLIES'
          },
          invoiceData
        );
        
        // Validate double-entry balance (critical accounting invariant)
        this.validateDoubleEntryBalance(entries);
        
        console.log(`🎉 Invoice posted successfully: ${transaction.id}`);
        
        return {
          transactionId: transaction.id,
          invoiceId: invoice.id,
          reference: reference,
          totalInvoice: totalInvoice,
          amountPaid: amountPaid,
          balanceDue: balanceDue,
          overpaidAmount: overpaidAmount,
          entries: entries,
          accounts: accounts,
          dateUsed: invoiceData.date
        };
      });
      
      return {
        ...result,
        isExisting: false,
        message: `Invoice posted successfully: $${amountPaid} received from ${invoiceData.customerName}`
      };
      
    } catch (error) {
      console.error(`❌ PostingService.postInvoiceTransaction() failed:`, error);
      // Prisma P2002 unique constraint on (tenantId, invoiceNumber)
      if (error && (error.code === 'P2002' || /Unique constraint failed/.test(String(error.message)))) {
        try {
          const invNum = (invoiceData.invoiceNumber || '').toString().trim();
          if (invNum) {
            const existingInvoice = await prisma.invoice.findFirst({ where: { invoiceNumber: invNum }, include: { transaction: { include: { entries: { include: { debitAccount: true, creditAccount: true } } } } } });
            if (existingInvoice && existingInvoice.transaction) {
              return {
                transactionId: existingInvoice.transaction.id,
                invoiceId: existingInvoice.id,
                reference: existingInvoice.transaction.reference,
                totalInvoice: parseFloat(existingInvoice.amount),
                amountPaid: parseFloat((existingInvoice.transaction.customFields && existingInvoice.transaction.customFields.amountPaid) || 0),
                balanceDue: parseFloat((existingInvoice.transaction.customFields && existingInvoice.transaction.customFields.balanceDue) || 0),
                overpaidAmount: parseFloat((existingInvoice.transaction.customFields && existingInvoice.transaction.customFields.overpaidAmount) || 0),
                entries: existingInvoice.transaction.entries,
                dateUsed: existingInvoice.date.toISOString().split('T')[0],
                isExisting: true,
                message: `Invoice already exists (number ${invNum}).`,
              };
            }
          }
        } catch (e2) {
          // fall through to generic error
        }
      }
      throw new Error(`Invoice posting error: ${error.message}`);
    }
  }

  /**
   * Creates invoice transaction entries with proper double-entry accounting
   * Supports both single-line and multi-line invoices
   */
  static async createInvoiceEntries(tx, transactionId, accounts, amounts, invoiceData) {
    const entries = [];
    const { totalInvoice, amountPaid, overpaidAmount } = amounts;
    
    // Extract tax and discount amounts
    let taxAmount = 0;
    if (invoiceData.taxSettings?.enabled) {
      if (invoiceData.taxSettings.type === 'percentage' && invoiceData.taxSettings.rate) {
        const afterDiscount = parseFloat(invoiceData.subtotal || totalInvoice) - parseFloat(invoiceData.discount?.amount || 0);
        taxAmount = afterDiscount * (parseFloat(invoiceData.taxSettings.rate) / 100);
      } else {
        taxAmount = parseFloat(invoiceData.taxSettings.amount || 0);
      }
      // Normalize to currency cents to avoid balancing drift (e.g., 279.2514 → 279.25)
      taxAmount = Math.max(0, Math.min(totalInvoice, +parseFloat(String(taxAmount)).toFixed(2)));
    }
    
    const discountAmount = invoiceData.discount?.enabled ? parseFloat(invoiceData.discount.amount || 0) : 0;
    
    let subtotalAmount;
    if (invoiceData.subtotal && parseFloat(invoiceData.subtotal) > 0) {
      subtotalAmount = +parseFloat(invoiceData.subtotal).toFixed(2);
    } else {
      subtotalAmount = +(totalInvoice - taxAmount - discountAmount).toFixed(2);
    }
    
    const hasLineItems = invoiceData.lineItems && invoiceData.lineItems.length > 0;
    
    let sumLineRevenue = 0;
    if (hasLineItems) {
      // Target revenue must equal (total - tax). Scale line amounts proportionally if needed
      const targetRevenue = Math.max(totalInvoice - taxAmount, 0)
      const originalSum = invoiceData.lineItems.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0)
      const scale = originalSum > 0 ? (targetRevenue / originalSum) : 1
      let running = 0
      for (let i = 0; i < invoiceData.lineItems.length; i++) {
        const lineItem = invoiceData.lineItems[i]
        const raw = parseFloat(lineItem.amount) || 0
        let lineAmount = +(raw * scale).toFixed(2)
        // Adjust last line to fix rounding drift
        if (i === invoiceData.lineItems.length - 1) lineAmount = +(targetRevenue - running).toFixed(2)
        // Prefer explicit line item accountCode suggested by AI or user; fallback to mapper
        // For inventory products: simultaneously relieve inventory (FIFO) and record COGS
        let didInventoryCOGS = false
        try {
          const productId = (lineItem && (lineItem.productId || lineItem.productID || lineItem.product_id)) ? String(lineItem.productId || lineItem.productID || lineItem.product_id) : ''
          if (productId) {
            const product = await tx.product.findUnique({ where: { id: productId } })
            if (product && String(product.type).toLowerCase() === 'inventory') {
              // Relieve inventory using FIFO lots
              let qty = (() => { try { const q = (lineItem.quantity!=null? Number(lineItem.quantity): (lineItem.qty!=null? Number(lineItem.qty): 1)); return (Number.isFinite(q) && q>0)? q : 1 } catch { return 1 } })()
              let remaining = qty
              let accumulatedCOGS = 0
              const lots = await tx.inventoryLot.findMany({ where: { productId: product.id, remainingQty: { gt: 0 } }, orderBy: { receivedOn: 'asc' } })
              for (const lot of lots) {
                if (remaining <= 0) break
                const take = Math.min(Number(lot.remainingQty), remaining)
                accumulatedCOGS += take * Number(lot.unitCost)
                remaining -= take
                await tx.inventoryLot.update({ where: { id: lot.id }, data: { remainingQty: Number(lot.remainingQty) - take } })
              }
              const invAccCode = product.inventoryAccountCode || '1300'
              const cogsCode = product.cogsAccountCode || '5000'
              const invAcc = await tx.account.findFirst({ where: { code: invAccCode } })
              const cogsAcc = await tx.account.findFirst({ where: { code: cogsCode } })
              if (!invAcc || !cogsAcc) throw new Error('Required inventory/COGS accounts missing')
              const cogsAmount = +Number(accumulatedCOGS).toFixed(2)
              if (cogsAmount > 0) {
                const drCogs = await tx.transactionEntry.create({ data: { transactionId, debitAccountId: cogsAcc.id, creditAccountId: null, amount: cogsAmount, description: `COGS - ${invoiceData.customerName}${lineItem.description?` (${lineItem.description})`:''}` } })
                const crInv = await tx.transactionEntry.create({ data: { transactionId, debitAccountId: null, creditAccountId: invAcc.id, amount: cogsAmount, description: `Inventory relief - ${invoiceData.customerName}${lineItem.description?` (${lineItem.description})`:''}` } })
                entries.push(drCogs)
                entries.push(crInv)
                await tx.inventoryTxn.create({ data: { productId: product.id, type: 'sell', qty: qty, unitCost: +(cogsAmount/qty).toFixed(6), journalId: transactionId, memo: lineItem.description || 'Inventory sale (AR)' } })
                didInventoryCOGS = true
              }
            }
          }
        } catch (invErr) {
          try { console.warn('[inventory][cogs] sidecar error:', invErr?.message || invErr) } catch {}
        }
        const explicitCode = String(lineItem.accountCode || '').trim()
        const revenueAccountCode = explicitCode || this.mapLineItemToRevenueAccount(lineItem);
        let revenueAccount = await this.getAccountByCode(revenueAccountCode);
        // Graceful fallback when mapped revenue account is not present in the tenant COA
        if (!revenueAccount) {
          // Prefer resolved default revenue from accounts (4020 by default)
          if (accounts && accounts.revenue) {
            revenueAccount = accounts.revenue;
          } else {
            // Fallback to 4020 Services Revenue if exists
            revenueAccount = await this.getAccountByCode('4020');
          }
          if (!revenueAccount) {
            throw new Error(`Required revenue account not found (missing ${revenueAccountCode} and fallback 4020). Run /api/setup/seed-coa or /api/setup/ensure-core-accounts.`);
          }
        }
        const revenueEntry = await tx.transactionEntry.create({
          data: {
            transactionId: transactionId,
            debitAccountId: null,
            creditAccountId: revenueAccount.id,
            amount: lineAmount,
            description: `${lineItem.description} - ${invoiceData.customerName} (Invoice ${invoiceData.invoiceNumber || 'N/A'})`
          }
        })
        entries.push(revenueEntry)
        running += lineAmount
      }
      sumLineRevenue = +(running.toFixed(2))
    } else {
      // Determine consistency: subtotal - discount + tax should equal total amount
      const authoritativeTotal = totalInvoice;
      const computedFinal = subtotalAmount - discountAmount + taxAmount;
      const isConsistent = Math.abs((computedFinal || 0) - authoritativeTotal) <= 0.01;

      // Choose revenue credit amount
      // - If consistent, credit revenue at subtotal, and post discount as separate debit
      // - If inconsistent, credit revenue at (total - tax), and do NOT post a separate discount
      let revenueCreditAmount = isConsistent
        ? subtotalAmount
        : Math.max(authoritativeTotal - taxAmount, 0);
      revenueCreditAmount = +parseFloat(String(revenueCreditAmount)).toFixed(2);

      const revenueEntry = await tx.transactionEntry.create({
        data: {
          transactionId: transactionId,
          debitAccountId: null,
          creditAccountId: accounts.revenue.id,
          amount: revenueCreditAmount,
          description: `Revenue from ${invoiceData.customerName} - ${invoiceData.description || 'Services'}`
        }
      });
      entries.push(revenueEntry);

      // Post Sales Discounts only when inputs are consistent
      if (discountAmount > 0 && isConsistent) {
        let discountAccountId;
        if (accounts.salesDiscounts) {
          discountAccountId = accounts.salesDiscounts.id;
        } else {
          const fallbackAccount = await this.getAccountByCode('4910');
          if (!fallbackAccount) throw new Error('Sales Discounts account (4910) not found in database');
          discountAccountId = fallbackAccount.id;
        }
        const discountEntry = await tx.transactionEntry.create({
          data: {
            transactionId: transactionId,
            debitAccountId: discountAccountId,
            creditAccountId: null,
            amount: discountAmount,
            description: `Sales Discount - ${invoiceData.customerName}`
          }
        });
        entries.push(discountEntry);
      }
      sumLineRevenue = revenueCreditAmount;
    }
    
    // CREDIT: Sales Tax Payable (if tax is applied)
    if (taxAmount > 0) {
      let taxAccountId;
      if (accounts.taxPayable) {
        taxAccountId = accounts.taxPayable.id;
      } else {
        const fallbackAccount = await this.getAccountByCode('2150');
        if (!fallbackAccount) throw new Error('Sales Tax Payable account (2150) not found in database');
        taxAccountId = fallbackAccount.id;
      }
      const taxEntry = await tx.transactionEntry.create({
        data: {
          transactionId: transactionId,
          debitAccountId: null,
          creditAccountId: taxAccountId,
          amount: taxAmount,
          description: `Sales Tax - ${invoiceData.customerName}`
        }
      });
      entries.push(taxEntry);
    }
    
    // Note: Sales Discounts entry handled above only when inputs are consistent
    
    // Compute FINAL TOTAL: authoritative invoice total
    const finalTotal = totalInvoice;

    // DEBIT: Cash for amount actually received (if any)
    if (amountPaid > 0) {
      const cashDebit = await tx.transactionEntry.create({
        data: {
          transactionId: transactionId,
          debitAccountId: accounts.cash.id,
          creditAccountId: null,
          amount: amountPaid,
          description: `Cash received from ${invoiceData.customerName}`
        }
      });
      entries.push(cashDebit);
    }

    // DEBIT: Accounts Receivable for remaining balance (if any)
    const remainingReceivable = finalTotal - amountPaid;
    if (remainingReceivable > 0) {
      const arDebit = await tx.transactionEntry.create({
        data: {
          transactionId: transactionId,
          debitAccountId: accounts.arAccount?.id || accounts.cash.id,
          creditAccountId: null,
          amount: remainingReceivable,
          description: `Accounts Receivable - ${invoiceData.customerName} (Invoice ${invoiceData.invoiceNumber || 'N/A'})`
        }
      });
      entries.push(arDebit);
    }
    
    // CREDIT: Customer Credits Payable for overpaid amount (if any)
    if (overpaidAmount > 0) {
      const creditEntry = await tx.transactionEntry.create({
        data: {
          transactionId: transactionId,
          debitAccountId: null,
          creditAccountId: accounts.customerCredits.id,
          amount: overpaidAmount,
          description: `Customer credit balance - ${invoiceData.customerName} overpaid by $${overpaidAmount}`
        }
      });
      entries.push(creditEntry);
    }
    
    // Validate balance
    const debitEntries = entries.filter(entry => entry.debitAccountId);
    const creditEntries = entries.filter(entry => entry.creditAccountId);
    const totalDebits = debitEntries.reduce((sum, entry) => sum + parseFloat(entry.amount), 0);
    const totalCreditsCheck = creditEntries.reduce((sum, entry) => sum + parseFloat(entry.amount), 0);
    if (Math.abs(totalDebits - totalCreditsCheck) > 0.01) {
      throw new Error(`Invoice entries not balanced: Debits=$${totalDebits}, Credits=$${totalCreditsCheck}`);
    }
    
    return entries;
  }

  /**
   * Resolves accounts for invoice/revenue posting
   */
  static async resolveInvoiceAccounts(invoiceData, overpaidAmount) {
    const accountCodes = {
      cash: '1010',           // Cash and Cash Equivalents
      arAccount: '1200',      // Accounts Receivable
      revenue: this.mapCategoryToRevenueAccount(invoiceData.categoryKey || 'OFFICE_SUPPLIES'),
      customerCredits: '2050', // Customer Credits Payable (for overpayments)
      taxPayable: '2150',     // Sales Tax Payable (for tax amounts)
      salesDiscounts: '4910'  // Sales Discounts (contra-revenue for discounts)
    };
    const requiredCodes = Object.values(accountCodes).filter(Boolean);
    const accounts = await this.getAccountsByCodeLookup(requiredCodes);
    return {
      cash: accounts[accountCodes.cash],
      arAccount: accounts[accountCodes.arAccount],
      revenue: accounts[accountCodes.revenue],
      customerCredits: overpaidAmount > 0 ? accounts[accountCodes.customerCredits] : null,
      taxPayable: accounts[accountCodes.taxPayable],
      salesDiscounts: accounts[accountCodes.salesDiscounts]
    };
  }

  /**
   * Maps expense category to appropriate revenue account
   */
  static mapCategoryToRevenueAccount(categoryKey) {
    const revenueMapping = {
      'SOFTWARE': '4020',
      'PROFESSIONAL_SERVICES': '4020',
      'OFFICE_SUPPLIES': '4010',
      'MARKETING': '4020',
      'TRAINING': '4020',
      'CONSULTING': '4020',
      'OTHER': '4020'
    };
    return revenueMapping[categoryKey] || '4020';
  }

  /**
   * Maps line item category/description to specific revenue account
   */
  static mapLineItemToRevenueAccount(lineItem) {
    const description = (lineItem.description || '').toLowerCase();
    const category = (lineItem.category || '').toLowerCase();
    // Core services
    if (/(web\s*development|website|site\s*build|frontend|backend|full\s*stack)/i.test(description) || category.includes('development')) return '4020';
    if (/(design|ui\/ux|ux|ui|branding|prototype|wireframe)/i.test(description) || category.includes('design')) return '4020';
    if (/(consulting|consultation|advisory|advice|assessment|audit)/i.test(description) || category.includes('consulting')) return '4020';
    // Marketing & growth → 4030
    if (/(seo|sem|marketing|campaign|ads?|ppc|lead gen|growth|influencer|social|content\s*marketing|newsletter|email\s*marketing)/i.test(description) || category.includes('marketing')) return '4030';
    // Support & maintenance → 4040
    if (/(support|maintenance|help\s*desk|sre|on\-?call|warranty)/i.test(description)) return '4040';
    // Physical product/device sales → 4010
    if (/(iphone|ipad|macbook|imac|laptop|desktop|workstation|pc\b|gpu|graphics\s*card|rtx|gtx|nvidia|amd|intel|printer|monitor|keyboard|mouse|tablet|device|hardware)/i.test(description)) return '4010';
    // Subscriptions / SaaS / Hosting → 4050
    if (/(subscription|saas|license\s*subscription|monthly\s*plan|annual\s*plan|hosting|cloud|vps|server|cdn|domain|dns)/i.test(description) || category.includes('subscription')) return '4050';
    // Licensing (perpetual or term) → 4060
    if (/(license|licence|perpetual\s*license|seat\s*license)/i.test(description) || category.includes('license')) return '4060';
    // Training & certification → 4070
    if (/(training|workshop|course|bootcamp|certification|certified)/i.test(description) || category.includes('training')) return '4070';
    // Analytics / data services → 4020 default unless specified; treat as services
    if (/(analytics|bi|data\s*pipeline|etl|dashboard)/i.test(description)) return '4020';
    // Security services → services
    if (/(pentest|penetration\s*test|security\s*review|vapt|soc\s*2\s*readiness)/i.test(description)) return '4020';
    // HR/Payroll services → services
    if (/(payroll\s*services|hr\s*services|recruiting\s*services)/i.test(description)) return '4020';
    return '4020';
  }

  /**
   * Helper method to get a single account by code
   */
  static async getAccountByCode(accountCode) {
    try {
      const account = await prisma.account.findFirst({
        where: { code: accountCode },
        select: { id: true, code: true, name: true, type: true, normalBalance: true }
      });
      return account;
    } catch (error) {
      console.error(`❌ Error fetching account ${accountCode}:`, error);
      throw new Error(`Failed to fetch account ${accountCode}: ${error.message}`);
    }
  }

  /**
   * Helper method to get accounts by code as lookup object
   */
  static async getAccountsByCodeLookup(accountCodes) {
    try {
      const accounts = await prisma.account.findMany({
        where: { code: { in: accountCodes } },
        select: { id: true, code: true, name: true, type: true, normalBalance: true }
      });
      const accountLookup = {};
      accounts.forEach(account => { accountLookup[account.code] = account; });
      const missingCodes = accountCodes.filter(code => !accountLookup[code]);
      if (missingCodes.length > 0) throw new Error(`Missing accounts in Chart of Accounts: ${missingCodes.join(', ')}`);
      return accountLookup;
    } catch (error) {
      console.error('Error fetching accounts:', error);
      throw error;
    }
  }

  /**
   * Determines invoice status based on payment information
   */
  static determineInvoiceStatus(paymentStatus, balanceDue) {
    try {
      if (paymentStatus === 'paid' || Math.abs(balanceDue) < 0.01) return 'PAID';
      if (paymentStatus === 'overpaid') return 'PAID';
      if (paymentStatus === 'partial' || paymentStatus === 'invoice') {
        // Use dueDate from caller context if available on this function (callers pass it via invoiceData)
        const now = new Date();
        // Fallback: try to read a bound this.invoiceDueDate if caller set it; otherwise, not overdue
        const due = this.invoiceDueDate instanceof Date ? this.invoiceDueDate : null;
        if (due && due.getTime() < new Date(now.toDateString()).getTime()) return 'OVERDUE';
        return 'SENT';
      }
      return 'SENT';
    } catch {
      return 'SENT';
    }
  }

  /**
   * Builds invoice description for Transaction record
   */
  static buildInvoiceDescription(invoiceData) {
    const invoiceNum = invoiceData.invoiceNumber || 'Invoice';
    return `${invoiceNum} - ${invoiceData.customerName}`;
  }

  /**
   * Validates invoice payload and normalizes data
   * Used by server endpoints before calling postInvoiceTransaction
   */
  static validateInvoicePayload(requestBody) {
    const errors = [];
    
    if (!requestBody.customerName || typeof requestBody.customerName !== 'string') {
      errors.push('customerName is required and must be a string');
    }
    if (!requestBody.amount || isNaN(parseFloat(requestBody.amount)) || parseFloat(requestBody.amount) <= 0) {
      errors.push('amount is required and must be a positive number');
    }
    if (!requestBody.date) {
      errors.push('date is required');
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (requestBody.date && !dateRegex.test(requestBody.date)) {
      errors.push('date must be in YYYY-MM-DD format');
    }
    const validPaymentStatuses = ['paid', 'invoice', 'overpaid', 'partial'];
    const paymentStatus = requestBody.paymentStatus || 'invoice';
    if (!validPaymentStatuses.includes(paymentStatus)) {
      errors.push(`paymentStatus must be one of: ${validPaymentStatuses.join(', ')}`);
    }
    
    if (errors.length > 0) {
      return { isValid: false, errors };
    }
    
    const totalAmount = parseFloat(requestBody.amount);
    const amountPaid = (requestBody.amountPaid === undefined || requestBody.amountPaid === null)
      ? 0
      : parseFloat(requestBody.amountPaid);
    const balanceDue = parseFloat(
      (requestBody.balanceDue !== undefined && requestBody.balanceDue !== null)
        ? requestBody.balanceDue
        : (totalAmount - amountPaid)
    );
    
    let lineItems = [];
    if (requestBody.lineItems && Array.isArray(requestBody.lineItems)) {
      if (requestBody.lineItems.length === 0) {
        errors.push('lineItems array cannot be empty if provided');
      } else {
        lineItems = requestBody.lineItems.map((item, index) => ({
          description: item.description || `Line Item ${index + 1}`,
          amount: parseFloat(item.amount || 0).toFixed(2),
          quantity: parseInt(item.quantity || 1),
          rate: parseFloat(item.rate || item.amount || 0).toFixed(2),
          category: item.category || 'PROFESSIONAL_SERVICES'
        }));
      }
    }
    if (errors.length > 0) return { isValid: false, errors };
    
    let taxSettings = { enabled: false };
    if (requestBody.taxSettings && requestBody.taxSettings.enabled) {
      taxSettings = {
        enabled: true,
        name: requestBody.taxSettings.name || 'Sales Tax',
        type: requestBody.taxSettings.type || 'percentage',
        rate: parseFloat(requestBody.taxSettings.rate || 0),
        amount: parseFloat(requestBody.taxSettings.amount || 0),
        taxExempt: requestBody.taxSettings.taxExempt || false
      };
    }
    let discount = { enabled: false };
    if (requestBody.discount && requestBody.discount.enabled) {
      discount = {
        enabled: true,
        description: requestBody.discount.description || 'Discount',
        type: requestBody.discount.type || 'fixed',
        value: parseFloat(requestBody.discount.value || 0),
        amount: parseFloat(requestBody.discount.amount || 0)
      };
    }
    const subtotal = parseFloat(requestBody.subtotal || requestBody.amount || 0);
    
    // Compute due date: manual dueDate wins; else use dueDays relative to invoice date (default Net-0)
    let computedDueDate = requestBody.dueDate || null
    if (!computedDueDate) {
      try {
        const base = requestBody.date
        if (base) {
          const d = new Date(base)
          if (!isNaN(d.getTime())) {
            let dd = parseInt(String(requestBody.dueDays ?? '0'), 10)
            if (!Number.isFinite(dd)) dd = 0
            if (dd < 0) dd = 0
            if (dd > 365) dd = 365
            d.setDate(d.getDate() + dd)
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const da = String(d.getDate()).padStart(2, '0')
            computedDueDate = `${y}-${m}-${da}`
          }
        }
      } catch {}
    }

    const normalizedData = {
      customerName: requestBody.customerName.trim(),
      amount: totalAmount.toFixed(2),
      subtotal: subtotal.toFixed(2),
      amountPaid: amountPaid.toFixed(2),
      balanceDue: balanceDue.toFixed(2),
      date: requestBody.date,
      categoryKey: requestBody.categoryKey || requestBody.category || 'OFFICE_SUPPLIES',
      paymentStatus: paymentStatus,
      description: requestBody.description || requestBody.notes || `Invoice from ${requestBody.customerName}`,
      invoiceNumber: requestBody.invoiceNumber || null,
      dueDate: computedDueDate || null,
      dueDays: (requestBody.dueDays != null ? Math.max(0, Math.min(365, parseInt(String(requestBody.dueDays), 10) || 0)) : null),
      reference: requestBody.reference || null,
      lineItems: lineItems,
      taxSettings: taxSettings,
      discount: discount
    };
    
    return { isValid: true, errors: [], normalizedData };
  }

  /**
   * Post asset depreciation: DR Depreciation Expense (default 6120) CR Accumulated Depreciation (default 1590)
   * Uses idempotent Transaction.reference provided by caller (e.g., asset:{assetId}:YYYY-MM)
   */
  static async postAssetDepreciation(data) {
    const amount = Math.max(0, Number(data?.amount || 0))
    if (amount === 0) return { ok: true, transactionId: null }

    const reference = String(data?.reference || '').trim()
    if (!reference) throw new Error('reference required for asset depreciation')

    // Idempotency check
    const existing = await prisma.transaction.findFirst({ where: { reference } })
    if (existing) {
      return { ok: true, transactionId: existing.id, idempotent: true }
    }

    const expenseCode = String(data?.expenseAccountCode || '6120')
    const accumCode = String(data?.accumulatedAccountCode || '1590')
    const accounts = await this.getAccountsByCode([expenseCode, accumCode])

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          date: data?.date ? new Date(data.date) : new Date(),
          description: data?.description || 'Asset Depreciation',
          reference,
          amount,
          customFields: {
            type: 'asset_depreciation',
            assetId: data?.assetId || null,
            source: 'PostingService',
          }
        }
      })

      const entries = []
      const dr = await tx.transactionEntry.create({ data: { transactionId: transaction.id, debitAccountId: accounts.debit?.id, creditAccountId: null, amount, description: 'Depreciation Expense' } })
      entries.push(dr)
      const cr = await tx.transactionEntry.create({ data: { transactionId: transaction.id, debitAccountId: null, creditAccountId: accounts.credit?.id, amount, description: 'Accumulated Depreciation' } })
      entries.push(cr)

      this.validateDoubleEntryBalance(entries)

      return { ok: true, transactionId: transaction.id }
    })

    return result
  }
}

export { PostingService };


