import { useEffect, useState } from 'react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { ModalPortal } from '../layout/ModalPortal'
import AssetsService from '../../services/assetsService'

export default function AssetRegister({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [assets, setAssets] = useState<any[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await AssetsService.listAssets()
        if (!cancelled) setAssets(list)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [open])

  if (!open) return null

  const runDep = async () => {
    try { setBusy(true); await AssetsService.runDepreciation(25); } catch {} finally { setBusy(false) }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[10000] modal-overlay flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e: any) => e.stopPropagation()} className="w-[92%] max-w-3xl">
          <ThemedGlassSurface variant="light" className="p-6" hover={false}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <div className="text-lg font-semibold">Asset Register</div>
                <div className="text-sm text-secondary-contrast">View assets and status</div>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 text-sm rounded-lg bg-white/10 border border-white/10 hover:bg-white/15" onClick={runDep} disabled={busy}>{busy ? 'Running…' : 'Run Depreciation'}</button>
                <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={onClose}>Close</button>
              </div>
            </div>

            <div className="overflow-auto rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-surface/60">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2">Cost</th>
                    <th className="px-3 py-2">Accum Dep</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Next Run</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr key={a.id} className="border-t border-white/10">
                      <td className="px-3 py-2 text-left">{a.name}</td>
                      <td className="px-3 py-2 text-right">${Number(a.cost || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">${Number(a.accumulatedDepreciation || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-center">{a.status}</td>
                      <td className="px-3 py-2 text-center">{a.nextRunOn ? String(a.nextRunOn).slice(0,10) : '-'}</td>
                    </tr>
                  ))}
                  {assets.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-secondary-contrast">No assets yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </ThemedGlassSurface>
        </div>
      </div>
    </ModalPortal>
  )
}
