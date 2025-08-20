import api from './api'

export async function searchCustomers(query: string) {
  const { data } = await api.get('/api/customers', { params: { query } })
  return data
}

export async function listCustomers(query?: string) {
  const { data } = await api.get('/api/customers', { params: query ? { query } : {} })
  return Array.isArray(data?.customers) ? data.customers : []
}

export async function createCustomer(payload: {
  name: string
  email: string
  company?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  notes?: string
}) {
  const { data } = await api.post('/api/customers', payload)
  return data?.customer
}

export async function updateCustomer(id: string, payload: {
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
}) {
  const { data } = await api.put(`/api/customers/${id}`, payload)
  return data?.customer
}

export const CustomersService = { searchCustomers, listCustomers, createCustomer, updateCustomer }

export default { searchCustomers, listCustomers, createCustomer, updateCustomer }


