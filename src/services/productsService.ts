import api from './api'

export type Product = {
  id: string
  tenantId?: string
  sku?: string | null
  barcode?: string | null
  name: string
  description?: string | null
  type: 'service' | 'inventory'
  unit?: string | null
  price?: number | null
  cost?: number | null
  taxCode?: string | null
  incomeAccountCode?: string | null
  expenseAccountCode?: string | null
  cogsAccountCode?: string | null
  inventoryAccountCode?: string | null
  preferredVendor?: string | null
  active?: boolean
  tags?: any
  favorite?: boolean
}

export type ListProductsParams = {
  search?: string
  type?: 'service' | 'inventory'
  active?: boolean
}

async function listProducts(params?: ListProductsParams): Promise<Product[]> {
  const { data } = await api.get('/api/products', { params })
  const arr = Array.isArray(data?.products) ? data.products : []
  return arr as Product[]
}

async function createProduct(payload: Partial<Product>): Promise<Product> {
  const { data } = await api.post('/api/products', payload)
  return data?.product as Product
}

async function updateProduct(id: string, payload: Partial<Product>): Promise<Product> {
  const { data } = await api.put(`/api/products/${encodeURIComponent(id)}`, payload)
  return data?.product as Product
}

export default {
  listProducts,
  createProduct,
  updateProduct,
}


