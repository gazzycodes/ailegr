const KEY = 'AILEGR_ACTIVE_TENANT_ID'

export function getActiveTenantId(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setActiveTenantId(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {}
}


