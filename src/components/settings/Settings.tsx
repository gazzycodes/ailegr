import { useState } from 'react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import SetupService from '../../services/setupService'
import AICategories from './ai/AICategories'

export default function Settings() {
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

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


