import { useEffect, useState } from 'react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { ModalPortal } from '../layout/ModalPortal'
import SetupService from '../../services/setupService'
import AICategories from './ai/AICategories'
import supabase from '../../services/supabaseClient'
import { useState as useReactState } from 'react'
import CompanyService, { type CompanyProfileDTO } from '../../services/companyService'
import RecurringManager from './RecurringManager'
import TenantMembers from './TenantMembers'
import { getUserMemberships } from '../../services/membershipService'
import { seedCoa } from '../../services/setupService'

export default function Settings() {
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [pwLoading, setPwLoading] = useReactState(false)
  const [newPw, setNewPw] = useReactState('')
  const [confirmPw, setConfirmPw] = useReactState('')

  // Company profile state
  const [company, setCompany] = useState<CompanyProfileDTO>({ legalName: '', aliases: [], email: '', addressLines: [], city: '', state: '', zipCode: '', country: 'US', timeZone: null, taxRegime: null, taxAccounts: null })
  const [companyLoading, setCompanyLoading] = useState(false)
  const [companySaving, setCompanySaving] = useState(false)
  const [companyOpen, setCompanyOpen] = useState(false)
  const [role, setRole] = useState<'OWNER'|'ADMIN'|'MEMBER'>('MEMBER')
  const [apSplitLines, setApSplitLines] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem('settings.apSplitLines') || 'false') } catch { return false }
  })

  useEffect(() => {
    let mounted = true
    setCompanyLoading(true)
    CompanyService.getCompanyProfile().then((p) => {
      if (mounted) {
        setCompany(p)
        try { setApSplitLines(!!((p as any)?.taxAccounts?.apSplitByLineItems)) } catch {}
      }
    }).finally(() => setCompanyLoading(false))
    ;(async () => {
      try {
        const list = await getUserMemberships()
        const current = Array.isArray(list) && list.length > 0 ? list[0] : null
        if (mounted && current?.role) setRole(current.role as any)
      } catch {}
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    try { localStorage.setItem('settings.apSplitLines', JSON.stringify(apSplitLines)) } catch {}
  }, [apSplitLines])

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
        {/* Company Information trigger */}
        <ThemedGlassSurface variant="light" className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">Company Information</div>
              <div className="text-sm text-secondary-contrast">Used for identity-aware classification.</div>
            </div>
            <button className="px-3 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30" onClick={()=>setCompanyOpen(true)}>Open</button>
          </div>
        </ThemedGlassSurface>

        {companyOpen && (
          <ModalPortal>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center">
              <div className="modal-overlay absolute inset-0" onClick={()=>setCompanyOpen(false)} />
              <div className="relative w-[96%] max-w-2xl" onClick={(e)=>e.stopPropagation()}>
                <ThemedGlassSurface variant="light" className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-lg font-semibold">Company Information</div>
                      <div className="text-sm text-secondary-contrast">Only non‑PII is stored and used.</div>
                    </div>
                    <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={()=>setCompanyOpen(false)}>✕</button>
                  </div>
                  <div className="grid gap-3 text-sm">
            <label className="block">
              <span className="text-secondary-contrast">Legal name</span>
              <input className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 focus:ring-focus" value={company.legalName} onChange={(e)=>setCompany({ ...company, legalName: e.target.value })} placeholder="AILegr Solutions Inc" />
            </label>
            <label className="block">
              <span className="text-secondary-contrast">Aliases (comma separated)</span>
              <input className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 focus:ring-focus" value={company.aliases.join(', ')} onChange={(e)=>setCompany({ ...company, aliases: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) })} placeholder="AILegr, AILegr Inc" />
            </label>
            <label className="block">
              <span className="text-secondary-contrast">Business email</span>
              <input className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 focus:ring-focus" value={company.email || ''} onChange={(e)=>setCompany({ ...company, email: e.target.value })} placeholder="finance@yourcompany.com" />
            </label>
            <label className="block">
              <span className="text-secondary-contrast">Time zone (IANA)</span>
              <input className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 focus:ring-focus" value={company.timeZone || ''} onChange={(e)=>setCompany({ ...company, timeZone: e.target.value })} placeholder="America/New_York" />
              <div className="text-xs text-secondary-contrast mt-1">If set, recurring runs at tenant‑local midnight; otherwise server time is used.</div>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-secondary-contrast">Tax Regime</span>
                <select className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 focus:ring-focus" value={company.taxRegime || ''} onChange={(e)=>setCompany({ ...company, taxRegime: (e.target.value || null) as any })}>
                  <option value="">—</option>
                  <option value="US_SALES_TAX">US Sales Tax (expense)</option>
                  <option value="VAT">VAT/GST (recoverable)</option>
                </select>
              </label>
              <label className="block">
                <span className="text-secondary-contrast">Tax Accounts (JSON)</span>
                <input className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 focus:ring-focus" value={JSON.stringify(company.taxAccounts || {})} onChange={(e)=>{
                  try { const j = JSON.parse(e.target.value || '{}'); setCompany({ ...company, taxAccounts: j }) } catch { /* ignore */ }
                }} placeholder='{"payable":"2150","expense":"6110","receivable":"1360"}' />
                <div className="text-xs text-secondary-contrast mt-1">Override default codes: payable 2150, expense 6110, receivable 1360.</div>
              </label>
            </div>
            <div className="mt-2 p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-sm font-semibold mb-1">Accounting</div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={apSplitLines} onChange={(e)=>setApSplitLines(e.target.checked)} />
                Split AP postings by line items (multi‑account)
              </label>
              <div className="text-xs text-secondary-contrast mt-1">When enabled, AP bills debit per-line expense accounts. Otherwise, a single expense account is used.</div>
            </div>
            <label className="block">
              <span className="text-secondary-contrast">Address line 1</span>
              <input className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 focus:ring-focus" value={company.addressLines[0] || ''} onChange={(e)=>{ const lines = [...company.addressLines]; lines[0] = e.target.value; setCompany({ ...company, addressLines: lines }) }} placeholder="123 Tech Park Drive" />
            </label>
            <label className="block">
              <span className="text-secondary-contrast">Address line 2</span>
              <input className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 focus:ring-focus" value={company.addressLines[1] || ''} onChange={(e)=>{ const lines = [...company.addressLines]; lines[1] = e.target.value; setCompany({ ...company, addressLines: lines }) }} placeholder="Suite 500" />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-secondary-contrast">City</span>
                <input className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 focus:ring-focus" value={company.city || ''} onChange={(e)=>setCompany({ ...company, city: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-secondary-contrast">State</span>
                <input className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 focus:ring-focus" value={company.state || ''} onChange={(e)=>setCompany({ ...company, state: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-secondary-contrast">ZIP</span>
                <input className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 focus:ring-focus" value={company.zipCode || ''} onChange={(e)=>setCompany({ ...company, zipCode: e.target.value })} />
              </label>
            </div>
            <div className="flex gap-2 justify-end">
              <button disabled={companyLoading || companySaving} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 disabled:opacity-60" onClick={async ()=>{
                setCompanyLoading(true)
                try { setCompany(await CompanyService.getCompanyProfile()) } finally { setCompanyLoading(false) }
              }}>{companyLoading ? 'Loading…' : 'Reload'}</button>
              <button disabled={companySaving} className="px-3 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-60" onClick={async ()=>{
                setCompanySaving(true)
                try {
                  const payload: any = { ...company, taxAccounts: { ...(company.taxAccounts || {}), apSplitByLineItems: apSplitLines } }
                  const res = await CompanyService.saveCompanyProfile(payload)
                  try { localStorage.setItem('settings.apSplitLines', JSON.stringify(apSplitLines)) } catch {}
                  if (res.ok) { window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Company profile saved', type: 'success' } })) }
                } catch (e:any) {
                  window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to save', type: 'error' } }))
                } finally { setCompanySaving(false) }
              }}>{companySaving ? 'Saving…' : 'Save'}</button>
              <button className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" onClick={()=>setCompanyOpen(false)}>Close</button>
            </div>
          </div>
                </ThemedGlassSurface>
              </div>
            </div>
          </ModalPortal>
        )}

        <div>
          <div className="text-xl font-semibold">Profile & Security</div>
          <div className="text-sm text-secondary-contrast">Manage your account.</div>
        </div>

        {/* Developer helpers moved out of Settings for end users; keep minimal profile + security here */}
        {/* Hidden helpers can remain behind env flags later */}
        <ThemedGlassSurface variant="light" className="p-4 hidden">
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
              <button
                disabled={busy === 'seed-coa'}
                className="px-3 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-60"
                onClick={() => run('seed-coa', async () => {
                  const res = await seedCoa('us-gaap')
                  return { message: res?.message || 'COA seeded (idempotent)' }
                })}
              >
                {busy === 'seed-coa' ? 'Seeding COA…' : 'Seed Full COA (US‑GAAP)'}
              </button>
            </div>

            {result && <div className="text-sm text-secondary-contrast">{result}</div>}
          </div>
        </ThemedGlassSurface>

        {/* Owner/Admin features: Recurring Manager and Tenant Members */}
        {(role === 'OWNER' || role === 'ADMIN') && (
          <>
            {/* Recurring Manager */}
            <RecurringManager />

            {/* Tenant Members */}
            <TenantMembers />
          </>
        )}

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


