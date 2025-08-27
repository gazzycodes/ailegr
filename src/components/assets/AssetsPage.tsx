import { useEffect, useState } from 'react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import AssetsService from '../../services/assetsService'

export default function AssetsPage() {
  const [assets, setAssets] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [events, setEvents] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [filterCat, setFilterCat] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const params: any = {}
    try { if (filterCat) params.categoryId = filterCat } catch {}
    try { /* vendor filter: reuse vendorName via queries later if needed */ } catch {}
    const list = await AssetsService.listAssets()
    setAssets(Array.isArray(list) ? list : [])
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try { const list = await AssetsService.listAssets(); if (!cancelled) setAssets(list) } catch {}
      try { const cats = await AssetsService.listCategories(); if (!cancelled) setCategories(cats) } catch {}
    })()
    return () => { cancelled = true }
  }, [])

  // Listen for external open/select events
  useEffect(() => {
    const onSelect = (e: any) => {
      try {
        const id = e?.detail?.assetId || (window as any)._openAssetId
        if (!id) return
        const match = assets.find(a => a.id === id)
        if (match) setSelected(match)
      } catch {}
    }
    window.addEventListener('assets:select', onSelect as any)
    return () => { window.removeEventListener('assets:select', onSelect as any) }
  }, [assets])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!selected) return
      try { const ev = await AssetsService.getAssetEvents(selected.id); if (!cancelled) setEvents(ev) } catch {}
    })()
    return () => { cancelled = true }
  }, [selected])

  const filtered = assets.filter(a => {
    if (filterCat && a.categoryId !== filterCat) return false
    if (filterStatus && String(a.status) !== filterStatus) return false
    try {
      if (filterFrom) { const d = new Date(a.inServiceDate); if (d < new Date(filterFrom)) return false }
      if (filterTo) { const d = new Date(a.inServiceDate); if (d > new Date(filterTo)) return false }
    } catch {}
    return true
  })

  const exportCsv = () => {
    const rows = [['Name','Vendor','Category','InService','Cost','AccumDep','Status','NextRun']]
    filtered.forEach(a => rows.push([
      a.name,
      a.vendorName||'',
      (categories.find(c=>c.id===a.categoryId)?.name)||'',
      String(a.inServiceDate).slice(0,10),
      String(a.cost||0),
      String(a.accumulatedDepreciation||0),
      String(a.status),
      a.nextRunOn ? String(a.nextRunOn).slice(0,10) : ''
    ]))
    const csv = rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'assets.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const dispose = async (id: string) => {
    try { setBusy(true); await AssetsService.disposeAsset(id); await refresh() } finally { setBusy(false) }
  }

  return (
    <div className="p-4">
      <div className="text-xl font-semibold mb-3">Assets</div>
      <ThemedGlassSurface variant="light" className="p-3 mb-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-secondary-contrast">Category</span>
            <select value={filterCat} onChange={(e)=> setFilterCat((e.target as HTMLSelectElement).value)} className="px-3 py-2 rounded bg-white/10 border border-white/10">
              <option value="">All</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-secondary-contrast">Status</span>
            <select value={filterStatus} onChange={(e)=> setFilterStatus((e.target as HTMLSelectElement).value)} className="px-3 py-2 rounded bg-white/10 border border-white/10">
              <option value="">All</option>
              <option value="active">active</option>
              <option value="disposed">disposed</option>
              <option value="fully_depreciated">fully_depreciated</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-secondary-contrast">From</span>
            <input type="date" value={filterFrom} onChange={(e)=> setFilterFrom(e.target.value)} className="px-3 py-2 rounded bg-white/10 border border-white/10" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-secondary-contrast">To</span>
            <input type="date" value={filterTo} onChange={(e)=> setFilterTo(e.target.value)} className="px-3 py-2 rounded bg-white/10 border border-white/10" />
          </label>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button className="px-3 py-1.5 rounded bg-white/10 border border-white/10 hover:bg-white/15" onClick={exportCsv}>Export CSV</button>
        </div>
      </ThemedGlassSurface>
      <ThemedGlassSurface variant="light" className="p-3">
        <div className="overflow-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-surface/60">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2">Cost</th>
                <th className="px-3 py-2">Accum Dep</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Next Run</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-t border-white/10 hover:bg-white/5">
                  <td className="px-3 py-2 text-left"><button className="text-primary hover:underline" onClick={()=> setSelected(a)}>{a.name}</button></td>
                  <td className="px-3 py-2 text-right">${Number(a.cost || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">${Number(a.accumulatedDepreciation || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-center">{a.status}</td>
                  <td className="px-3 py-2 text-center">{a.nextRunOn ? String(a.nextRunOn).slice(0,10) : '-'}</td>
                  <td className="px-3 py-2 text-center">
                    <button disabled={busy || a.status!=='active'} className="px-2 py-1 rounded bg-white/10 border border-white/10 disabled:opacity-60" onClick={()=> dispose(a.id)}>Dispose</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-secondary-contrast">No assets</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </ThemedGlassSurface>

      {selected && (
        <div className="mt-4">
          <ThemedGlassSurface variant="light" className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{selected.name}</div>
                <div className="text-xs text-secondary-contrast">Vendor: {selected.vendorName || '-'} • In-service: {String(selected.inServiceDate).slice(0,10)} • Cost: ${Number(selected.cost||0).toLocaleString()}</div>
              </div>
              <button className="px-2 py-1 rounded bg-white/10 border border-white/10 hover:bg-white/15" onClick={()=> setSelected(null)}>Close</button>
            </div>
            <div className="mt-3">
              <div className="text-sm font-medium mb-1">Events</div>
              <ul className="text-sm space-y-1">
                {events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <span className="text-secondary-contrast">{e.type.toUpperCase()} • {String(e.runOn).slice(0,10)}</span>
                    <span>${Number(e.amount||0).toFixed(2)}</span>
                  </li>
                ))}
                {events.length === 0 && (
                  <li className="text-secondary-contrast">No events</li>
                )}
              </ul>
            </div>
          </ThemedGlassSurface>
        </div>
      )}
    </div>
  )
}
