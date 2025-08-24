import { useEffect, useState } from 'react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { getUserMemberships } from '../../services/membershipService'
import TenantMembers from './TenantMembers'
import { seedCoa } from '../../services/setupService'
import SetupService from '../../services/setupService'
import api from '../../services/api'

export default function AdminPanel({ onBack }: { onBack?: () => void }) {
  const [role, setRole] = useState<'OWNER'|'ADMIN'|'MEMBER'|'UNKNOWN'>('UNKNOWN')
  const [aiUsage, setAiUsage] = useState<any>(null)
  const [health, setHealth] = useState<any>(null)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const ms = await getUserMemberships()
        const current = Array.isArray(ms) && ms.length > 0 ? ms[0] : null
        if (mounted && current?.role) setRole(current.role as any)
      } catch {}
      try { setAiUsage((await api.get('/api/ai/usage')).data) } catch {}
      try { setHealth((await api.get('/api/health')).data) } catch {}
    })()
    return () => { mounted = false }
  }, [])

  const canAdmin = role === 'OWNER' || role === 'ADMIN'
  if (!canAdmin) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <ThemedGlassSurface variant="light" className="p-6">
          <div className="text-lg font-semibold mb-2">Admin</div>
          <div className="text-sm text-secondary-contrast">You do not have permission to view this page.</div>
          {onBack && <button className="mt-4 px-3 py-2 rounded bg-primary/20 text-primary border border-primary/30" onClick={onBack}>Back</button>}
        </ThemedGlassSurface>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-2xl font-bold">Admin Panel</div>
        {onBack && <button className="px-3 py-2 rounded bg-primary/20 text-primary border border-primary/30" onClick={onBack}>Back</button>}
      </div>

      {/* Members */}
      <ThemedGlassSurface variant="light" className="p-4">
        <div className="mb-2">
          <div className="text-lg font-semibold">Members</div>
          <div className="text-sm text-secondary-contrast">Manage team roles for this tenant.</div>
        </div>
        <TenantMembers />
      </ThemedGlassSurface>

      {/* Tenant Settings */}
      <ThemedGlassSurface variant="light" className="p-4">
        <div className="mb-2">
          <div className="text-lg font-semibold">Tenant Settings</div>
          <div className="text-sm text-secondary-contrast">Seed/ensure chart of accounts and sample data.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="px-3 py-2 rounded bg-primary/20 text-primary border border-primary/30" onClick={()=>SetupService.ensureCoreAccounts()}>Ensure Core Accounts</button>
          <button className="px-3 py-2 rounded bg-primary/20 text-primary border border-primary/30" onClick={()=>seedCoa('us-gaap')}>Seed Full COA (US‑GAAP)</button>
        </div>
      </ThemedGlassSurface>

      {/* Usage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ThemedGlassSurface variant="light" className="p-4">
          <div className="text-lg font-semibold">AI Usage</div>
          <pre className="mt-2 text-xs whitespace-pre-wrap">{JSON.stringify(aiUsage, null, 2)}</pre>
        </ThemedGlassSurface>
        <ThemedGlassSurface variant="light" className="p-4">
          <div className="text-lg font-semibold">Server Health</div>
          <pre className="mt-2 text-xs whitespace-pre-wrap">{JSON.stringify(health, null, 2)}</pre>
        </ThemedGlassSurface>
      </div>
    </div>
  )
}


