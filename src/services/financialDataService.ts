import api from './api'
import ReportsService from './reportsService'
import { listCustomers, createCustomer, updateCustomer } from './customersService'
import { postExpense } from './expensesService'
import { postInvoice } from './transactionsService'
import { ensureCoreAccounts, addInitialCapital, addSampleRevenue } from './setupService'

/**
 * FinancialDataService
 * A consolidated client service exposing a single, typed API surface for the app.
 *
 * This mirrors the baseline app's FinancialDataService while delegating to our
 * existing modular services under `frontend-rebuild/src/services`.
 */
export class FinancialDataService {
	// ---------- Dashboard / Health ----------
	static async getDashboardData(): Promise<any> {
		const { data } = await api.get('/api/dashboard')
		return data
	}

	static async getAiUsage(): Promise<any> {
		const { data } = await api.get('/api/ai/usage')
		return data
	}

	static async getHealthCheck(): Promise<any> {
		const { data } = await api.get('/api/health')
		return data
	}

	// ---------- Reports ----------
	static async getPnlData(asOf?: string, opts?: { period?: 'Monthly'|'Quarterly'|'YTD'|'Annual'; compare?: boolean }): Promise<any> {
		return ReportsService.getPnl(asOf, opts)
	}

	static async getBalanceSheetData(asOf?: string): Promise<any> {
		return ReportsService.getBalanceSheet(asOf)
	}

	static async getTrialBalanceData(asOf?: string): Promise<any> {
		return ReportsService.getTrialBalance(asOf)
	}

	static async getChartOfAccountsData(): Promise<any> {
		return ReportsService.getChartOfAccounts()
	}

	static async getAccountTransactions(accountCode: string, limit = 100): Promise<any> {
		return ReportsService.getAccountTransactions(accountCode, limit)
	}

	// ---------- Posting (Expenses / Invoices) ----------
	/**
 	 * addExpenseTransaction
 	 * Accepts a friendly payload and transforms to server format.
 	 */
	static async addExpenseTransaction(payload: {
 		vendor: string
 		category: string
 		date: string
 		amount: number
 		description: string
 		receiptUrl?: string
 		customFields?: any[]
 		paymentStatus?: 'paid' | 'invoice' | 'overpaid' | 'partial'
 		amountPaid?: number
 		balanceDue?: number
 		overdue?: boolean
 		recurring?: boolean
 		invoiceNumber?: string
 		dueDate?: string
 	}): Promise<any> {
 		// Transform to PostingEngine format expected by server
 		const body = {
 			date: payload.date,
 			amount: payload.amount.toFixed(2),
 			paymentStatus: payload.paymentStatus === 'invoice' ? 'unpaid'
 				: payload.paymentStatus === 'partial' ? 'partial'
 				: payload.paymentStatus === 'overpaid' ? 'overpaid'
 				: 'paid',
 			categoryKey: payload.category.toUpperCase(),
 			vendorName: payload.vendor,
 			reference: `AI-EXP-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
 			notes: payload.description,
 			receiptUrl: payload.receiptUrl,
 			amountPaid: typeof payload.amountPaid === 'number' ? payload.amountPaid.toFixed(2) : undefined,
 			balanceDue: typeof payload.balanceDue === 'number' ? payload.balanceDue.toFixed(2) : undefined,
 			overdue: payload.overdue ?? undefined,
 			recurring: payload.recurring ?? undefined,
 			invoiceNumber: payload.invoiceNumber ?? undefined,
 			dueDate: payload.dueDate ?? undefined
 		}
 		return postExpense(body)
 	}

	/**
 	 * addInvoiceTransaction
 	 * Accepts unified invoice payload and posts to server.
 	 */
	static async addInvoiceTransaction(payload: {
 		customerName: string
 		amount: number
 		date: string
 		description: string
 		invoiceNumber?: string
 		paymentStatus?: 'paid' | 'invoice' | 'partial' | 'overpaid'
 		amountPaid?: number
 		balanceDue?: number
 		category?: string
 		lineItems?: Array<{ description: string; amount: number; quantity: number; rate: number; category: string }>
 		taxSettings?: { enabled: boolean; name?: string; type?: string; rate?: number; amount?: number; taxExempt?: boolean }
 		discount?: { enabled: boolean; description?: string; type?: string; value?: number; amount?: number }
 	}): Promise<any> {
 		const body = {
 			customerName: payload.customerName,
 			amount: payload.amount,
 			date: payload.date,
 			description: payload.description,
 			invoiceNumber: payload.invoiceNumber,
 			paymentStatus: payload.paymentStatus || 'paid',
 			amountPaid: payload.amountPaid ?? payload.amount,
 			balanceDue: payload.balanceDue ?? 0,
 			categoryKey: (payload.category || 'PROFESSIONAL_SERVICES').toUpperCase(),
 			lineItems: payload.lineItems || [],
 			taxSettings: payload.taxSettings || { enabled: false },
 			discount: payload.discount || { enabled: false }
 		}
 		return postInvoice(body as any)
 	}

	// ---------- Customers ----------
	static async getCustomers(query?: string): Promise<any[]> {
 		return listCustomers(query)
 	}

	static async addCustomer(payload: {
 		name: string
 		email: string
 		company?: string
 		phone?: string
 		address?: string
 		city?: string
 		state?: string
 		zipCode?: string
 		notes?: string
 	}): Promise<any> {
 		return createCustomer(payload)
 	}

	static async updateCustomer(id: string, payload: {
 		name: string
 		email: string
 		company?: string
 		phone?: string
 		address?: string
 		city?: string
 		state?: string
 		zipCode?: string
 		country?: string
 		notes?: string
 		isActive?: boolean
 	}): Promise<any> {
 		return updateCustomer(id, payload)
 	}

	// ---------- Setup helpers (optional, used once) ----------
	static async ensureCoreAccounts(): Promise<any> {
 		return ensureCoreAccounts()
 	}

	static async seedInitialCapital(amount = 10000, reference?: string): Promise<any> {
 		return addInitialCapital(amount, reference)
 	}

	static async seedSampleRevenue(amount = 5000, reference?: string): Promise<any> {
 		return addSampleRevenue(amount, reference)
 	}
}

export default FinancialDataService


