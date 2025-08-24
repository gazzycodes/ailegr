import api from './api'

export async function uploadOcr(file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/api/ocr', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 })
  return data as { text?: string }
}

export async function previewExpense(payload: any) {
  const { data } = await api.post('/api/posting/preview', payload)
  return data
}

export async function postExpense(payload: any) {
  const { data } = await api.post('/api/expenses', payload)
  return data
}

export async function attachReceipt(expenseId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post(`/api/expenses/${encodeURIComponent(expenseId)}/receipt`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
  return data
}

export async function listExpenses() {
  const { data } = await api.get('/api/expenses')
  return Array.isArray(data) ? data : []
}

export async function checkDuplicate(vendor: string, vendorInvoiceNo: string) {
  const params = new URLSearchParams()
  if (vendor) params.set('vendor', vendor)
  if (vendorInvoiceNo) params.set('vendorInvoiceNo', vendorInvoiceNo)
  const { data } = await api.get(`/api/expenses/check-duplicate?${params.toString()}`)
  return data as { duplicate: boolean; expense?: any }
}

export async function markExpensePaid(id: string) {
  const { data } = await api.post(`/api/expenses/${encodeURIComponent(id)}/mark-paid`, {})
  return data
}

export async function recordExpensePayment(id: string, payload: { amount: number | string; date?: string }) {
  const body = { amount: typeof payload.amount === 'string' ? parseFloat(payload.amount) : payload.amount, date: payload.date }
  const { data } = await api.post(`/api/expenses/${encodeURIComponent(id)}/record-payment`, body)
  return data
}

export async function markExpenseUnpaid(id: string) {
  const { data } = await api.post(`/api/expenses/${encodeURIComponent(id)}/mark-unpaid`, {})
  return data
}

export default { uploadOcr, previewExpense, postExpense, attachReceipt, listExpenses, checkDuplicate, markExpensePaid, markExpenseUnpaid, recordExpensePayment, listExpensePayments, voidPayment }

export async function listExpensePayments(id: string) {
  const { data } = await api.get(`/api/expenses/${encodeURIComponent(id)}/payments`)
  return data?.payments || []
}

export async function voidPayment(paymentTransactionId: string) {
  const { data } = await api.post(`/api/payments/${encodeURIComponent(paymentTransactionId)}/void`, {})
  return data
}


