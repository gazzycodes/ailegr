import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { ModalPortal } from '../layout/ModalPortal'
import TransactionsService from '../../services/transactionsService'
import CustomersService from '../../services/customersService'
import ExpensesService from '../../services/expensesService'
import api from '../../services/api'

interface AiRevenueModalProps {
  open: boolean
  onClose: () => void
}

export function AiRevenueModal({ open, onClose }: AiRevenueModalProps) {
  // Stage & file
  const [stage, setStage] = useState<'picker' | 'form'>('picker')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [extractedText, setExtractedText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form fields
  const [source, setSource] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<any | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggest, setShowSuggest] = useState(false)
  const [loadingSuggest, setLoadingSuggest] = useState(false)

  const onCloseLocal = () => {
    setStage('picker')
    setSelectedFile(null)
    setExtractedText('')
    setError(null)
    setSource('')
    setAmount('')
    setDate('')
    setPreview(null)
    onClose()
  }

  const handleSubmit = async () => {
    setError(null)
    const amt = parseFloat(amount)
    if (!source.trim() || !amount || isNaN(amt) || amt <= 0 || !date) {
      const msg = 'Please fill Source, Amount (>0), and Date'
      setError(msg)
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch {}
      return
    }
    try {
      setSubmitting(true)
      await TransactionsService.postRevenue({
        customer: source.trim(),
        amount: amt,
        date,
        description: `Revenue from ${source.trim()}`
      })
      try { window.dispatchEvent(new CustomEvent('data:refresh')) } catch {}
      onCloseLocal()
    } catch (e: any) {
      const msg = e?.message || 'Failed to post revenue'
      setError(msg)
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch {}
    } finally {
      setSubmitting(false)
    }
  }

  const handlePreview = async () => {
    setError(null)
    setPreview(null)
    const amt = parseFloat(amount)
    if (!source.trim() || !amount || isNaN(amt) || amt <= 0 || !date) {
      const msg = 'Please fill Source, Amount (>0), and Date'
      setError(msg)
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch {}
      return
    }
    try {
      setPreviewing(true)
      const res = await (TransactionsService as any).previewRevenue({ customerName: source.trim(), amount: amt, amountPaid: amt, date, paymentStatus: 'paid', description: `Revenue from ${source.trim()}` })
      setPreview(res)
    } catch (e: any) {
      const msg = e?.message || 'Failed to preview revenue entries'
      setError(msg)
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch {}
    } finally {
      setPreviewing(false)
    }
  }

  // Customer suggestions (reuse Customers API)
  const handleSourceChange = (val: string) => {
    setSource(val)
    setShowSuggest(true)
    if (!val || val.trim().length < 2) { setSuggestions([]); return }
    setLoadingSuggest(true)
    const query = val.trim()
    window.clearTimeout((handleSourceChange as any)._t)
    ;(handleSourceChange as any)._t = window.setTimeout(async () => {
      try {
        const res = await CustomersService.searchCustomers(query)
        setSuggestions(Array.isArray(res?.customers) ? res.customers : [])
      } catch { setSuggestions([]) } finally { setLoadingSuggest(false) }
    }, 250)
  }

  const applySuggestion = (c: any) => {
    setSource(c?.name || '')
    setShowSuggest(false)
  }

  // File selection + OCR/AI
  const handleFileSelection = (file: File) => {
    const allowed = ['image/jpeg','image/png','image/jpg','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/csv','text/plain']
    if (!allowed.includes(file.type)) { setError('Unsupported file type'); return }
    if (file.size > 10 * 1024 * 1024) { setError('File must be < 10MB'); return }
    setSelectedFile(file)
    setError(null)
  }

  const handleDrag = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() }
  const handleDragIn = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(true) }
  const handleDragOut = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(false) }
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); const files = e.dataTransfer.files; if (files && files[0]) handleFileSelection(files[0]) }

  const processDocument = async () => {
    if (!selectedFile) return
    setIsProcessing(true)
    setOcrProgress(10)
    setError(null)
    try {
      // 1) OCR upload
      const res = await ExpensesService.uploadOcr(selectedFile)
      const text = res?.text || ''
      setExtractedText(text)
      setOcrProgress(60)
      // 2) AI extraction tailored for revenue receipts/deposits
      const prompt = `Extract REVENUE/DEPOSIT data from the text below. Return ONLY JSON with keys: {"customerName","amount","date","description","paymentStatus"}.
Rules:
- Dates MUST be formatted as YYYY-MM-DD (ISO 8601). If unknown, return an empty string.
- Default paymentStatus to "paid".
- Amount must be numeric (no currency symbols or commas in the JSON value).
- customerName may be payer/source (bank/processor).
TEXT:\n${text.slice(0, 12000)}`
      const { data } = await api.post('/api/ai/generate', { prompt })

      const parseAiJson = (content: string) => {
        if (!content || typeof content !== 'string') throw new Error('Empty AI content')
        let cleaned = content.trim()
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '')
        }
        const start = cleaned.indexOf('{')
        const end = cleaned.lastIndexOf('}')
        if (start === -1 || end === -1 || end <= start) throw new Error('AI did not return JSON')
        cleaned = cleaned.slice(start, end + 1)
        // Fix common issues: trailing commas, smart quotes
        cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')
        cleaned = cleaned.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'")
        return JSON.parse(cleaned)
      }

      const parsed = parseAiJson(String(data?.content || ''))

      const toISO = (raw: string): string => {
        if (!raw || typeof raw !== 'string') return ''
        const s = raw.trim()
        const isoMatch = s.match(/^\d{4}-\d{2}-\d{2}/)
        if (isoMatch) return isoMatch[0]
        const mdY = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
        if (mdY) {
          let m = parseInt(mdY[1], 10)
          let d = parseInt(mdY[2], 10)
          let y = parseInt(mdY[3], 10)
          if (y < 100) y = 2000 + y
          if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
        }
        const cleaned = s.replace(/(\d+)(st|nd|rd|th)/i, '$1')
        const dt = new Date(cleaned)
        if (!isNaN(dt.getTime())) {
          return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
        }
        return ''
      }

      const findDateByLabels = (labels: string[]): string => {
        const lines = text.split(/\r?\n/)
        for (const line of lines) {
          for (const label of labels) {
            if (line.toLowerCase().includes(label.toLowerCase())) {
              const m = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|[A-Za-z]{3,9} \d{1,2}, \d{4})/)
              if (m) { const iso = toISO(m[1]); if (iso) return iso }
            }
          }
        }
        return ''
      }

      setSource(parsed.customerName || parsed.source || '')
      const amtStr = String(parsed.amount ?? '').toString().replace(/[^0-9.\-]/g, '')
      setAmount(amtStr)
      const isoDate = toISO(parsed.date || '') || findDateByLabels(['date', 'deposit date', 'payment date', 'transaction date'])
      setDate(isoDate)
      setOcrProgress(100)
      setStage('form')
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Processing failed')
    } finally {
      setIsProcessing(false)
    }
  }

  if (!open) return null

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
                    <div className="text-lg sm:text-xl font-semibold">AI Revenue</div>
                    <div className="text-xs text-secondary-contrast">Upload → Extract → Review → Record</div>
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
                          <span className="text-secondary-contrast">Source</span>
                          <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={source} onChange={(e) => handleSourceChange(e.target.value)} placeholder="Stripe, Shopify, Subscription..." onFocus={() => setShowSuggest(true)} />
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
                          <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="3000" />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-secondary-contrast">Date</span>
                          <input type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={date} onChange={(e) => setDate(e.target.value)} />
                        </label>
                      </div>

                      {preview && (
                        <div className="mt-4 text-sm">
                          <div className="font-semibold mb-2">Preview Entries</div>
                          <ul className="space-y-1">
                            {Array.isArray(preview.entries) && preview.entries.map((e: any, i: number) => (
                              <li key={i} className="flex justify-between"><span>{String(e.type || '').toUpperCase()} {e.accountCode} - {e.accountName}</span><span>${Number(e.amount).toLocaleString()}</span></li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
                      <div className="mt-4 flex justify-end gap-2">
                        <button className="px-3 py-1.5 text-sm rounded-lg border transition backdrop-blur-glass bg-white/10 hover:bg-white/15 border-white/10 text-foreground" onClick={() => setStage('picker')}>Back</button>
                        <button className="px-3 py-1.5 text-sm rounded-lg border transition backdrop-blur-glass bg-white/10 hover:bg-white/15 border-white/10 text-foreground" onClick={handlePreview} disabled={previewing}>{previewing ? 'Previewing…' : 'Preview'}</button>
                        <button disabled={submitting} className="px-3 py-1.5 text-sm rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-60" onClick={handleSubmit}>{submitting ? 'Recording...' : 'Record Revenue'}</button>
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

export default AiRevenueModal


