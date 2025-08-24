import { useEffect, useState } from 'react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { ModalPortal } from '../layout/ModalPortal'
import RecurringService from '../../services/recurringService'
import { getNextOccurrences } from '../../lib/recurring'

export type RecurringModalPayload =
  | { type: 'EXPENSE'; vendorName?: string; amount?: number; description?: string }
  | { type: 'INVOICE'; customerName?: string; amount?: number; description?: string }

export default function RecurringModal({ open, onClose, seed }: { open: boolean; onClose: () => void; seed?: RecurringModalPayload }) {
  const [type, setType] = useState<'EXPENSE' | 'INVOICE'>(seed?.type || 'EXPENSE')
  const [party, setParty] = useState<string>((seed?.type === 'EXPENSE' ? (seed as any)?.vendorName : (seed as any)?.customerName) || '')
  const [amount, setAmount] = useState<string>(seed?.amount != null ? String(seed?.amount) : '')
  const [description, setDescription] = useState<string>(seed?.description || '')
  const [cadence, setCadence] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUAL'>('MONTHLY')
  const [start, setStart] = useState<string>(new Date().toISOString().slice(0,10))
  const [end, setEnd] = useState<string>('')
  const [weekday, setWeekday] = useState<string>('')
  const [dayOfMonth, setDayOfMonth] = useState<string>('')
  const [endOfMonth, setEndOfMonth] = useState(false)
  const [nthWeek, setNthWeek] = useState<string>('')
  const [nthWeekday, setNthWeekday] = useState<string>('')
  const [preview, setPreview] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [payloadPreview, setPayloadPreview] = useState<any | null>(null)
  const [simulating, setSimulating] = useState(false)

  useEffect(() => {
    const opts: any = {
      weekday: weekday === '' ? undefined : Number(weekday),
      dayOfMonth: dayOfMonth === '' ? undefined : Number(dayOfMonth),
      endOfMonth,
      nthWeek: nthWeek === '' ? undefined : Number(nthWeek),
      nthWeekday: nthWeekday === '' ? undefined : Number(nthWeekday)
    }
    try { setPreview(getNextOccurrences(start, cadence, opts, 3)) } catch { setPreview([]) }
  }, [start, cadence, weekday, dayOfMonth, endOfMonth, nthWeek, nthWeekday])

  const submit = async () => {
    try {
      setSaving(true)
      const payload: any = { amount: parseFloat(amount || '0'), description: description || undefined }
      if (type === 'EXPENSE') payload.vendorName = party
      else payload.customerName = party
      const body: any = { type, cadence, startDate: start, endDate: end || undefined, payload }
      if (weekday !== '') body.weekday = Number(weekday)
      if (dayOfMonth !== '') body.dayOfMonth = Number(dayOfMonth)
      payload.__options = { endOfMonth, nthWeek: nthWeek === '' ? undefined : Number(nthWeek), nthWeekday: nthWeekday === '' ? undefined : Number(nthWeekday) }
      await RecurringService.createRecurring(body)
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Recurring rule saved', type: 'success' } }))
      onClose()
      window.dispatchEvent(new Event('data:refresh'))
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to save recurring', type: 'error' } }))
    } finally { setSaving(false) }
  }

  const buildPostingPayload = () => {
    const runDate = start
    const base: any = {
      amount: parseFloat(amount || '0'),
      description: description || undefined,
      date: runDate
    }
    if (type === 'EXPENSE') base.vendorName = party
    else base.customerName = party
    return base
  }

  const previewPosting = () => {
    try {
      const payload = buildPostingPayload()
      setPayloadPreview(payload)
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Built posting payload preview', type: 'info' } }))
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to build payload preview', type: 'error' } }))
    }
  }

  const simulateNextRun = async () => {
    // Guard: only useful for already-saved, due rules. Prevent confusing success on empty form.
    const amt = parseFloat(amount || 'NaN')
    if (!party || !isFinite(amt) || amt <= 0) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Fill party and valid amount, then Save. Simulation runs only for saved, due rules in Recurring Manager.', type: 'error' } }))
      return
    }
    try {
      setSimulating(true)
      const res = await RecurringService.simulateNextRun()
      const count = Array.isArray(res?.results) ? res.results.length : 0
      const msg = count > 0
        ? `Simulated ${count} due rule(s) (no data saved).`
        : 'No rules due to simulate. Save first or set Next Run to today in Recurring Manager.'
      console.log('Recurring simulate (modal quick):', res)
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'info' } }))
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Simulation failed', type: 'error' } }))
    } finally { setSimulating(false) }
  }

  return (
    <ModalPortal>
      {open && (
        <div className="fixed inset-0 z-[9999] modal-overlay flex items-center justify-center p-4" onClick={onClose}>
          <div onClick={(e: any) => e.stopPropagation()}>
            <ThemedGlassSurface variant="light" className="p-6 max-w-xl w-[92%] glass-modal liquid-glass" hover={false}>
              <div className="text-lg font-semibold mb-3">Recurring</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="text-secondary-contrast">Type</span>
                  <select className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={type} onChange={(e) => setType(e.target.value as any)}>
                    <option value="EXPENSE">Expense (Vendor Bill)</option>
                    <option value="INVOICE">Invoice (Revenue)</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-secondary-contrast">{type === 'EXPENSE' ? 'Vendor' : 'Customer'}</span>
                  <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={party} onChange={(e) => setParty(e.target.value)} placeholder={type === 'EXPENSE' ? 'Adobe' : 'Acme Corp'} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-secondary-contrast">Amount</span>
                  <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-secondary-contrast">Description</span>
                  <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Subscription for …" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-secondary-contrast">Cadence</span>
                  <select className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={cadence} onChange={(e) => setCadence(e.target.value as any)}>
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="ANNUAL">Annually</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-secondary-contrast">Start</span>
                  <input type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={start} onChange={(e) => setStart(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-secondary-contrast">End (optional)</span>
                  <input type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={end} onChange={(e) => setEnd(e.target.value)} />
                </label>

                {/* Helpers */}
                {cadence === 'WEEKLY' && (
                  <label className="flex flex-col gap-1">
                    <span className="text-secondary-contrast">Weekday</span>
                    <select className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={weekday} onChange={(e) => setWeekday(e.target.value)}>
                      <option value="">Same weekday</option>
                      <option value="0">Sunday</option>
                      <option value="1">Monday</option>
                      <option value="2">Tuesday</option>
                      <option value="3">Wednesday</option>
                      <option value="4">Thursday</option>
                      <option value="5">Friday</option>
                      <option value="6">Saturday</option>
                    </select>
                  </label>
                )}

                {cadence === 'MONTHLY' && (
                  <>
                    <label className="flex flex-col gap-1">
                      <span className="text-secondary-contrast">Day of month</span>
                      <input type="number" min={1} max={31} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} placeholder="1..31" />
                    </label>
                    <label className="flex items-center gap-2 mt-7">
                      <input type="checkbox" checked={endOfMonth} onChange={(e) => setEndOfMonth(e.target.checked)} />
                      <span className="text-sm">Run on end of month</span>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-secondary-contrast">Nth week (1..5, 5=last)</span>
                      <input type="number" min={1} max={5} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={nthWeek} onChange={(e) => setNthWeek(e.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-secondary-contrast">Nth weekday</span>
                      <select className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={nthWeekday} onChange={(e) => setNthWeekday(e.target.value)}>
                        <option value="">—</option>
                        <option value="0">Sunday</option>
                        <option value="1">Monday</option>
                        <option value="2">Tuesday</option>
                        <option value="3">Wednesday</option>
                        <option value="4">Thursday</option>
                        <option value="5">Friday</option>
                        <option value="6">Saturday</option>
                      </select>
                    </label>
                  </>
                )}

                <div className="sm:col-span-2">
                  <div className="text-xs text-secondary-contrast">Next 3 occurrences:</div>
                  <div className="text-sm">{preview.join(' • ') || '-'}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs text-secondary-contrast mb-1">Validation Preview (payload):</div>
                  <pre className="text-xs bg-white/5 border border-white/10 rounded p-2 overflow-auto max-h-40">{payloadPreview ? JSON.stringify(payloadPreview, null, 2) : '—'}</pre>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button className="px-3 py-1.5 text-sm rounded-lg border bg-white/10 border-white/10" onClick={previewPosting} disabled={saving}>Build Payload</button>
                <button className="px-3 py-1.5 text-sm rounded-lg border bg-white/10 border-white/10" onClick={simulateNextRun} disabled={saving || simulating}>{simulating ? 'Simulating…' : 'Simulate Due (saved rules)'}</button>
                <button className="px-3 py-1.5 text-sm rounded-lg border bg-white/10 border-white/10" onClick={onClose} disabled={saving}>Close</button>
                <button className="px-3 py-1.5 text-sm rounded-lg bg-primary/20 text-primary border border-primary/30" onClick={submit} disabled={saving || !party || !amount || !(parseFloat(amount) > 0)}>Save</button>
              </div>
            </ThemedGlassSurface>
          </div>
        </div>
      )}
    </ModalPortal>
  )
}


