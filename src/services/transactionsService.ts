import api from './api'

export type PostRevenuePayload = {
  customer: string
  amount: number | string
  date: string
  description: string
  revenueAccount?: string
  cashAccount?: string
  paymentMethod?: string
  invoiceNumber?: string
  reference?: string
}

export async function postRevenue(payload: PostRevenuePayload) {
  const body = {
    customer: payload.customer,
    amount: typeof payload.amount === 'string' ? parseFloat(payload.amount) : payload.amount,
    date: payload.date,
    description: payload.description,
    revenueAccount: payload.revenueAccount || '4020',
    cashAccount: payload.cashAccount || '1010',
    paymentMethod: payload.paymentMethod || 'CASH',
    invoiceNumber: payload.invoiceNumber,
    reference: payload.reference
  }
  const { data } = await api.post('/api/transactions/revenue', body)
  return data
}

export type PostInvoicePayload = {
  customerName: string
  amount: number | string
  date: string
  description?: string
  invoiceNumber?: string
  paymentStatus?: 'paid' | 'invoice' | 'partial' | 'overpaid'
  amountPaid?: number | string
  balanceDue?: number | string
}

export async function postInvoice(payload: PostInvoicePayload) {
  const body = {
    customerName: payload.customerName,
    amount: typeof payload.amount === 'string' ? parseFloat(payload.amount) : payload.amount,
    date: payload.date,
    description: payload.description || `Invoice for ${payload.customerName}`,
    paymentStatus: payload.paymentStatus || 'paid',
    invoiceNumber: payload.invoiceNumber,
    // Optional fields to help server determine paid/partial/overpaid accurately
    amountPaid: payload.amountPaid != null
      ? (typeof payload.amountPaid === 'string' ? parseFloat(payload.amountPaid) : payload.amountPaid)
      : undefined,
    balanceDue: payload.balanceDue != null
      ? (typeof payload.balanceDue === 'string' ? parseFloat(payload.balanceDue) : payload.balanceDue)
      : undefined
  }
  const { data } = await api.post('/api/invoices', body)
  return data
}

export async function previewRevenue(payload: { customerName?: string; customer?: string; amount: number | string; date: string; description?: string; paymentStatus?: 'paid' | 'invoice' | 'partial' | 'overpaid'; amountPaid?: number | string; balanceDue?: number | string; categoryKey?: string }) {
  const amountNum = typeof payload.amount === 'string' ? parseFloat(payload.amount) : payload.amount
  const amountPaidNum = payload.amountPaid != null ? (typeof payload.amountPaid === 'string' ? parseFloat(payload.amountPaid) : payload.amountPaid) : amountNum
  const body = {
    customerName: (payload.customerName || payload.customer || '').trim(),
    amount: amountNum,
    amountPaid: amountPaidNum,
    balanceDue: payload.balanceDue != null ? (typeof payload.balanceDue === 'string' ? parseFloat(payload.balanceDue) : payload.balanceDue) : Math.max(0, amountNum - amountPaidNum),
    date: payload.date,
    description: payload.description || `Revenue from ${(payload.customerName || payload.customer || 'Customer').trim()}`,
    paymentStatus: payload.paymentStatus || 'paid',
    // Optional: allow category mapping to different revenue accounts if provided
    categoryKey: payload.categoryKey || 'PROFESSIONAL_SERVICES'
  }
  const { data } = await api.post('/api/posting/preview', body)
  return data
}

export async function listInvoices() {
  const { data } = await api.get('/api/invoices')
  return Array.isArray(data) ? data : []
}

export async function suggestInvoiceNumber() {
  const { data } = await api.get('/api/invoices/suggest-number')
  return data?.suggestion as string
}

export async function nextSequentialInvoiceNumber() {
  const { data } = await api.get('/api/invoices/next-seq')
  return data?.suggestion as string
}

export async function markInvoicePaid(id: string) {
  const { data } = await api.post(`/api/invoices/${id}/mark-paid`, {})
  return data
}

export async function markInvoiceUnpaid(id: string) {
  const { data } = await api.post(`/api/invoices/${id}/mark-unpaid`, {})
  return data
}

export async function recordInvoicePayment(id: string, payload: { amount: number | string; date?: string }) {
  const body = { amount: typeof payload.amount === 'string' ? parseFloat(payload.amount) : payload.amount, date: payload.date }
  const { data } = await api.post(`/api/invoices/${id}/record-payment`, body)
  return data
}

export async function listInvoicePayments(id: string) {
  const { data } = await api.get(`/api/invoices/${id}/payments`)
  return data?.payments || []
}

export async function voidPayment(paymentTransactionId: string) {
  const { data } = await api.post(`/api/payments/${paymentTransactionId}/void`, {})
  return data
}

export const TransactionsService = { postRevenue, postInvoice, previewRevenue, postCapital, listInvoices, markInvoicePaid, markInvoiceUnpaid, recordInvoicePayment, listInvoicePayments, voidPayment, suggestInvoiceNumber, nextSequentialInvoiceNumber }
export async function postCapital(payload: { contributor: string; amount: number | string; date: string; description: string; reference?: string }) {
  const body = {
    contributor: payload.contributor,
    amount: typeof payload.amount === 'string' ? parseFloat(payload.amount) : payload.amount,
    date: payload.date,
    description: payload.description,
    reference: payload.reference
  }
  const { data } = await api.post('/api/transactions/capital', body)
  return data
}

export default { postRevenue, postInvoice, previewRevenue, postCapital, listInvoices, markInvoicePaid, markInvoiceUnpaid, recordInvoicePayment, listInvoicePayments, voidPayment }


