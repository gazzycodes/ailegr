import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { CustomersService } from '../../services/customersService'

type Customer = {
  id: string
  name: string
  email: string
  company?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  isActive?: boolean
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  // Lightweight error feedback via toasts only
  const [openCreate, setOpenCreate] = useState(false)
  const [openEdit, setOpenEdit] = useState<Customer | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const fetchData = async () => {
    setLoading(true)
    try {
      const list = await CustomersService.listCustomers(query.trim() || undefined)
      setCustomers(list)
    } catch (e: any) {
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to load customers', type: 'error' } })) } catch {}
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q)
    )
  }, [customers, query])

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, currentPage, pageSize])

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xl font-semibold">Customers</div>
            <div className="text-sm text-secondary-contrast">Manage your client directory</div>
          </div>
          <button className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30" onClick={() => setOpenCreate(true)}>New Customer</button>
        </div>

        <ThemedGlassSurface variant="light" className="p-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              placeholder="Search by name, company, or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md"
            />
            <div className="flex items-center gap-2">
              <button className="px-3 py-2 rounded-lg border border-white/10 bg-white/10" onClick={fetchData}>Search</button>
              <button className="px-3 py-2 rounded-lg border border-white/10 bg-white/10" onClick={() => { setQuery(''); fetchData() }}>Reset</button>
            </div>
          </div>
          {/* Pagination controls */}
          <div className="mt-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-secondary-contrast">Rows per page</span>
              <select className="px-2 py-1 rounded bg-white/10 border border-white/10" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
                {[10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-secondary-contrast">{(Math.min((currentPage - 1) * pageSize + 1, total))}-{Math.min(currentPage * pageSize, total)} of {total}</span>
              <div className="flex items-center gap-1">
                <button className="px-2 py-1 rounded border border-white/10 bg-white/10 disabled:opacity-50" disabled={currentPage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
                <button className="px-2 py-1 rounded border border-white/10 bg-white/10 disabled:opacity-50" disabled={currentPage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</button>
              </div>
            </div>
          </div>
        </ThemedGlassSurface>

        <div className="mt-4">
          <ThemedGlassSurface variant="light" className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="reports-thead">
                  <tr>
                    <th className="py-2 text-left">Name</th>
                    <th className="py-2 text-left">Company</th>
                    <th className="py-2 text-left">Email</th>
                    <th className="py-2 text-left">Phone</th>
                    <th className="py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={5} className="p-4 text-center text-secondary-contrast">Loading...</td></tr>
                  )}
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan={5} className="p-4 text-center text-secondary-contrast">No customers found</td></tr>
                  )}
                  {!loading && paginated.map(c => (
                    <tr key={c.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="px-4 py-2 font-medium">{c.name}</td>
                      <td className="px-4 py-2">{c.company || '-'}</td>
                      <td className="px-4 py-2">{c.email}</td>
                      <td className="px-4 py-2">{c.phone || '-'}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <InlineEdit customer={c} onSaved={fetchData} />
                          <button className="px-2 py-1 rounded border border-white/10 bg-white/10" onClick={() => setOpenEdit(c)}>Edit Modal</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ThemedGlassSurface>
        </div>

        <AnimatePresence>
          {openCreate && (
            <CreateCustomerModal onClose={() => { setOpenCreate(false); fetchData() }} />
          )}
          {openEdit && (
            <EditCustomerModal customer={openEdit} onClose={() => { setOpenEdit(null); fetchData() }} />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function CreateCustomerModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setError(null)
    if (!name.trim() || !email.trim()) {
      setError('Name and Email are required')
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Name and Email are required', type: 'error' } })) } catch {}
      return
    }
    try {
      setSaving(true)
      await CustomersService.createCustomer({ name: name.trim(), email: email.trim(), company: company.trim() || undefined })
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Customer created', type: 'success' } })) } catch {}
      onClose()
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to create customer'
      setError(msg)
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch {}
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] modal-overlay flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.98 }}
        className="w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <ThemedGlassSurface variant="light" className="p-6 glass-modal liquid-glass" hover={false}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-lg font-semibold">New Customer</div>
              <div className="text-sm text-secondary-contrast">Add a new client to your directory</div>
            </div>
            <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={onClose}>Close</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-secondary-contrast">Name</span>
              <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-secondary-contrast">Email</span>
              <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-secondary-contrast">Company</span>
              <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={company} onChange={(e) => setCompany(e.target.value)} />
            </label>
          </div>

          {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
          <div className="mt-4 flex justify-end gap-2">
            <button className="px-3 py-1.5 text-sm rounded-lg border transition backdrop-blur-glass bg-white/10 hover:bg-white/15 border-white/10 text-foreground" onClick={onClose}>Cancel</button>
            <button disabled={saving} className="px-3 py-1.5 text-sm rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-60" onClick={handleSave}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </ThemedGlassSurface>
      </motion.div>
    </div>
  )
}

function InlineEdit({ customer, onSaved }: { customer: Customer, onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(customer.name)
  const [email, setEmail] = useState(customer.email)
  const [company, setCompany] = useState(customer.company || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    try {
      setSaving(true)
      await CustomersService.updateCustomer(customer.id, { name: name.trim(), email: email.trim(), company: company.trim() || undefined })
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Customer updated', type: 'success' } })) } catch {}
      setEditing(false)
      onSaved()
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to update customer'
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch {}
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {!editing ? (
        <button className="px-2 py-1 rounded border border-white/10 bg-white/10" onClick={() => setEditing(true)}>Edit</button>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <input className="px-2 py-1 rounded bg-white/10 border border-white/10" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="px-2 py-1 rounded bg-white/10 border border-white/10" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="px-2 py-1 rounded bg-white/10 border border-white/10" value={company} onChange={(e) => setCompany(e.target.value)} />
          <div className="flex items-center gap-2">
            <button disabled={saving} className="px-2 py-1 rounded bg-primary/20 text-primary border border-primary/30 disabled:opacity-60" onClick={save}>{saving ? 'Saving...' : 'Save'}</button>
            <button className="px-2 py-1 rounded border border-white/10 bg-white/10" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function EditCustomerModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [name, setName] = useState(customer.name)
  const [email, setEmail] = useState(customer.email)
  const [company, setCompany] = useState(customer.company || '')
  const [phone, setPhone] = useState(customer.phone || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    if (!name.trim() || !email.trim()) {
      setError('Name and Email are required')
      return
    }
    try {
      setSaving(true)
      await CustomersService.updateCustomer(customer.id, { name: name.trim(), email: email.trim(), company: company.trim() || undefined, phone: phone.trim() || undefined })
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Customer updated', type: 'success' } }))
      onClose()
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to update customer'
      setError(msg)
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] modal-overlay flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.98 }}
        className="w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <ThemedGlassSurface variant="light" className="p-6 glass-modal liquid-glass" hover={false}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-lg font-semibold">Edit Customer</div>
              <div className="text-sm text-secondary-contrast">Update client details</div>
            </div>
            <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={onClose}>Close</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-secondary-contrast">Name</span>
              <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-secondary-contrast">Email</span>
              <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-secondary-contrast">Company</span>
              <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={company} onChange={(e) => setCompany(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-secondary-contrast">Phone</span>
              <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>

          {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
          <div className="mt-4 flex justify-end gap-2">
            <button className="px-3 py-1.5 text-sm rounded-lg border transition backdrop-blur-glass bg-white/10 hover:bg-white/15 border-white/10 text-foreground" onClick={onClose}>Cancel</button>
            <button disabled={saving} className="px-3 py-1.5 text-sm rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-60" onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </ThemedGlassSurface>
      </motion.div>
    </div>
  )
}


