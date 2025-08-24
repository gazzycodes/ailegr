import api from './api'

export type Member = { userId: string; role: 'OWNER'|'ADMIN'|'MEMBER' }

export async function getUserMemberships(): Promise<Array<{ tenantId: string; role: Member['role']; tenantName?: string }>> {
  const { data } = await api.get('/api/memberships')
  return Array.isArray(data?.memberships) ? data.memberships : []
}

export async function listMembers(): Promise<Member[]> {
  const { data } = await api.get('/api/members')
  return Array.isArray(data?.members) ? data.members : []
}

export async function addMember(userId: string, role: Member['role'] = 'MEMBER'): Promise<Member> {
  const { data } = await api.post('/api/members', { userId, role })
  return data?.member
}

export async function updateMemberRole(userId: string, role: Member['role']): Promise<Member> {
  const { data } = await api.put(`/api/members/${encodeURIComponent(userId)}`, { role })
  return data?.member
}

export async function removeMember(userId: string): Promise<{ ok: boolean }> {
  const { data } = await api.delete(`/api/members/${encodeURIComponent(userId)}`)
  return { ok: !!data?.ok }
}

export default { listMembers, addMember, updateMemberRole, removeMember, getUserMemberships }


