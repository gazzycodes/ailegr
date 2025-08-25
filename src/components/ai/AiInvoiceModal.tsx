import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { ModalPortal } from '../layout/ModalPortal'
//
import { TransactionsService } from '../../services/transactionsService'
import CustomersService from '../../services/customersService'
import ExpensesService from '../../services/expensesService'
import api from '../../services/api'
import ThemedSelect from '../themed/ThemedSelect'

interface AiInvoiceModalProps {
  open: boolean
  onClose: () => void
}

export function AiInvoiceModal({ open, onClose }: AiInvoiceModalProps) {
  // Stage & file
  const [stage, setStage] = useState<'picker' | 'form'>('picker')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [extractedText, setExtractedText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form fields
  const [customer, setCustomer] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueDays, setDueDays] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [status, setStatus] = useState<'paid' | 'invoice' | 'partial' | 'overpaid'>('invoice')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggest, setShowSuggest] = useState(false)
  const [loadingSuggest, setLoadingSuggest] = useState(false)

  if (!open) return null

  const onCloseLocal = () => {
    setStage('picker'); setSelectedFile(null); setExtractedText(''); setError(null)
    setCustomer(''); setAmount(''); setDate(''); setDueDate(''); setInvoiceNumber(''); setStatus('invoice'); setNotes('')
    onClose()
  }
  // Debounced customer search
  const handleCustomerChange = (val: string) => {
    setCustomer(val)
    setShowSuggest(true)
    if (!val || val.trim().length < 2) {
      setSuggestions([])
      return
    }
    setLoadingSuggest(true)
    const q = val.trim()
    // debounce via setTimeout per keystroke
    window.clearTimeout((handleCustomerChange as any)._t)
    ;(handleCustomerChange as any)._t = window.setTimeout(async () => {
      try {
        const res = await CustomersService.searchCustomers(q)
        setSuggestions(Array.isArray(res?.customers) ? res.customers : [])
      } catch {
        setSuggestions([])
      } finally {
        setLoadingSuggest(false)
      }
    }, 250)
  }

  const applySuggestion = (c: any) => {
    setCustomer(c?.name || '')
    setShowSuggest(false)
  }
  const handleSubmit = async () => {
    setError(null)
    const amt = parseFloat(amount)
    if (!customer.trim() || !amount || isNaN(amt) || amt <= 0 || !date) {
      const msg = 'Please fill Customer, Amount (>0), and Date'
      setError(msg)
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch {}
      return
    }
    try {
      setSubmitting(true)
      const result = await TransactionsService.postInvoice({
        customerName: customer.trim(),
        amount: amt,
        date,
        description: notes || `Invoice for ${customer.trim()}`,
        invoiceNumber: invoiceNumber || undefined,
        paymentStatus: status,
        dueDate: dueDate || undefined,
        dueDays: dueDays === '' ? undefined : Math.max(0, Math.min(365, Number(dueDays) || 0))
      })
      // Inform user explicitly if this was an idempotent duplicate
      try {
        if (result && result.isExisting) {
          window.dispatchEvent(new CustomEvent('toast', { detail: { message: `Invoice #${invoiceNumber || ''} already exists. Opened existing record.`, type: 'info' } }))
        } else {
          window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Invoice created successfully', type: 'success' } }))
        }
      } catch {}
      try { window.dispatchEvent(new CustomEvent('data:refresh')) } catch {}
      onCloseLocal()
    } catch (e: any) {
      const msg = e?.message || 'Failed to create invoice'
      setError(msg)
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch {}
    } finally {
      setSubmitting(false)
    }
  }

  const handleFileSelection = (file: File) => {
    const allowed = ['image/jpeg','image/png','image/jpg','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/csv','text/plain']
    if (!allowed.includes(file.type)) { setError('Unsupported file type'); return }
    if (file.size > 10 * 1024 * 1024) { setError('File must be < 10MB'); return }
    setSelectedFile(file)
    setError(null)
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
  }
  const handleDragIn = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(true)
  }
  const handleDragOut = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false)
    const files = e.dataTransfer.files
    if (files && files[0]) handleFileSelection(files[0])
  }

  const processDocument = async () => {
    if (!selectedFile) return
    setIsProcessing(true)
    setOcrProgress(10)
    setError(null)
    try {
      const res = await ExpensesService.uploadOcr(selectedFile)
      const text = res?.text || ''
      setExtractedText(text)
      setOcrProgress(60)
      const prompt = `Extract INVOICE data from the text below. Return ONLY JSON with keys: {"customerName", "amount", "date", "dueDate", "invoiceNumber", "description", "paymentStatus","lineItems":[{"description","amount","accountCode"}]}.
Rules:
- Dates MUST be formatted as YYYY-MM-DD (ISO 8601). If unknown, return an empty string.
- If Amount Paid == Total or Balance Due == 0 → "paid"; if Amount Paid > Total → "overpaid"; if Amount Paid > 0 and Balance Due > 5 → "partial"; else "invoice".
 - If you can infer revenue category (subscription, license, support, training, marketing services), choose accountCode from: 4020 (Services), 4030 (Marketing Services), 4040 (Support & Maintenance), 4050 (Subscription & SaaS), 4060 (License Revenue), 4070 (Training Revenue). Otherwise leave accountCode empty.
TEXT:\n${text.slice(0, 12000)}`
      const { data } = await api.post('/api/ai/generate', { prompt })
      const match = (data?.content || '').match(/\{[\s\S]*\}/)
      if (!match) throw new Error('AI did not return JSON')
      const parsed = JSON.parse(match[0])
      setCustomer(parsed.customerName || '')
      setAmount(String(parsed.amount ?? ''))

      const toISO = (raw: string): string => {
        if (!raw || typeof raw !== 'string') return ''
        const s = raw.trim()
        // Already ISO-like
        const isoMatch = s.match(/^\d{4}-\d{2}-\d{2}/)
        if (isoMatch) return isoMatch[0]
        // MM/DD/YYYY or MM-DD-YYYY
        const mdY = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
        if (mdY) {
          let m = parseInt(mdY[1], 10)
          let d = parseInt(mdY[2], 10)
          let y = parseInt(mdY[3], 10)
          if (y < 100) y = 2000 + y // crude 2-digit year handling
          if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            const mm = String(m).padStart(2, '0')
            const dd = String(d).padStart(2, '0')
            return `${y}-${mm}-${dd}`
          }
        }
        // Month name formats (e.g., Sep 13, 2024)
        const cleaned = s.replace(/(\d+)(st|nd|rd|th)/i, '$1')
        const dt = new Date(cleaned)
        if (!isNaN(dt.getTime())) {
          const y = dt.getFullYear()
          const m = String(dt.getMonth() + 1).padStart(2, '0')
          const d = String(dt.getDate()).padStart(2, '0')
          return `${y}-${m}-${d}`
    }
        return ''
      }

      // Fallback: try extract labeled dates from OCR text if AI omitted/invalid
      const findDateByLabels = (labels: string[]): string => {
        const lines = text.split(/\r?\n/)
        for (const line of lines) {
          for (const label of labels) {
            if (line.toLowerCase().includes(label.toLowerCase())) {
              const m = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|[A-Za-z]{3,9} \d{1,2}, \d{4})/)
              if (m) {
                const iso = toISO(m[1])
                if (iso) return iso
              }
            }
          }
        }
        return ''
      }

      const isoDate = toISO(parsed.date || '') || findDateByLabels(['invoice date', 'bill to invoice date', 'bill date', 'date of service', 'date'])
      const isoDue = toISO(parsed.dueDate || '') || findDateByLabels(['due date', 'payment due', 'net'])

      setDate(isoDate)
      setDueDate(isoDue)
      setInvoiceNumber(parsed.invoiceNumber || '')
      setNotes(parsed.description || '')
      setStatus((parsed.paymentStatus as any) || 'invoice')
      try { (window as any)._aiInvoiceLines = Array.isArray(parsed.lineItems) ? parsed.lineItems : null } catch {}
      setOcrProgress(100)
      setStage('form')
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Processing failed')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <ModalPortal>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal-overlay absolute inset-0" onClick={onCloseLocal} />
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} className="relative w-[96%] max-w-4xl" onClick={(e) => e.stopPropagation()}>
              <ThemedGlassSurface variant="light" className="p-0 glass-modal liquid-glass overflow-hidden" hover={false}>
                <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-primary/80 font-semibold">AI Import</div>
                    <div className="text-lg sm:text-xl font-semibold">AI Invoice</div>
                    <div className="text-xs text-secondary-contrast">Upload → Extract → Review → Create</div>
                  </div>
                  <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={onCloseLocal}>✕</button>
                </div>

                {stage === 'picker' ? (
                  <div className="p-5">
                    <div className="space-y-4 text-sm">
                      <div
                        className={`rounded-2xl border transition-all duration-300 cursor-pointer select-none ${dragActive ? 'border-primary/50 bg-primary/5' : 'border-white/10 bg-surface/50 hover:bg-surface/60'} p-8`}
                        onDragEnter={handleDragIn}
                        onDragLeave={handleDragOut}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
                      >
                        <div className="flex flex-col items-center text-center gap-3">
                          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                            <span className="text-2xl">📄</span>
                          </div>
                          <div className="text-base font-semibold">Drop your document here</div>
                          <div className="text-secondary-contrast">or click to browse</div>
                          <div className="text-xs text-secondary-contrast">PDF, DOCX, CSV/TXT, JPG, PNG (max 10MB)</div>
                        </div>
                        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.csv,.txt,.jpg,.jpeg,.png" onChange={(e) => e.target.files && handleFileSelection(e.target.files[0])} className="hidden" />
                      </div>

                      {selectedFile && (
                        <div className="rounded-xl border border-white/10 bg-surface/60 p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="text-2xl">📄</div>
                            <div className="truncate">
                              <div className="font-medium truncate">{selectedFile.name}</div>
                              <div className="text-xs text-secondary-contrast">{(selectedFile.size/1024/1024).toFixed(2)} MB</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button className="px-2 py-1 rounded bg-white/10 border border-white/10 hover:bg-white/15 text-xs" onClick={() => setSelectedFile(null)}>Remove</button>
                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={isProcessing} onClick={processDocument} className="px-3 py-1.5 rounded bg-primary/20 text-primary border border-primary/30 disabled:opacity-60">{isProcessing ? 'Processing…' : 'Process with AI'}</motion.button>
                          </div>
                        </div>
                      )}

                      {error && <div className="text-sm text-red-400">{error}</div>}

                      {isProcessing && (
                        <div className="pt-1">
                          <div className="w-full h-2 bg-surface/60 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${ocrProgress}%` }} className="h-full bg-primary/60" />
                          </div>
                          <div className="text-xs text-secondary-contrast mt-1">{ocrProgress < 50 ? 'Extracting text…' : 'Analyzing with AI…'}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col lg:flex-row">
                    <div className="lg:w-1/3 p-5 border-b lg:border-b-0 lg:border-r border-white/10">
                      <div className="text-sm text-secondary-contrast mb-2">OCR Snapshot</div>
                      <div className="rounded-lg bg-surface/50 p-3 max-h-64 overflow-auto text-xs whitespace-pre-wrap">{extractedText.slice(0, 2000)}{extractedText.length > 2000 ? '…' : ''}</div>
                    </div>
                    <div className="flex-1 p-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <label className="flex flex-col gap-1 relative">
                          <span className="text-secondary-contrast">Customer</span>
                          <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={customer} onChange={(e) => handleCustomerChange(e.target.value)} placeholder="Acme Corp" onFocus={() => setShowSuggest(true)} />
                          {showSuggest && (suggestions.length > 0 || loadingSuggest) && (
                            <div className="absolute top-full mt-1 left-0 right-0 z-10 rounded-lg border border-white/10 bg-surface/80 backdrop-blur-xl shadow-lg max-h-56 overflow-auto">
                              {loadingSuggest && <div className="px-3 py-2 text-sm text-secondary-contrast">Searching...</div>}
                              {suggestions.map((c, i) => (
                                <button key={c.id || i} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-white/10" onClick={() => applySuggestion(c)}>
                                  <div className="font-medium">{c.name}</div>
                                  <div className="text-xs text-secondary-contrast">{c.company || c.email || ''}</div>
                                </button>
                              ))}
                            </div>
                          )}
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-secondary-contrast">Amount</span>
                          <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-secondary-contrast">Date</span>
                          <input type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={date} onChange={(e) => setDate(e.target.value)} />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-secondary-contrast flex items-center gap-1">Due Date</span>
                          <input type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-secondary-contrast flex items-center gap-1">Due Terms</span>
                          <div className="flex gap-2">
                            <ThemedSelect value={["0","14","30","45","60","90"].includes(dueDays) ? dueDays : ''} onChange={(e) => setDueDays((e.target as HTMLSelectElement).value || dueDays)}>
                              <option value="">Custom</option>
                              <option value="0">Net 0</option>
                              <option value="14">Net 14</option>
                              <option value="30">Net 30</option>
                              <option value="45">Net 45</option>
                              <option value="60">Net 60</option>
                              <option value="90">Net 90</option>
                            </ThemedSelect>
                            <input type="number" min={0} max={365} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md w-24" value={dueDays} onChange={(e) => setDueDays(e.target.value)} placeholder="days" />
                          </div>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-secondary-contrast">Invoice #</span>
                          <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-2025-001" />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-secondary-contrast">Status</span>
                          <select className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                            <option value="invoice">Invoice (Unpaid)</option>
                            <option value="paid">Paid</option>
                            <option value="partial">Partial</option>
                            <option value="overpaid">Overpaid</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 sm:col-span-2">
                          <span className="text-secondary-contrast">Description</span>
                          <textarea rows={3} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Line items, payment terms, etc." />
                        </label>
                      </div>

                      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
                      <div className="mt-4 flex justify-end gap-2">
                        <button className="px-3 py-1.5 text-sm rounded-lg border transition backdrop-blur-glass bg-white/10 hover:bg-white/15 border-white/10 text-foreground" onClick={() => setStage('picker')}>Back</button>
                        <button disabled={submitting} className="px-3 py-1.5 text-sm rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-60" onClick={handleSubmit}>{submitting ? 'Creating…' : 'Create Invoice'}</button>
                      </div>
                    </div>
                  </div>
                )}
              </ThemedGlassSurface>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ModalPortal>
  )
}

export default AiInvoiceModal


