import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { ModalPortal } from '../layout/ModalPortal'
import CompanyService, { CompanyProfile } from '../../services/companyService'

interface CompanyProfileModalProps {
  open: boolean
  onClose: () => void
}

export default function CompanyProfileModal({ open, onClose }: CompanyProfileModalProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<CompanyProfile>({
    legalName: '',
    aliases: [],
    ein: '',
    taxId: '',
    addressLines: [''],
    city: '',
    state: '',
    zipCode: '',
    country: 'US'
  })

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    CompanyService.getCompanyProfile()
      .then((p) => {
        if (p) {
          setForm({
            legalName: p.legalName || '',
            aliases: Array.isArray(p.aliases) ? p.aliases : [],
            ein: p.ein || '',
            taxId: p.taxId || '',
            addressLines: Array.isArray(p.addressLines) && p.addressLines.length ? p.addressLines : [''],
            city: p.city || '',
            state: p.state || '',
            zipCode: p.zipCode || '',
            country: p.country || 'US'
          })
        } else {
          setForm((f) => ({ ...f, legalName: '', aliases: [], addressLines: [''] }))
        }
      })
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  const setField = (key: keyof CompanyProfile, value: any) => setForm((f) => ({ ...f, [key]: value }))

  const save = async () => {
    if (!form.legalName.trim()) { setError('Legal name is required'); return }
    try {
      setSaving(true)
      setError(null)
      const payload: Partial<CompanyProfile> = {
        legalName: form.legalName.trim(),
        aliases: form.aliases.filter(a => a && a.trim()),
        ein: form.ein?.trim() || undefined,
        taxId: form.taxId?.trim() || undefined,
        addressLines: form.addressLines.filter(a => a && a.trim()),
        city: form.city?.trim() || undefined,
        state: form.state?.trim() || undefined,
        zipCode: form.zipCode?.trim() || undefined,
        country: form.country || 'US'
      }
      await CompanyService.updateCompanyProfile(payload)
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Company profile saved', type: 'success' } })) } catch {}
      onClose()
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to save profile'
      setError(msg)
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch {}
    } finally {
      setSaving(false)
    }
  }

  const updateAlias = (idx: number, val: string) => setForm((f) => ({ ...f, aliases: f.aliases.map((a, i) => i === idx ? val : a) }))
  const addAlias = () => setForm((f) => ({ ...f, aliases: [...f.aliases, ''] }))
  const removeAlias = (idx: number) => setForm((f) => ({ ...f, aliases: f.aliases.filter((_, i) => i !== idx) }))

  const updateAddressLine = (idx: number, val: string) => setForm((f) => ({ ...f, addressLines: f.addressLines.map((a, i) => i === idx ? val : a) }))
  const addAddressLine = () => setForm((f) => ({ ...f, addressLines: [...f.addressLines, ''] }))
  const removeAddressLine = (idx: number) => setForm((f) => ({ ...f, addressLines: f.addressLines.filter((_, i) => i !== idx) }))

  return (
    <ModalPortal>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal-overlay absolute inset-0" onClick={onClose} />
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} className="relative w-[96%] max-w-3xl" onClick={(e) => e.stopPropagation()}>
              <ThemedGlassSurface variant="light" className="p-0 glass-modal liquid-glass overflow-hidden" hover={false}>
                <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-primary/80 font-semibold">Workspace</div>
                    <div className="text-lg sm:text-xl font-semibold">Company Profile</div>
                    <div className="text-xs text-secondary-contrast">Used for AI classification and document identity rules</div>
                  </div>
                  <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={onClose}>✕</button>
                </div>

                <div className="p-5">
                  {loading ? (
                    <div className="text-sm text-secondary-contrast">Loading…</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-secondary-contrast">Legal Name</span>
                        <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none" value={form.legalName} onChange={(e) => setField('legalName', e.target.value)} placeholder="AILegr Solutions Inc" />
                      </label>

                      <div className="sm:col-span-2">
                        <div className="text-secondary-contrast mb-1">Aliases</div>
                        <div className="space-y-2">
                          {form.aliases.map((a, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none" value={a} onChange={(e) => updateAlias(i, e.target.value)} placeholder="AlLegr, AILegr" />
                              <button className="px-2 py-1 rounded bg-white/10 border border-white/10" onClick={() => removeAlias(i)}>Remove</button>
                            </div>
                          ))}
                          <button className="px-3 py-1.5 text-sm rounded bg-white/10 border border-white/10" onClick={addAlias}>+ Add Alias</button>
                        </div>
                      </div>

                      <label className="flex flex-col gap-1">
                        <span className="text-secondary-contrast">EIN</span>
                        <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none" value={form.ein || ''} onChange={(e) => setField('ein', e.target.value)} placeholder="12-3456789" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-secondary-contrast">Tax ID</span>
                        <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none" value={form.taxId || ''} onChange={(e) => setField('taxId', e.target.value)} placeholder="GST/VAT/National" />
                      </label>

                      <div className="sm:col-span-2">
                        <div className="text-secondary-contrast mb-1">Address Lines</div>
                        <div className="space-y-2">
                          {form.addressLines.map((a, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none" value={a} onChange={(e) => updateAddressLine(i, e.target.value)} placeholder="123 Main St" />
                              <button className="px-2 py-1 rounded bg-white/10 border border-white/10" onClick={() => removeAddressLine(i)}>Remove</button>
                            </div>
                          ))}
                          <button className="px-3 py-1.5 text-sm rounded bg-white/10 border border-white/10" onClick={addAddressLine}>+ Add Address Line</button>
                        </div>
                      </div>

                      <label className="flex flex-col gap-1">
                        <span className="text-secondary-contrast">City</span>
                        <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none" value={form.city || ''} onChange={(e) => setField('city', e.target.value)} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-secondary-contrast">State/Province</span>
                        <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none" value={form.state || ''} onChange={(e) => setField('state', e.target.value)} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-secondary-contrast">ZIP/Postal Code</span>
                        <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none" value={form.zipCode || ''} onChange={(e) => setField('zipCode', e.target.value)} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-secondary-contrast">Country</span>
                        <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none" value={form.country || 'US'} onChange={(e) => setField('country', e.target.value)} />
                      </label>

                      {error && <div className="sm:col-span-2 text-sm text-red-400">{error}</div>}
                      <div className="sm:col-span-2 flex justify-end gap-2 mt-2">
                        <button className="px-3 py-1.5 text-sm rounded-lg border transition backdrop-blur-glass bg-white/10 hover:bg-white/15 border-white/10 text-foreground" onClick={onClose}>Cancel</button>
                        <button disabled={saving} className="px-3 py-1.5 text-sm rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-60" onClick={save}>{saving ? 'Saving…' : 'Save Profile'}</button>
                      </div>
                    </div>
                  )}
                </div>
              </ThemedGlassSurface>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ModalPortal>
  )
}

