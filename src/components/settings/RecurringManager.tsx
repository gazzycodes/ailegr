import { useEffect, useMemo, useState } from 'react'
import RecurringService, { type RecurringRule } from '../../services/recurringService'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { ModalPortal } from '../layout/ModalPortal'
import { getNextOccurrences } from '../../lib/recurring'

type ManagerAction = 'pause' | 'resume' | 'delete' | 'run'

export default function RecurringManager() {
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ open: boolean; rule?: RecurringRule }>(() => ({ open: false }))
  const [previewModal, setPreviewModal] = useState<{ open: boolean; json?: any }>({ open: false })
  const [logModal, setLogModal] = useState<{ open: boolean; entries: any[] }>({ open: false, entries: [] })

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const list = await RecurringService.listRecurring()
      setRules(Array.isArray(list) ? list : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load recurring rules')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const doAction = async (id: string, action: ManagerAction) => {
    try {
      if (action === 'pause') await RecurringService.pauseRecurring(id)
      if (action === 'resume') await RecurringService.resumeRecurring(id)
      if (action === 'run') await RecurringService.runRecurringNow()
      if (action === 'delete') {
        // soft delete via deactivation
        await RecurringService.updateRecurring(id, { isActive: false } as any)
      }
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Action completed', type: 'success' } }))
      await load()
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Action failed', type: 'error' } }))
    }
  }

  return (
    <ThemedGlassSurface variant="light" className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Recurring Manager</div>
          <div className="text-sm text-secondary-contrast">Create and manage recurring rules</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-lg bg-primary/10 text-primary border border-primary/30" onClick={async () => {
            try {
              await RecurringService.runRecurringNow()
              window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Triggered Run Due Now', type: 'success' } }))
              await load()
            } catch (e: any) {
              window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Run failed', type: 'error' } }))
            }
          }}>Run Due Now</button>
          <button className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" onClick={async () => {
            try {
              const sim = await RecurringService.simulateNextRun()
              setPreviewModal({ open: true, json: sim })
              window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Simulated next run (dry‑run)', type: 'success' } }))
            } catch (e: any) {
              window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Simulation failed', type: 'error' } }))
            }
          }}>Simulate Due</button>
          <button className="px-3 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30" onClick={() => setEditor({ open: true })}>New Rule</button>
        </div>
      </div>

      {loading && <div className="text-sm text-secondary-contrast">Loading…</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}

      <div className="rounded-lg border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface/60">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Cadence</th>
              <th className="text-left px-3 py-2">Next Run</th>
              <th className="text-left px-3 py-2">Last Run</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-white/10">
                <td className="px-3 py-2 truncate">{(r as any).name || (r.payload?.description || r.payload?.vendorName || r.payload?.customerName || '-') }</td>
                <td className="px-3 py-2">{String(r.type).toLowerCase()}</td>
                <td className="px-3 py-2">{r.cadence}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span>{(r.nextRunAt || '').slice(0,10)}</span>
                    <button className="px-2 py-0.5 text-xs rounded border border-white/10 hover:bg-white/10" onClick={async () => {
                      try {
                        const occ = await RecurringService.getOccurrences(r.id, 3)
                        window.dispatchEvent(new CustomEvent('toast', { detail: { message: `Upcoming: ${occ.join(' • ') || '-'}`, type: 'info', duration: 3500 } }))
                      } catch (e: any) {
                        window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to fetch occurrences', type: 'error' } }))
                      }
                    }}>Upcoming</button>
                  </div>
                </td>
                <td className="px-3 py-2">{r.lastRunAt ? String(r.lastRunAt).slice(0,10) : '-'}</td>
                <td className="px-3 py-2">{r.isActive ? 'Active' : 'Paused'}</td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <button className="px-2 py-1 rounded border border-white/10 hover:bg-white/10" onClick={() => setEditor({ open: true, rule: r })}>Edit</button>
                    {r.isActive ? (
                      <button className="px-2 py-1 rounded border border-white/10 hover:bg-white/10" onClick={() => doAction(r.id, 'pause')}>Pause</button>
                    ) : (
                      <button className="px-2 py-1 rounded border border-white/10 hover:bg-white/10" onClick={() => doAction(r.id, 'resume')}>Resume</button>
                    )}
                    <button className="px-2 py-1 rounded border border-white/10 hover:bg-white/10" onClick={async () => {
                      try {
                        const sim = await RecurringService.simulateNextRun(r.id)
                        setPreviewModal({ open: true, json: sim })
                        window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Preview simulated (dry‑run)', type: 'success' } }))
                      } catch (e: any) {
                        window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Simulation failed', type: 'error' } }))
                      }
                    }}>Preview</button>
                    <button className="px-2 py-1 rounded border border-white/10 hover:bg-white/10" onClick={() => {
                      try {
                        const entries = Array.isArray((r as any)?.payload?.__runLog) ? (r as any).payload.__runLog : []
                        if (!entries.length) {
                          window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'No run log yet for this rule', type: 'info' } }))
                          return
                        }
                        setLogModal({ open: true, entries })
                      } catch {
                        window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'No run log available', type: 'info' } }))
                      }
                    }}>View Log</button>
                    <button className="px-2 py-1 rounded border border-white/10 hover:bg-white/10" onClick={() => doAction(r.id, 'run')}>Run now</button>
                    <button className="px-2 py-1 rounded border border-white/10 hover:bg-white/10" onClick={() => doAction(r.id, 'delete')}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {rules.length === 0 && !loading && (
              <tr><td className="px-3 py-4 text-secondary-contrast" colSpan={7}>No rules yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editor.open && (
        <RuleEditor
          rule={editor.rule}
          onClose={() => setEditor({ open: false })}
          onSaved={async () => { setEditor({ open: false }); await load() }}
        />
      )}
      {previewModal.open && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={() => setPreviewModal({ open: false })}>
            <div className="relative w-[96%] max-w-3xl" onClick={(e) => e.stopPropagation()}>
              <ThemedGlassSurface variant="light" className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-lg font-semibold">Simulation Preview (dry‑run)</div>
                  <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={() => setPreviewModal({ open: false })}>✕</button>
                </div>
                <div className="text-xs text-secondary-contrast mb-2">These results are for development only and should be removed/hidden in production.</div>
                <pre className="text-xs bg-white/5 border border-white/10 rounded p-3 max-h-[60vh] overflow-auto">{JSON.stringify(previewModal.json, null, 2)}</pre>
              </ThemedGlassSurface>
            </div>
          </div>
        </ModalPortal>
      )}
      {logModal.open && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={() => setLogModal({ open: false, entries: [] })}>
            <div className="relative w-[96%] max-w-3xl" onClick={(e) => e.stopPropagation()}>
              <ThemedGlassSurface variant="light" className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-lg font-semibold">Run Log (last 20)</div>
                  <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={() => setLogModal({ open: false, entries: [] })}>✕</button>
                </div>
                <div className="text-xs text-secondary-contrast mb-2">DEV view for debugging. Hide/remove for production.</div>
                <div className="space-y-2 max-h-[60vh] overflow-auto">
                  {logModal.entries.map((entry: any, idx: number) => (
                    <div key={idx} className="p-2 rounded border border-white/10 bg-white/5">
                      <div className="text-xs">At: <span className="text-foreground/80">{String(entry.at || '')}</span></div>
                      <div className="text-xs">Run Date: <span className="text-foreground/80">{String(entry.runDate || '')}</span></div>
                      <div className="text-xs">Result: <span className="text-foreground/80">{String(entry.result || '')}</span></div>
                      {entry.transactionId && (<div className="text-xs">Txn: <span className="text-foreground/80">{String(entry.transactionId)}</span></div>)}
                      {entry.errors && (<pre className="text-[11px] bg-white/5 border border-white/10 rounded p-2 mt-1">{JSON.stringify(entry.errors, null, 2)}</pre>)}
                    </div>
                  ))}
                </div>
              </ThemedGlassSurface>
            </div>
          </div>
        </ModalPortal>
      )}
    </ThemedGlassSurface>
  )
}

function RuleEditor({ rule, onClose, onSaved }: { rule?: RecurringRule; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<'EXPENSE' | 'INVOICE'>(rule?.type || 'EXPENSE')
  const [name, setName] = useState<string>((rule as any)?.name || '')
  const [cadence, setCadence] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUAL'>(rule?.cadence || 'MONTHLY')
  const [startDate, setStartDate] = useState<string>((rule?.startDate || new Date().toISOString().slice(0,10)).slice(0,10))
  const [endDate, setEndDate] = useState<string>((rule?.endDate || '').slice(0,10))
  const [amount, setAmount] = useState<string>(String((rule?.payload?.amount ?? '')))
  const [party, setParty] = useState<string>(String((rule?.payload?.vendorName || rule?.payload?.customerName || '')))
  const [description, setDescription] = useState<string>(String((rule?.payload?.description || '')))
  const [weekday, setWeekday] = useState<number | ''>((rule as any)?.weekday ?? '')
  const [dayOfMonth, setDayOfMonth] = useState<number | ''>((rule as any)?.dayOfMonth ?? '')
  const [endOfMonth, setEndOfMonth] = useState<boolean>(Boolean((((rule?.payload as any)?.__options || {})?.endOfMonth)))
  const [nthWeek, setNthWeek] = useState<number | ''>((((rule?.payload as any)?.__options || {})?.nthWeek ?? '') as any)
  const [nthWeekday, setNthWeekday] = useState<number | ''>((((rule?.payload as any)?.__options || {})?.nthWeekday ?? '') as any)
  const [preview, setPreview] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [pauseUntil, setPauseUntil] = useState<string>(String((((rule?.payload as any)?.__options || {})?.pauseUntil || '')))
  const [resumeOn, setResumeOn] = useState<string>(String((((rule?.payload as any)?.__options || {})?.resumeOn || '')))
  const [nextRunAt, setNextRunAt] = useState<string>((rule?.nextRunAt ? String(rule.nextRunAt).slice(0,10) : startDate))

  useEffect(() => {
    const opts: any = {
      weekday: weekday === '' ? null : Number(weekday),
      dayOfMonth: dayOfMonth === '' ? null : Number(dayOfMonth),
      endOfMonth: !!endOfMonth,
      nthWeek: nthWeek === '' ? null : Number(nthWeek),
      nthWeekday: nthWeekday === '' ? null : Number(nthWeekday)
    }
    try {
      setPreview(getNextOccurrences(startDate, cadence, opts, 3))
    } catch { setPreview([]) }
  }, [startDate, cadence, weekday, dayOfMonth, endOfMonth, nthWeek, nthWeekday])

  const submit = async () => {
    try {
      setSaving(true)
      const payload: any = {
        amount: parseFloat(amount || '0'),
        description: description || undefined
      }
      if (type === 'EXPENSE') payload.vendorName = party
      else payload.customerName = party
      const base = {
        name: name || undefined,
        type,
        cadence,
        startDate,
        endDate: endDate || undefined,
        payload,
        nextRunAt
      } as any
      // store helpers to enable server parity without schema churn
      base.dayOfMonth = dayOfMonth === '' ? undefined : Number(dayOfMonth)
      base.weekday = weekday === '' ? undefined : Number(weekday)
      payload.__options = {
        endOfMonth,
        nthWeek: nthWeek === '' ? undefined : Number(nthWeek),
        nthWeekday: nthWeekday === '' ? undefined : Number(nthWeekday),
        pauseUntil: pauseUntil || undefined,
        resumeOn: resumeOn || undefined
      }

      if (rule) await RecurringService.updateRecurring(rule.id, base)
      else await RecurringService.createRecurring(base)
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Rule saved', type: 'success' } }))
      onSaved()
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: e?.message || 'Failed to save rule', type: 'error' } }))
    } finally { setSaving(false) }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
        <div className="relative w-[96%] max-w-2xl" onClick={(e) => e.stopPropagation()}>
          <ThemedGlassSurface variant="light" className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-semibold">{rule ? 'Edit Recurring Rule' : 'New Recurring Rule'}</div>
              <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={onClose}>✕</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-secondary-contrast">Type</span>
                <select className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={type} onChange={(e) => setType(e.target.value as any)}>
                  <option value="EXPENSE">Expense (Vendor Bill)</option>
                  <option value="INVOICE">Invoice (Revenue)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-secondary-contrast">Name (optional)</span>
                <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={name} onChange={(e) => setName(e.target.value)} placeholder="Monthly Adobe" />
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
                <input type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-secondary-contrast">End (optional)</span>
                <input type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-secondary-contrast">Next Run</span>
                <input type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={nextRunAt} onChange={(e) => setNextRunAt(e.target.value)} />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-secondary-contrast">Amount</span>
                <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-secondary-contrast">{type === 'EXPENSE' ? 'Vendor' : 'Customer'}</span>
                <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={party} onChange={(e) => setParty(e.target.value)} placeholder={type === 'EXPENSE' ? 'Adobe' : 'Acme'} />
              </div>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-secondary-contrast">Description</span>
                <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Subscription for …" />
              </label>

              {/* Cadence helpers */}
              {cadence === 'WEEKLY' && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-secondary-contrast">Weekday</span>
                    <select className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={weekday === '' ? '' : String(weekday)} onChange={(e) => setWeekday(e.target.value === '' ? '' : Number(e.target.value))}>
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
                </>
              )}

              {cadence === 'MONTHLY' && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-secondary-contrast">Day of month</span>
                    <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" type="number" min={1} max={31} value={dayOfMonth === '' ? '' : String(dayOfMonth)} onChange={(e) => setDayOfMonth(e.target.value === '' ? '' : Number(e.target.value))} placeholder="1..31" />
                  </label>
                  <label className="flex items-center gap-2 mt-7">
                    <input type="checkbox" checked={endOfMonth} onChange={(e) => setEndOfMonth(e.target.checked)} />
                    <span className="text-sm">Run on end of month</span>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-secondary-contrast">Nth week (1..5, 5=last)</span>
                    <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" type="number" min={1} max={5} value={nthWeek === '' ? '' : String(nthWeek)} onChange={(e) => setNthWeek(e.target.value === '' ? '' : Number(e.target.value))} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-secondary-contrast">Nth weekday</span>
                    <select className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={nthWeekday === '' ? '' : String(nthWeekday)} onChange={(e) => setNthWeekday(e.target.value === '' ? '' : Number(e.target.value))}>
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

              {/* Pause/Resume windows */}
              <label className="flex flex-col gap-1">
                <span className="text-secondary-contrast">Pause until (optional)</span>
                <input type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={pauseUntil} onChange={(e) => setPauseUntil(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-secondary-contrast">Resume on (optional)</span>
                <input type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={resumeOn} onChange={(e) => setResumeOn(e.target.value)} />
              </label>

              <div className="sm:col-span-2">
                <div className="text-xs text-secondary-contrast">Next 3 occurrences:</div>
                <div className="text-sm">{preview.join(' • ') || '-'}</div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-1.5 text-sm rounded-lg border bg-white/10 border-white/10" onClick={() => { setPauseUntil(''); setResumeOn('') }} disabled={saving}>Clear Pause/Resume</button>
              <button className="px-3 py-1.5 text-sm rounded-lg border bg-white/10 border-white/10" onClick={onClose} disabled={saving}>Close</button>
              <button className="px-3 py-1.5 text-sm rounded-lg bg-primary/20 text-primary border border-primary/30" onClick={submit} disabled={saving || !party || !amount}>Save</button>
            </div>
          </ThemedGlassSurface>
        </div>
      </div>
    </ModalPortal>
  )
}


