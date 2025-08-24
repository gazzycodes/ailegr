import { useEffect, useState } from 'react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import membership from '../../services/membershipService'
import { ThemedGlassSurface as Surface } from '../themed/ThemedGlassSurface'

type Member = { userId: string; email?: string; role: 'OWNER'|'ADMIN'|'MEMBER' }

export default function TenantMembers() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [newUserId, setNewUserId] = useState('')
  const [newRole, setNewRole] = useState<Member['role']>('MEMBER')

  const load = async () => {
    setLoading(true)
    try { setMembers(await membership.listMembers()) } catch (e:any) { window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to load members', type: 'error' } })) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const add = async () => {
    if (!newUserId.trim()) return
    try {
      await membership.addMember(newUserId.trim(), newRole)
      setNewUserId(''); setNewRole('MEMBER'); await load()
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Member added', type: 'success' } }))
    } catch (e:any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to add member', type: 'error' } }))
    }
  }

  const update = async (userId: string, role: Member['role']) => {
    try { await membership.updateMemberRole(userId, role); await load(); window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Role updated', type: 'success' } })) } catch (e:any) { window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to update role', type: 'error' } })) }
  }

  const remove = async (userId: string) => {
    try { await membership.removeMember(userId); await load(); window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Member removed', type: 'success' } })) } catch (e:any) { window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to remove member', type: 'error' } })) }
  }

  return (
    <ThemedGlassSurface variant="light" className="p-4">
      <div className="mb-3">
        <div className="text-lg font-semibold">Tenant Members</div>
        <div className="text-sm text-secondary-contrast">Invite users by ID and manage roles.</div>
      </div>
      <div className="grid gap-3">
        <div className="flex flex-col sm:flex-row gap-2 items-center">
          <input className="flex-1 px-3 py-2 rounded-xl bg-white/10 border border-white/10" placeholder="User ID (email later with Stripe)" value={newUserId} onChange={(e)=>setNewUserId(e.target.value)} />
          <select className="px-2 py-2 rounded-xl bg-white/10 border border-white/10" value={newRole} onChange={(e)=>setNewRole(e.target.value as Member['role'])}>
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
            <option value="OWNER">Owner</option>
          </select>
          <button className="px-3 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30" onClick={add} disabled={loading}>Add</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-secondary-contrast">
                <th className="py-2 pr-2">User</th>
                <th className="py-2 pr-2">Role</th>
                <th className="py-2 pr-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.userId} className="border-t border-white/10">
                  <td className="py-2 pr-2 break-all">
                    <div className="flex flex-col">
                      <span>{m.email || 'unknown@email'}</span>
                      <span className="text-xs text-secondary-contrast/80">{m.userId}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-2">
                    <select className="px-2 py-1 rounded-lg bg-white/10 border border-white/10" value={m.role} onChange={(e)=>update(m.userId, e.target.value as Member['role'])}>
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                      <option value="OWNER">Owner</option>
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <button className="px-2 py-1 rounded bg-white/10 border border-white/10" onClick={()=>remove(m.userId)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ThemedGlassSurface>
  )
}


