import { useState } from 'react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import SetupService from '../../services/setupService'
import AICategories from './ai/AICategories'
import supabase from '../../services/supabaseClient'
import { useState as useReactState } from 'react'

export default function Settings() {
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [pwLoading, setPwLoading] = useReactState(false)
  const [newPw, setNewPw] = useReactState('')
  const [confirmPw, setConfirmPw] = useReactState('')

  const run = async (key: string, fn: () => Promise<any>) => {
    try {
      setBusy(key)
      setResult(null)
      const res = await fn()
      const msg = typeof res?.message === 'string' ? res.message : 'Done'
      setResult(msg)
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'success' } })) } catch {}
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Operation failed'
      setResult(msg)
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch {}
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <div className="text-xl font-semibold">Setup Helpers</div>
          <div className="text-sm text-secondary-contrast">Quick actions for local development</div>
        </div>

        <ThemedGlassSurface variant="light" className="p-4">
          <div className="space-y-3">
            <button
              disabled={busy === 'accounts'}
              className="px-3 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-60"
              onClick={() => run('accounts', () => SetupService.ensureCoreAccounts())}
            >
              {busy === 'accounts' ? 'Ensuring accounts…' : 'Ensure Core Accounts'}
            </button>

            <div className="flex items-center gap-2">
              <button
                disabled={busy === 'capital'}
                className="px-3 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-60"
                onClick={() => run('capital', () => SetupService.addInitialCapital(10000))}
              >
                {busy === 'capital' ? 'Posting capital…' : 'Add Initial Capital ($10,000)'}
              </button>
              <button
                disabled={busy === 'revenue'}
                className="px-3 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-60"
                onClick={() => run('revenue', () => SetupService.addSampleRevenue(5000))}
              >
                {busy === 'revenue' ? 'Posting revenue…' : 'Add Sample Revenue ($5,000)'}
              </button>
            </div>

            {result && <div className="text-sm text-secondary-contrast">{result}</div>}
          </div>
        </ThemedGlassSurface>

        {/* Account Security */}
        <ThemedGlassSurface variant="light" className="p-4">
          <div className="mb-3">
            <div className="text-lg font-semibold">Account Security</div>
            <div className="text-sm text-secondary-contrast">Update your password.</div>
          </div>
          <div className="grid gap-3 max-w-md">
            <label className="block text-sm">
              <span className="text-secondary-contrast">New password</span>
              <input
                type="password"
                value={newPw}
                onChange={(e)=>setNewPw(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 focus:ring-focus"
                placeholder="Enter new password"
              />
            </label>
            <label className="block text-sm">
              <span className="text-secondary-contrast">Confirm password</span>
              <input
                type="password"
                value={confirmPw}
                onChange={(e)=>setConfirmPw(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 focus:ring-focus"
                placeholder="Confirm new password"
              />
            </label>
            <div className="flex gap-2">
              <button
                disabled={pwLoading}
                className="px-3 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-60"
                onClick={async ()=>{
                  if (!newPw || newPw.length < 8) { window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Password must be at least 8 characters', type: 'error' } })); return }
                  if (newPw !== confirmPw) { window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Passwords do not match', type: 'error' } })); return }
                  try {
                    setPwLoading(true)
                    const { error } = await supabase.auth.updateUser({ password: newPw })
                    if (error) throw error
                    setNewPw(''); setConfirmPw('')
                    window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Password updated', type: 'success' } }))
                  } catch (e:any) {
                    window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to update password', type: 'error' } }))
                  } finally { setPwLoading(false) }
                }}
              >
                {pwLoading ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </div>
        </ThemedGlassSurface>

        <ThemedGlassSurface variant="light" className="p-4">
          <div className="mb-3">
            <div className="text-lg font-semibold">AI Categories — Pending Suggestions</div>
            <div className="text-sm text-secondary-contrast">Approve or map suggestions to existing categories.</div>
          </div>
          <AICategories />
        </ThemedGlassSurface>
      </div>
    </div>
  )
}


