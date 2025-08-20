import api from './api'

export async function uploadOcr(file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/api/ocr', form, { headers: { 'Content-Type': 'multipart/form-data' } })
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

export default { uploadOcr, previewExpense, postExpense, attachReceipt, listExpenses }


