import { useEffect, useMemo, useState } from 'react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import ThemedSelect from '../themed/ThemedSelect'
import ProductsService, { type Product } from '../../services/productsService'

export default function ProductsPage() {
  const [items, setItems] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all'|'service'|'inventory'>('all')
  const [busy, setBusy] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [edit, setEdit] = useState<Product | null>(null)
  const [form, setForm] = useState<Partial<Product>>({ name: '', type: 'service' })
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<Product | null>(null)

  const refresh = async () => {
    const list = await ProductsService.listProducts({ search: search || undefined, type: typeFilter==='all'? undefined : typeFilter, active: true })
    setItems(Array.isArray(list) ? list : [])
  }

  useEffect(() => { let c=false; (async()=>{ try{ await refresh() } finally { if (!c){} } })(); return ()=>{ c=true } }, [])

  const filtered = useMemo(() => items, [items])

  const openNew = () => { setEdit(null); setForm({ name: '', type: 'service', sku: '', unit: 'ea', price: undefined, cost: undefined }); setFormOpen(true) }
  const openEdit = (p: Product) => { setEdit(p); setForm({ ...p }); setFormOpen(true) }

  const save = async () => {
    try {
      setBusy(true); setError(null)
      if (!form.name || !String(form.name).trim()) { setError('Name is required'); return }
      if (!form.type) { setError('Type is required'); return }
      if (edit) await ProductsService.updateProduct(edit.id, form)
      else await ProductsService.createProduct(form)
      setFormOpen(false)
      await refresh()
    } catch (e: any) {
      setError(e?.message || 'Save failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="p-4">
      <div className="text-xl font-semibold mb-3">Products</div>
      <ThemedGlassSurface variant="light" className="p-3 mb-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-secondary-contrast">Search</span>
            <input value={search} onChange={(e)=> setSearch(e.target.value)} onKeyDown={async (e)=>{ if (e.key==='Enter') await refresh() }} className="px-3 py-2 rounded bg-white/10 border border-white/10" placeholder="Name or SKU" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-secondary-contrast">Type</span>
            <ThemedSelect value={typeFilter} onChange={(e)=> setTypeFilter((e.target as HTMLSelectElement).value as any)}>
              <option value="all">All</option>
              <option value="service">Service</option>
              <option value="inventory">Inventory</option>
            </ThemedSelect>
          </label>
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded bg-white/10 border border-white/10" onClick={refresh}>Apply</button>
            <button className="px-3 py-2 rounded bg-primary/20 text-primary border border-primary/30" onClick={openNew}>New</button>
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded bg-white/10 border border-white/10"
              onClick={() => {
                const rows = filtered.map(p => ({
                  name: p.name,
                  type: p.type,
                  sku: p.sku || '',
                  unit: p.unit || '',
                  price: p.price ?? '',
                  cost: p.cost ?? '',
                  incomeAccountCode: p.incomeAccountCode || '',
                  expenseAccountCode: p.expenseAccountCode || '',
                  cogsAccountCode: p.cogsAccountCode || '',
                  inventoryAccountCode: p.inventoryAccountCode || '',
                  taxCode: p.taxCode || '',
                  favorite: p.favorite ? '1' : '',
                  tags: Array.isArray(p.tags) ? JSON.stringify(p.tags) : ''
                }))
                const headers = Object.keys(rows[0] || { name:'', type:'', sku:'', unit:'', price:'', cost:'' })
                const csv = [headers.join(','), ...rows.map((r: any) => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'products.csv'
                a.click()
                URL.revokeObjectURL(url)
              }}
            >Export CSV</button>
            <label className="px-3 py-2 rounded bg-white/10 border border-white/10 cursor-pointer">
              <input type="file" accept=".csv" className="hidden" onChange={async (e)=>{
                try {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const text = await file.text()
                  const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean)
                  const headers = headerLine.split(',').map(h => h.replace(/^"|"$/g,''))
                  const parsed = lines.map(l => {
                    const cols = l.match(/([^",]+)|"([^"]*)"/g) || []
                    const values = cols.map(c => c.replace(/^"|"$/g,''))
                    const obj: any = {}
                    headers.forEach((h, i) => { obj[h] = values[i] })
                    return obj
                  })
                  // Minimal client-side import: create rows; ignore unknown fields
                  let created = 0
                  for (const row of parsed) {
                    const payload: any = {
                      name: row.name,
                      type: (row.type === 'inventory' ? 'inventory' : 'service'),
                      sku: row.sku || undefined,
                      unit: row.unit || undefined,
                      price: row.price ? Number(row.price) : undefined,
                      cost: row.cost ? Number(row.cost) : undefined,
                      incomeAccountCode: row.incomeAccountCode || undefined,
                      expenseAccountCode: row.expenseAccountCode || undefined,
                      cogsAccountCode: row.cogsAccountCode || undefined,
                      inventoryAccountCode: row.inventoryAccountCode || undefined,
                      taxCode: row.taxCode || undefined,
                      favorite: row.favorite ? row.favorite === '1' || row.favorite.toLowerCase() === 'true' : undefined,
                    }
                    if (row.tags) {
                      try { payload.tags = JSON.parse(row.tags) } catch { payload.tags = String(row.tags).split('|').map((s: string)=> s.trim()).filter(Boolean) }
                    }
                    if (payload.name && payload.type) {
                      await ProductsService.createProduct(payload)
                      created++
                    }
                  }
                  await refresh()
                  window.dispatchEvent(new CustomEvent('toast', { detail: { message: `Imported ${created} products`, type: 'success' } }))
                  ;(e.target as HTMLInputElement).value = ''
                } catch (err: any) {
                  window.dispatchEvent(new CustomEvent('toast', { detail: { message: err?.message || 'Import failed', type: 'error' } }))
                }
              }} />
              Import CSV
            </label>
          </div>
        </div>
      </ThemedGlassSurface>

      <ThemedGlassSurface variant="light" className="p-3">
        <div className="overflow-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-surface/60">
              <tr>
                <th className="px-3 py-2 text-center">Fav</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Cost</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-t border-white/10 hover:bg-white/5">
                  <td className="px-3 py-2 text-center">
                    <button
                      title={p.favorite ? 'Unfavorite' : 'Favorite'}
                      className={"px-2 py-0.5 rounded border " + (p.favorite ? 'bg-yellow-400/20 border-yellow-300/30 text-yellow-200' : 'bg-white/10 border-white/10 text-secondary-contrast')}
                      onClick={async ()=> { try { await ProductsService.updateProduct(p.id, { favorite: !p.favorite }); await refresh() } catch (e:any) { window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Update failed', type: 'error' } })) } }}
                    >★</button>
                  </td>
                  <td className="px-3 py-2 text-left">
                    <button className="text-left hover:underline" onClick={()=> setDetail(p)}>{p.name}</button>
                    {Array.isArray(p.tags) && p.tags.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {(p.tags as any[]).slice(0,6).map((t:any, i:number)=> (
                          <span key={i} className="px-1.5 py-0.5 text-[10px] rounded bg-white/10 border border-white/10">{String(t)}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center uppercase text-xs">{p.type}</td>
                  <td className="px-3 py-2 text-center">{p.sku || '-'}</td>
                  <td className="px-3 py-2 text-center">{p.unit || '-'}</td>
                  <td className="px-3 py-2 text-right">{p.price != null ? `$${Number(p.price).toFixed(2)}` : '-'}</td>
                  <td className="px-3 py-2 text-right">{p.cost != null ? `$${Number(p.cost).toFixed(2)}` : '-'}</td>
                  <td className="px-3 py-2 text-center">
                    <button className="px-2 py-1 rounded bg-white/10 border border-white/10" onClick={()=> openEdit(p)}>Edit</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-secondary-contrast">No products</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </ThemedGlassSurface>

      {formOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="modal-overlay absolute inset-0" onClick={()=> setFormOpen(false)} />
          <div className="relative w-[96%] max-w-2xl" onClick={(e)=> e.stopPropagation()}>
            <ThemedGlassSurface variant="light" className="p-0 glass-modal liquid-glass overflow-hidden" hover={false}>
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-sm text-primary/80 font-semibold">{edit ? 'Edit Product' : 'New Product'}</div>
                  <div className="text-lg sm:text-xl font-semibold">Catalog</div>
                </div>
                <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={()=> setFormOpen(false)}>✕</button>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="text-secondary-contrast">Name</span>
                  <input value={form.name||''} onChange={(e)=> setForm(f=> ({ ...f, name: e.target.value }))} className="px-3 py-2 rounded bg-white/10 border border-white/10" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-secondary-contrast">Type</span>
                  <ThemedSelect value={(form.type as any)||'service'} onChange={(e)=> setForm(f=> ({ ...f, type: (e.target as HTMLSelectElement).value as any }))}>
                    <option value="service">Service</option>
                    <option value="inventory">Inventory</option>
                  </ThemedSelect>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-secondary-contrast">SKU</span>
                  <input value={(form.sku as any)||''} onChange={(e)=> setForm(f=> ({ ...f, sku: e.target.value }))} className="px-3 py-2 rounded bg-white/10 border border-white/10" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-secondary-contrast">Unit</span>
                  <input value={(form.unit as any)||'ea'} onChange={(e)=> setForm(f=> ({ ...f, unit: e.target.value }))} className="px-3 py-2 rounded bg-white/10 border border-white/10" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-secondary-contrast">Price</span>
                  <input type="number" value={form.price as any || ''} onChange={(e)=> setForm(f=> ({ ...f, price: e.target.value === '' ? undefined : Number(e.target.value) }))} className="px-3 py-2 rounded bg-white/10 border border-white/10" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-secondary-contrast">Cost</span>
                  <input type="number" value={form.cost as any || ''} onChange={(e)=> setForm(f=> ({ ...f, cost: e.target.value === '' ? undefined : Number(e.target.value) }))} className="px-3 py-2 rounded bg-white/10 border border-white/10" />
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!form.favorite} onChange={(e)=> setForm(f=> ({ ...f, favorite: e.target.checked }))} />
                  <span className="text-secondary-contrast">Favorite</span>
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-secondary-contrast">Tags</span>
                  <input value={Array.isArray(form.tags) ? (form.tags as any[]).join(', ') : (typeof form.tags === 'string' ? form.tags : '')} onChange={(e)=> setForm(f=> {
                    const raw = e.target.value
                    const arr = raw.split(',').map(s=> s.trim()).filter(Boolean)
                    return { ...f, tags: arr }
                  })} className="px-3 py-2 rounded bg-white/10 border border-white/10" placeholder="comma,separated,tags" />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-secondary-contrast">Inventory Account</span>
                  <input value={(form.inventoryAccountCode as any)||''} onChange={(e)=> setForm(f=> ({ ...f, inventoryAccountCode: e.target.value }))} className="px-3 py-2 rounded bg-white/10 border border-white/10" placeholder="1300" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-secondary-contrast">Income Account</span>
                  <input value={(form.incomeAccountCode as any)||''} onChange={(e)=> setForm(f=> ({ ...f, incomeAccountCode: e.target.value }))} className="px-3 py-2 rounded bg-white/10 border border-white/10" placeholder="4010/4020" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-secondary-contrast">COGS Account</span>
                  <input value={(form.cogsAccountCode as any)||''} onChange={(e)=> setForm(f=> ({ ...f, cogsAccountCode: e.target.value }))} className="px-3 py-2 rounded bg-white/10 border border-white/10" placeholder="5000" />
                </label>
                {error && <div className="sm:col-span-2 text-sm text-red-400">{error}</div>}
                <div className="sm:col-span-2 flex justify-end gap-2">
                  <button className="px-3 py-1.5 text-sm rounded-lg border bg-white/10 border-white/10" onClick={()=> setFormOpen(false)} disabled={busy}>Close</button>
                  <button className="px-3 py-1.5 text-sm rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-60" onClick={save} disabled={busy || !form.name || !form.type}>{busy? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            </ThemedGlassSurface>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-[9998]" onClick={()=> setDetail(null)}>
          <div className="absolute inset-0 modal-overlay" />
          <div className="absolute right-0 top-0 bottom-0 w-[92%] max-w-md" onClick={(e)=> e.stopPropagation()}>
            <ThemedGlassSurface variant="light" className="p-0 h-full glass-modal liquid-glass" hover={false}>
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-sm text-primary/80 font-semibold">Product</div>
                  <div className="text-lg sm:text-xl font-semibold">{detail.name}</div>
                </div>
                <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={()=> setDetail(null)}>✕</button>
              </div>
              <div className="p-5 text-sm space-y-2">
                <div className="flex items-center justify-between"><span>Type</span><span className="font-medium uppercase">{detail.type}</span></div>
                <div className="flex items-center justify-between"><span>SKU</span><span className="font-medium">{detail.sku || '-'}</span></div>
                <div className="flex items-center justify-between"><span>Unit</span><span className="font-medium">{detail.unit || '-'}</span></div>
                <div className="flex items-center justify-between"><span>Price</span><span className="font-medium">{detail.price != null ? `$${Number(detail.price).toFixed(2)}` : '-'}</span></div>
                <div className="flex items-center justify-between"><span>Cost</span><span className="font-medium">{detail.cost != null ? `$${Number(detail.cost).toFixed(2)}` : '-'}</span></div>
                <div className="flex items-center justify-between"><span>Income</span><span className="font-medium">{detail.incomeAccountCode || '-'}</span></div>
                <div className="flex items-center justify-between"><span>COGS</span><span className="font-medium">{detail.cogsAccountCode || '-'}</span></div>
                <div className="flex items-center justify-between"><span>Inventory</span><span className="font-medium">{detail.inventoryAccountCode || '-'}</span></div>
                {Array.isArray(detail.tags) && detail.tags.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs text-secondary-contrast mb-1">Tags</div>
                    <div className="flex flex-wrap gap-1">
                      {(detail.tags as any[]).map((t:any, i:number)=> (
                        <span key={i} className="px-1.5 py-0.5 text-[10px] rounded bg-white/10 border border-white/10">{String(t)}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="px-5 pb-4 flex items-center justify-end gap-2">
                <button className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15" onClick={()=> { setForm({ ...detail }); setEdit(detail); setFormOpen(true) }}>Edit</button>
                <button className="px-3 py-1.5 rounded-lg bg-surface/60 hover:bg-surface" onClick={()=> setDetail(null)}>Close</button>
              </div>
            </ThemedGlassSurface>
          </div>
        </div>
      )}
    </div>
  )
}
