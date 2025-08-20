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

export default { ensureCoreAccounts, addInitialCapital, addSampleRevenue }


