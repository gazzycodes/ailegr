import { useEffect, useState } from 'react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { ModalPortal } from '../layout/ModalPortal'
import AssetsService from '../../services/assetsService'

interface AssetModalProps {
  open: boolean
  onClose: () => void
  seed?: { vendorName?: string; amount?: number | string; date?: string } | null
}

export default function AssetModal({ open, onClose, seed }: AssetModalProps) {
  const [name, setName] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [categories, setCategories] = useState<any[]>([])
  const [acquisitionDate, setAcquisitionDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [inServiceDate, setInServiceDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [cost, setCost] = useState<string>('')
  const [residualValue, setResidualValue] = useState<string>('0')
  const [usefulLifeMonths, setUsefulLifeMonths] = useState<string>('36')
  const [method, setMethod] = useState<'SL' | 'DB'>('SL')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      ;(async () => {
        try { const list = await AssetsService.listCategories(); setCategories(list) } catch {}
        try {
          const v = (seed?.vendorName || vendorName || '').trim()
          if (v) {
            const key = 'asset.vendor.pref'
            const map = JSON.parse(localStorage.getItem(key) || '{}')
            if (map[v]) setCategoryId(map[v])
          }
        } catch {}
      })()
      try {
        if (seed?.vendorName) setVendorName(seed.vendorName)
        if (seed?.amount != null && String(seed.amount)) setCost(String(seed.amount))
        if (seed?.date) {
          const d = new Date(seed.date)
          if (!isNaN(d.getTime())) { setAcquisitionDate(d.toISOString().slice(0,10)); setInServiceDate(d.toISOString().slice(0,10)) }
        }
        if (!name) setName('Fixed Asset')
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const doQuickCategory = async () => {
    try {
      const nm = prompt('New category name (e.g., Computers)')
      if (!nm) return
      const created = await AssetsService.createCategory({ name: nm })
      const list = await AssetsService.listCategories()
      setCategories(list)
      setCategoryId(created?.id || '')
    } catch {}
  }

  const doSave = async () => {
    try {
      setSaving(true)
      setError(null)
      const c = parseFloat(cost || '0')
      if (!name.trim()) { setError('Name is required'); return }
      if (isNaN(c) || c <= 0) { setError('Enter a valid cost'); return }
      const res = await AssetsService.createAsset({
        name: name.trim(),
        vendorName: vendorName.trim() || undefined,
        acquisitionDate,
        inServiceDate,
        cost: c,
        residualValue: parseFloat(residualValue || '0') || 0,
        method,
        usefulLifeMonths: Math.max(1, parseInt(usefulLifeMonths || '36', 10) || 36),
        categoryId: categoryId || undefined
      })
      try {
        const assetId = res?.asset?.id || res?.id
        if (assetId) window.dispatchEvent(new CustomEvent('asset:created', { detail: { assetId } }))
      } catch {}
      try {
        const v = (vendorName || '').trim()
        if (v && categoryId) {
          const key = 'asset.vendor.pref'
          const map = JSON.parse(localStorage.getItem(key) || '{}')
          map[v] = categoryId
          localStorage.setItem(key, JSON.stringify(map))
        }
      } catch {}
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Asset created', type: 'success' } })) } catch {}
      onClose()
      return res
    } catch (e: any) {
      const msg = e?.message || 'Failed to create asset'
      setError(msg)
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch {}
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[10000] modal-overlay flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e: any) => e.stopPropagation()} className="w-[92%] max-w-xl">
          <ThemedGlassSurface variant="light" className="p-6" hover={false}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <div className="text-lg font-semibold">New Asset</div>
                <div className="text-sm text-secondary-contrast">Capitalize a fixed asset and start depreciation</div>
              </div>
              <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={onClose}>Close</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-secondary-contrast">Name</span>
                <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={name} onChange={(e) => setName(e.target.value)} placeholder="MacBook Pro 14" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-secondary-contrast">Vendor (optional)</span>
                <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Apple" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-secondary-contrast">Category</span>
                <div className="flex items-center gap-2">
                  <select className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none" value={categoryId} onChange={(e)=> setCategoryId(e.target.value)}>
                    <option value="">(none)</option>
                    {categories.map((c)=> (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                  <button type="button" className="px-2 py-1 rounded bg-white/10 border border-white/10 hover:bg-white/15" onClick={doQuickCategory}>New</button>
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-secondary-contrast">Acquisition Date</span>
                <input type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-secondary-contrast">In-Service Date</span>
                <input type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={inServiceDate} onChange={(e) => setInServiceDate(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-secondary-contrast">Cost</span>
                <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="1999.00" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-secondary-contrast">Residual Value</span>
                <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={residualValue} onChange={(e) => setResidualValue(e.target.value)} placeholder="0" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-secondary-contrast">Useful Life (months)</span>
                <input type="number" min={1} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={usefulLifeMonths} onChange={(e) => setUsefulLifeMonths(e.target.value)} placeholder="36" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-secondary-contrast">Method</span>
                <select className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={method} onChange={(e) => setMethod(e.target.value as any)}>
                  <option value="SL">Straight-line</option>
                  <option value="DB" disabled>Declining-balance (coming soon)</option>
                </select>
              </label>
            </div>

            {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-1.5 text-sm rounded-lg border transition backdrop-blur-glass bg-white/10 hover:bg-white/15 border-white/10 text-foreground" onClick={onClose}>Cancel</button>
              <button disabled={saving} className="px-3 py-1.5 text-sm rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-60" onClick={doSave}>{saving ? 'Saving…' : 'Create Asset'}</button>
            </div>
          </ThemedGlassSurface>
        </div>
      </div>
    </ModalPortal>
  )
}
