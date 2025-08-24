import api from './api'

export async function ensureCoreAccounts() {
  const { data } = await api.post('/api/setup/ensure-core-accounts', {})
  return data
}

export async function addInitialCapital(amount: number = 10000, reference?: string) {
  const { data } = await api.post('/api/setup/initial-capital', { amount, reference })
  return data
}

export async function addSampleRevenue(amount: number = 5000, reference?: string) {
  const { data } = await api.post('/api/setup/sample-revenue', { amount, reference })
  return data
}

export async function bootstrapTenant(params: { tenantName?: string; userId?: string; role?: 'OWNER'|'ADMIN'|'MEMBER' } = {}) {
  const { data } = await api.post('/api/setup/bootstrap-tenant', params)
  return data
}

export async function seedCoa(preset: 'us-gaap' = 'us-gaap', tenantId?: string) {
  const { data } = await api.post(`/api/setup/seed-coa?preset=${preset}`, { tenantId })
  return data
}

export default { ensureCoreAccounts, addInitialCapital, addSampleRevenue, bootstrapTenant, seedCoa }


