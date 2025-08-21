import api from './api'

export type CompanyProfile = {
  id?: string
  workspaceId?: string
  legalName: string
  aliases: string[]
  ein?: string | null
  taxId?: string | null
  addressLines: string[]
  city?: string | null
  state?: string | null
  zipCode?: string | null
  country?: string | null
  normalizedLegalName?: string
  normalizedAliases?: string[]
}

export async function getCompanyProfile(): Promise<CompanyProfile | null> {
  try {
    const { data } = await api.get('/api/company-profile')
    return data || null
  } catch {
    return null
  }
}

export async function updateCompanyProfile(payload: Partial<CompanyProfile>) {
  const body = {
    legalName: payload.legalName,
    aliases: payload.aliases || [],
    ein: payload.ein ?? null,
    taxId: payload.taxId ?? null,
    addressLines: payload.addressLines || [],
    city: payload.city ?? null,
    state: payload.state ?? null,
    zipCode: payload.zipCode ?? null,
    country: payload.country || 'US'
  }
  const { data } = await api.put('/api/company-profile', body)
  return data
}

export default { getCompanyProfile, updateCompanyProfile }

