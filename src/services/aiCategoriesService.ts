import api from './api'

export async function getPending() {
  const { data } = await api.get('/api/categories/pending')
  return Array.isArray(data?.pending) ? data.pending : []
}

export async function approveCategory(id: string, modifications?: { name?: string; key?: string; accountCode?: string; description?: string }) {
  const { data } = await api.post(`/api/categories/pending/${id}/approve`, modifications || {})
  return data?.category
}

export async function rejectCategory(id: string, existingCategoryId: string) {
  const { data } = await api.post(`/api/categories/pending/${id}/reject`, { existingCategoryId })
  return data
}

export default { getPending, approveCategory, rejectCategory }

export async function listCategories(query?: string) {
  const { data } = await api.get('/api/categories', { params: query ? { query } : {} })
  return Array.isArray(data?.categories) ? data.categories : []
}

export async function createCategory(payload: { name: string; key: string; accountCode: string; description?: string }) {
  const { data } = await api.post('/api/categories', payload)
  return data?.category
}

export async function updateCategory(id: string, payload: { name?: string; key?: string; accountCode?: string; description?: string; isApproved?: boolean }) {
  const { data } = await api.put(`/api/categories/${id}`, payload)
  return data?.category
}

export async function deleteCategory(id: string) {
  const { data } = await api.delete(`/api/categories/${id}`)
  return data
}

export async function suggestCategory(description?: string, vendorName?: string) {
  const { data } = await api.post('/api/categories/ai/suggest', { description, vendorName })
  return data?.result
}


