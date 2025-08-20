import { useEffect, useState } from 'react'
import AICategoriesService from '../../../services/aiCategoriesService'

type Pending = {
  id: string
  name?: string
  key?: string
  accountCode?: string
  description?: string
  confidence?: number
}

export default function AICategories() {
  const [items, setItems] = useState<Pending[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mod, setMod] = useState<Record<string, Partial<Pending>>>({})

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await AICategoriesService.getPending()
      setItems(list)
    } catch (e: any) {
      setError(e?.message || 'Failed to load pending categories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const setField = (id: string, field: keyof Pending, value: string) => {
    setMod(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }))
  }

  const approve = async (id: string) => {
    try {
      await AICategoriesService.approveCategory(id, mod[id] || {})
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Category approved', type: 'success' } }))
      setMod(prev => { const n = { ...prev }; delete n[id]; return n })
      load()
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Approve failed', type: 'error' } }))
    }
  }

  const reject = async (id: string) => {
    const existingCategoryId = prompt('Map to existing category ID?')?.trim()
    if (!existingCategoryId) return
    try {
      await AICategoriesService.rejectCategory(id, existingCategoryId)
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Suggestion rejected', type: 'success' } }))
      load()
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Reject failed', type: 'error' } }))
    }
  }

  if (loading) return <div className="text-sm text-secondary-contrast">Loading…</div>
  if (error) return <div className="text-sm text-red-400">{error}</div>
  if (!items.length) return <div className="text-sm text-secondary-contrast">No pending suggestions.</div>

  return (
    <div className="space-y-3">
      {items.map(item => (
        <div key={item.id} className="border border-white/10 rounded-lg p-3 bg-white/5">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
            <input
              defaultValue={item.name || ''}
              placeholder="Name"
              onChange={(e) => setField(item.id, 'name', e.target.value)}
              className="px-2 py-1 rounded bg-white/10 border border-white/10"
            />
            <input
              defaultValue={item.key || ''}
              placeholder="Key"
              onChange={(e) => setField(item.id, 'key', e.target.value)}
              className="px-2 py-1 rounded bg-white/10 border border-white/10"
            />
            <input
              defaultValue={item.accountCode || ''}
              placeholder="Account Code"
              onChange={(e) => setField(item.id, 'accountCode', e.target.value)}
              className="px-2 py-1 rounded bg-white/10 border border-white/10"
            />
            <input
              defaultValue={item.description || ''}
              placeholder="Description"
              onChange={(e) => setField(item.id, 'description', e.target.value)}
              className="px-2 py-1 rounded bg-white/10 border border-white/10"
            />
            <div className="flex gap-2 justify-end">
              <button className="px-2 py-1 text-sm rounded bg-primary/20 text-primary border border-primary/30" onClick={() => approve(item.id)}>Approve</button>
              <button className="px-2 py-1 text-sm rounded bg-red-500/15 text-red-400 border border-red-400/30" onClick={() => reject(item.id)}>Reject</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}


