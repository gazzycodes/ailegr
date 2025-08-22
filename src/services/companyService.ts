import api from './api'

export type CompanyProfileDTO = {
  legalName: string
  aliases: string[]
  email?: string
  addressLines: string[]
  city?: string
  state?: string
  zipCode?: string
  country?: string
}

export async function getCompanyProfile(): Promise<CompanyProfileDTO> {
  try {
    const { data } = await api.get('/api/company-profile')
    const profile: CompanyProfileDTO = {
      legalName: data?.legalName || '',
      aliases: Array.isArray(data?.aliases) ? data.aliases : [],
      email: data?.email || '',
      addressLines: Array.isArray(data?.addressLines) ? data.addressLines : [],
      city: data?.city || '',
      state: data?.state || '',
      zipCode: data?.zipCode || '',
      country: data?.country || 'US'
    }
    return profile
  } catch (e) {
    // Graceful fallback (e.g., server not yet restarted with new route)
    return { legalName: '', aliases: [], email: '', addressLines: [], city: '', state: '', zipCode: '', country: 'US' }
  }
}

export async function saveCompanyProfile(payload: CompanyProfileDTO): Promise<{ ok: boolean }> {
  const normalizeAliases = Array.isArray(payload.aliases) ? payload.aliases.map(a => a?.toString().trim()).filter(Boolean) : []
  const { data } = await api.put('/api/company-profile', { ...payload, aliases: normalizeAliases })
  return { ok: !!data?.ok }
}

export default { getCompanyProfile, saveCompanyProfile }

