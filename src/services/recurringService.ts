import api from './api'

export type RecurringRule = {
  id: string
  type: 'EXPENSE' | 'INVOICE'
  cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUAL'
  startDate: string
  endDate?: string
  dayOfMonth?: number
  weekday?: number
  nextRunAt: string
  lastRunAt?: string
  isActive: boolean
  payload: any
}

export async function listRecurring(): Promise<RecurringRule[]> {
  const { data } = await api.get('/api/recurring')
  return data?.rules || []
}

export async function createRecurring(rule: Partial<RecurringRule>): Promise<RecurringRule> {
  const { data } = await api.post('/api/recurring', rule)
  return data?.rule
}

export async function updateRecurring(id: string, changes: Partial<RecurringRule>): Promise<RecurringRule> {
  const { data } = await api.put(`/api/recurring/${id}`, changes)
  return data?.rule
}

export async function pauseRecurring(id: string) {
  const { data } = await api.post(`/api/recurring/${id}/pause`, {})
  return data
}

export async function resumeRecurring(id: string) {
  const { data } = await api.post(`/api/recurring/${id}/resume`, {})
  return data
}

export async function runRecurringNow() {
  const { data } = await api.post('/api/recurring/run', {})
  return data
}

export async function simulateNextRun(ruleId?: string) {
  const body: any = { dryRun: true }
  if (ruleId) body.ruleId = ruleId
  const { data } = await api.post('/api/recurring/run', body)
  return data
}

export async function forceRunRule(ruleId: string) {
  // Posts one occurrence for the specified rule immediately, even if not due
  const { data } = await api.post('/api/recurring/run', { ruleId })
  return data
}

export async function getOccurrences(ruleId: string, count: number = 3): Promise<string[]> {
  const { data } = await api.get(`/api/recurring/${ruleId}/occurrences`, { params: { count } })
  return Array.isArray(data?.occurrences) ? data.occurrences : []
}

export default { listRecurring, createRecurring, updateRecurring, pauseRecurring, resumeRecurring, runRecurringNow, simulateNextRun, getOccurrences, forceRunRule }


