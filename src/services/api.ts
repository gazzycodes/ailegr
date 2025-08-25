import axios from 'axios'
import supabase from './supabaseClient'
import { getActiveTenantId } from './tenantStore'
import { getToken } from './authToken'

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000'

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' }
})

// Attach auth & tenant headers on every request
api.interceptors.request.use(async (config) => {
  try {
    const token = await getToken()
    if (token) {
      config.headers = config.headers || {}
      ;(config.headers as any)['Authorization'] = `Bearer ${token}`
    } else {
      // Ensure we do not send an Authorization header at all when logged out
      if (config.headers && 'Authorization' in (config.headers as any)) {
        delete (config.headers as any)['Authorization']
      }
    }
  } catch {}
  try {
    const tenantId = getActiveTenantId()
    if (tenantId) {
      config.headers = config.headers || {}
      ;(config.headers as any)['X-Tenant-Id'] = tenantId
    }
  } catch {}
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    try {
      const status = error?.response?.status
      const original: any = error?.config || {}
      if (status === 401 && !original.__isRetry) {
        const token = await getToken()
        if (token) {
          original.__isRetry = true
          original.headers = original.headers || {}
          original.headers['Authorization'] = `Bearer ${token}`
          // Preserve tenant header
          const tenantId = getActiveTenantId()
          if (tenantId) original.headers['X-Tenant-Id'] = tenantId
          return api.request(original)
        }
      }
    } catch {}
    const message = error?.response?.data?.message || error?.response?.data?.error || error.message
    try {
      // Emit a structured client-side log for observability
      const payload = {
        level: 'error',
        ts: new Date().toISOString(),
        url: (error?.config?.url || ''),
        method: (error?.config?.method || '').toUpperCase(),
        status: error?.response?.status || 0,
        code: error?.response?.data?.code || undefined,
        message
      }
      // Console for dev; window event for UI banner
      if (typeof window !== 'undefined') {
        try { window.dispatchEvent(new CustomEvent('api:error', { detail: payload })) } catch {}
      }
      if (import.meta && (import.meta as any).env?.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[api:error]', payload)
      }
    } catch {}
    return Promise.reject(new Error(message))
  }
)

export default api


