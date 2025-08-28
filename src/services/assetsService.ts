import api from './api'

export async function createAsset(payload: any) {
  const { data } = await api.post('/api/assets', payload)
  return data
}

export async function listAssets(params?: { vendor?: string }) {
  const { data } = await api.get('/api/assets', { params })
  return Array.isArray(data?.assets) ? data.assets : []
}

export async function runDepreciation(limit?: number) {
  const { data } = await api.post('/api/assets/run-depreciation', limit ? { limit } : {})
  return data
}

export async function listCategories() {
  const { data } = await api.get('/api/asset-categories')
  return Array.isArray(data?.categories) ? data.categories : []
}

export async function createCategory(payload: any) {
  const { data } = await api.post('/api/asset-categories', payload)
  return data?.category
}

export async function getAssetEvents(id: string) {
  const { data } = await api.get(`/api/assets/${encodeURIComponent(id)}/events`)
  return Array.isArray(data?.events) ? data.events : []
}

export async function getAssetMetrics() {
  const { data } = await api.get('/api/assets/metrics')
  return data || {}
}

export async function linkExpenseToAsset(expenseId: string, assetId: string) {
  const { data } = await api.post(`/api/expenses/${encodeURIComponent(expenseId)}/link-asset`, { assetId })
  return data
}

export async function disposeAsset(id: string) {
  const { data } = await api.post(`/api/assets/${encodeURIComponent(id)}/dispose`, {})
  return data
}

export default { createAsset, listAssets, runDepreciation, listCategories, createCategory, getAssetEvents, getAssetMetrics, linkExpenseToAsset, disposeAsset }
