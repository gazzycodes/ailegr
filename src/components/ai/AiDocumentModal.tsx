import { useRef, useState, useEffect } from 'react'
import RecurringService from '../../services/recurringService'
import RecurringModal from '../recurring/RecurringModal'
import { motion, AnimatePresence } from 'framer-motion'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { ModalPortal } from '../layout/ModalPortal'
import ExpensesService from '../../services/expensesService'
import CustomersService from '../../services/customersService'
import { TransactionsService } from '../../services/transactionsService'
import api from '../../services/api'

interface AiDocumentModalProps {
  open: boolean
  onClose: () => void
}

// Unified AI Document modal: Upload → Process (OCR) → Review → Preview/Post (Expense)
export default function AiDocumentModal({ open, onClose }: AiDocumentModalProps) {
  // Confidence gate for classification before enabling preview/post
  const CLASSIFY_THRESHOLD = 0.75
  const [stage, setStage] = useState<'picker' | 'form'>('picker')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [scanToastShown, setScanToastShown] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [extractedText, setExtractedText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Expense form
  const [vendor, setVendor] = useState('')
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [preview, setPreview] = useState<any | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dupState, setDupState] = useState<{ checked: boolean; duplicate: boolean; info?: any } | null>(null)
  const [checkingDup, setCheckingDup] = useState(false)

  // Mode: expense or invoice (auto-detected)
  const [mode, setMode] = useState<'expense' | 'invoice'>('expense')
  const [manualEdit, setManualEdit] = useState(false)

  // Invoice form
  const [customer, setCustomer] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [status, setStatus] = useState<'paid' | 'invoice' | 'partial' | 'overpaid'>('invoice')
  const [notes, setNotes] = useState('')
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggest, setShowSuggest] = useState(false)
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [attachedReceiptUrl, setAttachedReceiptUrl] = useState<string | null>(null)
  const [recurringOpen, setRecurringOpen] = useState(false)
  const [classification, setClassification] = useState<{ docType: string; ourRole: string; policy?: string; confidence?: number } | null>(null)
  const [typeConfirmed, setTypeConfirmed] = useState<boolean>(false)
  const [normalizedAmounts, setNormalizedAmounts] = useState<{ subtotal?: number; taxAmount?: number; total?: number; amountPaid?: number; balanceDue?: number } | null>(null)
  const [recognitionDate, setRecognitionDate] = useState<string>('')
  const [fieldConfidence, setFieldConfidence] = useState<{ amount?: number; date?: number; dueDate?: number; invoiceNumber?: number }>({})
  const updateConf = (k: keyof typeof fieldConfidence, v: number) => setFieldConfidence(prev => ({ ...prev, [k]: v }))
  

  // Always mount hooks; rendering is gated below

  // Build a compact, audit-friendly description from OCR text when AI does not provide one
  const deriveDescriptionFromOcr = (raw: string): string => {
    try {
      if (!raw || typeof raw !== 'string') return ''
      const lines = raw.split(/\r?\n/).map(l => (l || '').trim()).filter(Boolean)
      const noise = /(subtotal|total|tax|shipping|discount|balance\s*due|payments?\s*made|vendor|bill\s*to|invoice|due\s*date|bill\s*date|terms|ein|^#|qty|unit|amount)/i
      const amountAtEnd = /(?:^|\s)\$?-?\d{1,4}(?:,\d{3})*(?:\.\d{2})?\s*$/
      const amountOnly = /^\$?-?\d{1,4}(?:,\d{3})*(?:\.\d{2})?$/
      const candidates: string[] = []
      for (let i = 0; i < lines.length && candidates.length < 3; i++) {
        const curr = lines[i]
        if (!curr || noise.test(curr)) continue
        if (amountAtEnd.test(curr)) {
          const textPart = curr.replace(amountAtEnd, '').trim().replace(/\s{2,}/g, ' ')
          if (textPart.length >= 3 && textPart.length <= 100) candidates.push(textPart)
          continue
        }
        const next = lines[i + 1] || ''
        if (amountOnly.test(next) && !noise.test(next)) {
          const textPart = curr.trim().replace(/\s{2,}/g, ' ')
          if (textPart.length >= 3 && textPart.length <= 100) candidates.push(textPart)
        }
      }
      const unique = Array.from(new Set(candidates))
      const joined = unique.slice(0, 3).join('; ')
      return joined
    } catch {
      return ''
    }
  }

  const resetAndClose = () => {
    setStage('picker')
    setSelectedFile(null)
    setExtractedText('')
    setMode('expense')
    setManualEdit(false)
    setVendor('')
    setVendorInvoiceNo('')
    setAmount('')
    setDate('')
    setDescription('')
    setPreview(null)
    setCustomer('')
    setDueDate('')
    setInvoiceNumber('')
    setStatus('invoice')
    setNotes('')
    setSuggestions([])
    setShowSuggest(false)
    setLoadingSuggest(false)
    setAttachedReceiptUrl(null)
    setOcrProgress(0)
    setIsProcessing(false)
    setDupState(null)
    setCheckingDup(false)
    setError(null)
    onClose()
  }

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
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false)
    const files = e.dataTransfer.files
    if (files && files[0]) handleFileSelection(files[0])
  }

  // Build a concise description from OCR line items (best-effort).
  // Attempts to capture up to two item rows with amounts to aid audit trails.
  const deriveLineItemSummary = (raw: string): string | null => {
    if (!raw) return null
    try {
      const lines = raw.split(/\r?\n/).map(l => (l || '').trim()).filter(Boolean)
      const startIdx = (() => {
        const idx = lines.findIndex(l => /line\s*items/i.test(l))
        if (idx >= 0) return idx + 1
        const hdr = lines.findIndex(l => /item\s+description/i.test(l))
        return hdr >= 0 ? hdr + 1 : 0
      })()
      const stopWord = /^(payments\s*made|subtotal|total|tax|shipping|balance\s*due|terms|bill\s*date|due\s*date)/i
      const items: string[] = []
      for (let i = startIdx; i < Math.min(lines.length, startIdx + 12); i++) {
        let line = lines[i]
        if (!line || stopWord.test(line)) break
        if (/item\s+description/i.test(line)) continue
        // Capture last amount on the line
        const amountMatches = line.match(/[\$€£₹]?\s*[0-9]+(?:[, .']*[0-9]{3})*(?:[.,][0-9]{1,2})?/g)
        const amountStr = amountMatches && amountMatches.length ? amountMatches[amountMatches.length - 1].replace(/\s+/g, '') : null
        // Remove obvious column headers and keep descriptive text
        let desc = line.replace(/\b(item|description|qty|unit|amount)\b.*$/i, '').trim()
        // If description still looks like a table row, strip trailing columns before the amount
        if (amountStr) {
          const idxAmt = desc.lastIndexOf(amountStr)
          if (idxAmt > 0) desc = desc.slice(0, idxAmt).trim()
        }
        // Skip numeric-only or heading-like lines
        if (!/[A-Za-z]/.test(desc) || desc.length < 4) continue
        // Join with the next line if it continues the description and is not a totals row
        if (i + 1 < lines.length && !stopWord.test(lines[i + 1]) && /[A-Za-z]/.test(lines[i + 1]) && !/[\$€£₹]/.test(lines[i + 1])) {
          const next = lines[i + 1].trim()
          if (next && next.length > 3 && !/^(qty|unit|amount)$/i.test(next)) {
            desc = `${desc} ${next}`
            i++
          }
        }
        items.push(amountStr ? `${desc} (${amountStr})` : desc)
        if (items.length >= 2) break
      }
      return items.length ? items.join(' + ') : null
    } catch {
      return null
    }
  }

  const processDocument = async () => {
    if (!selectedFile) return
    setIsProcessing(true)
    // Reset prior state so new uploads don't reuse previous values
    setPreview(null)
    setClassification(null)
    setTypeConfirmed(false)
    setFieldConfidence({})
    setNormalizedAmounts(null)
    setRecognitionDate('')
    setVendor('')
    setVendorInvoiceNo('')
    setAmount('')
    setDate('')
    setDescription('')
    setCustomer('')
    setDueDate('')
    setInvoiceNumber('')
    setStatus('invoice')
    setNotes('')
    setSuggestions([])
    setShowSuggest(false)
    setAttachedReceiptUrl(null)
    setMode('expense')
    setManualEdit(false)
    setOcrProgress(10)
    setError(null)
    try {
      // 1) OCR upload
      const res = await ExpensesService.uploadOcr(selectedFile)
      const text = (res?.text || '').toString()
      const lowerAll = text.toLowerCase()
      setExtractedText(text)
      setOcrProgress(60)
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'AI scan complete. Review and edit fields before creating.', type: 'info', duration: 5000 } })) } catch {}
      // 2) Normalize and classify to decide invoice vs expense
      let structured: any = null
      try {
        const norm = await api.post('/api/ocr/normalize', { text }, { timeout: 60000 })
        structured = norm?.data?.structured || null
        const am = structured?.amounts || {}
        setNormalizedAmounts({
          subtotal: typeof am.subtotal === 'number' ? am.subtotal : undefined,
          taxAmount: typeof am.taxAmount === 'number' ? am.taxAmount : undefined,
          total: typeof am.total === 'number' ? am.total : undefined,
          amountPaid: typeof am.amountPaid === 'number' ? am.amountPaid : undefined,
          balanceDue: typeof am.balanceDue === 'number' ? am.balanceDue : undefined
        })
        if (typeof am.total === 'number') {
          const current = parseFloat(amount || '0')
          if (!amount || !Number.isFinite(current) || current < (am.total - 0.01)) {
            setAmount(String(am.total))
          }
          updateConf('amount', 0.9)
        } else if (!amount && typeof am.subtotal === 'number' && typeof am.taxAmount === 'number') {
          const totalCalc = parseFloat((am.subtotal + am.taxAmount).toFixed(2))
          setAmount(String(totalCalc))
          updateConf('amount', 0.8)
        }
        
        // Prefer labels from normalizer for dates (do not set invoice number here)
        const lbl = (structured && structured.labels) || {}
        const toISO = (raw: string): string => {
          if (!raw || typeof raw !== 'string') return ''
          const s = raw.trim()
          const iso = s.match(/^\d{4}-\d{2}-\d{2}/)
          if (iso) return iso[0]
          const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
          if (mdy) { let m = +mdy[1], d = +mdy[2], y = +mdy[3]; if (y < 100) y = 2000 + y; return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` }
          const cleaned = s.replace(/(\d+)(st|nd|rd|th)/i, '$1')
          const dt = new Date(cleaned)
          if (!isNaN(dt.getTime())) { const y = dt.getFullYear(); const m = String(dt.getMonth()+1).padStart(2,'0'); const d = String(dt.getDate()).padStart(2,'0'); return `${y}-${m}-${d}` }
          return ''
        }
        // Intentionally skip auto-setting invoiceNumber from OCR; we'll generate an internal suggestion later
        if (lbl.invoiceDate && !date) { const iso = toISO(String(lbl.invoiceDate)); if (iso) { setDate(iso); updateConf('date', 0.9) } }
        if (lbl.dueDate && !dueDate) { const iso = toISO(String(lbl.dueDate)); if (iso) { setDueDate(iso); updateConf('dueDate', 0.9) } }
        if ((structured as any)?.labels?.revenueRecognitionDate) {
          const iso = toISO(String((structured as any).labels.revenueRecognitionDate))
          if (iso) setRecognitionDate(iso)
        }
      } catch (e) {}
      let docType = 'expense'
      try {
        // Prefer server-side classifier with deterministic identity lock
        let classified = false
        try {
          const s = await api.post('/api/documents/classify', { text, structured, mode: 'ai_first' }, { timeout: 60000 })
          const sd = s?.data || {}
          if (sd.docType) {
            docType = String(sd.docType).toLowerCase()
            setClassification({ docType: sd.docType, ourRole: docType === 'invoice' ? 'seller' : (docType === 'expense' ? 'buyer' : 'unknown'), policy: docType === 'invoice' ? 'REVENUE_RECOGNITION' : 'EXPENSE_MATCHING', confidence: typeof sd.confidence === 'number' ? sd.confidence : undefined })
            classified = true
            setTypeConfirmed(typeof sd.locked === 'boolean' ? sd.locked : (typeof sd.confidence === 'number' ? sd.confidence >= CLASSIFY_THRESHOLD : false))
          }
        } catch (e) {}

        if (!classified) {
          // AI fallback with company context, plus client-side deterministic override
          let companyHint = ''
          let companyNames: string[] = []
          try {
            const prof = await api.get('/api/company-profile')
            const nm = String(prof?.data?.legalName || '').trim()
            const aliasesArr = Array.isArray(prof?.data?.aliases) ? prof.data.aliases : (prof?.data?.aliases ? [prof.data.aliases] : [])
            if (nm) {
              companyHint = `\nMY COMPANY: ${nm}${aliasesArr.length ? `\nALIASES: ${aliasesArr.join(', ')}` : ''}`
              companyNames = [nm.toLowerCase(), ...aliasesArr.map((s: any) => String(s).toLowerCase())]
            }
          } catch (e) {}
          const cPrompt = `Classify the document as { docType: 'invoice' | 'expense' | 'other', confidence: 0..1, reasons: string[], vendorName?: string, customerName?: string }.
Use the hints to determine if our company is sender or recipient.${companyHint}
TEXT:\n${text.slice(0, 12000)}`
          const cRes = await api.post('/api/ai/generate', { prompt: cPrompt }, { timeout: 60000 })
          const cMatch = (cRes?.data?.content || '').match(/\{[\s\S]*\}/)
          if (cMatch) {
            const j = JSON.parse(cMatch[0])
            docType = String(j.docType || 'expense').toLowerCase()

            // Deterministic override: "Vendor Bill" or Bill To matches our company
            const hasVendorBill = /vendor\s+bill/i.test(text)
            const billToLower = String(((structured as any)?.labels?.billToName || (structured as any)?.billToName || '')).toLowerCase()
            const billToIsUs = billToLower && companyNames.some(n => n && billToLower.includes(n))
            if (hasVendorBill || billToIsUs) {
              docType = 'expense'
              setTypeConfirmed(true)
            } else {
              const confident = typeof j.confidence === 'number' ? (j.confidence >= CLASSIFY_THRESHOLD) : false
              setTypeConfirmed(confident)
            }

            setClassification({ docType: docType === 'invoice' ? 'invoice' : (docType === 'expense' ? 'expense' : 'other'), ourRole: docType === 'invoice' ? 'seller' : (docType === 'expense' ? 'buyer' : 'unknown'), policy: docType === 'invoice' ? 'REVENUE_RECOGNITION' : 'EXPENSE_MATCHING', confidence: j.confidence })
            if (docType === 'expense' && !vendor && j.vendorName) setVendor(String(j.vendorName))
          }
        }
      } catch (e) {}

      if (docType === 'invoice') {
        setMode('invoice')
        // Use AI to extract invoice fields
        try {
          // Inject company identity (non‑PII) to improve perspective detection
          let companyHint = ''
          try {
            const prof = await api.get('/api/company-profile')
            const nm = String(prof?.data?.legalName || '').trim()
            const aliases = Array.isArray(prof?.data?.aliases) ? prof.data.aliases.join(', ') : ''
            if (nm) companyHint = `\nMY COMPANY: ${nm}${aliases ? `\nALIASES: ${aliases}` : ''}`
          } catch (e) {}
          const prompt = `Extract INVOICE data from the text below. Return ONLY JSON with keys: {"customerName", "amount", "date", "dueDate", "invoiceNumber", "description", "paymentStatus"}.
Rules:
- Dates MUST be YYYY-MM-DD.
- If Amount Paid == Total or Balance Due == 0 → "paid"; if Amount Paid > Total → "overpaid"; if Amount Paid > 0 and Balance Due > 5 → "partial"; else "invoice".
Perspective: Determine if our company is the sender or recipient using the hints; if our company appears in 'Bill To', treat as EXPENSE document; if our company appears as 'From/Vendor', treat as INVOICE we sent.${companyHint}
TEXT:\n${text.slice(0, 12000)}`
          const { data } = await api.post('/api/ai/generate', { prompt }, { timeout: 60000 })
          const match = (data?.content || '').match(/\{[\s\S]*\}/)
          if (match) {
            const parsed = JSON.parse(match[0])
            if (parsed.customerName && !customer) setCustomer(parsed.customerName)
            if (parsed.amount && !amount) { setAmount(String(parsed.amount)); updateConf('amount', 0.75) }
            const toISO = (raw: string): string => {
              if (!raw || typeof raw !== 'string') return ''
              const s = raw.trim()
              const iso = s.match(/^\d{4}-\d{2}-\d{2}/)
              if (iso) return iso[0]
              const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
              if (mdy) { let m = +mdy[1], d = +mdy[2], y = +mdy[3]; if (y < 100) y = 2000 + y; return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` }
              const dt = new Date(s.replace(/(\d+)(st|nd|rd|th)/i, '$1'))
              if (!isNaN(dt.getTime())) { const y = dt.getFullYear(); const m = String(dt.getMonth()+1).padStart(2,'0'); const d = String(dt.getDate()).padStart(2,'0'); return `${y}-${m}-${d}` }
              return ''
            }
            const isoDate = toISO(parsed.date || '')
            const isoDue = toISO(parsed.dueDate || '')
            if (isoDate && !date) { setDate(isoDate); updateConf('date', 0.75) }
            if (isoDue && !dueDate) { setDueDate(isoDue); updateConf('dueDate', 0.75) }
            // Do NOT auto-set invoiceNumber from AI anymore; we'll suggest a unique pattern instead
            if (parsed.description && !notes) setNotes(parsed.description)
            if (parsed.paymentStatus) setStatus((parsed.paymentStatus as any) || 'invoice')
          }
        } catch (e) {}
        // Fallback: parse invoice number and dates directly from OCR text if still missing
        try {
          // do not set invoice number here; we'll set it after the form loads
          if (extractedText) {
            const toISO = (raw: string): string => {
              if (!raw || typeof raw !== 'string') return ''
              const s = raw.trim()
              const iso = s.match(/^\d{4}-\d{2}-\d{2}/)
              if (iso) return iso[0]
              const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
              if (mdy) { let m = +mdy[1], d = +mdy[2], y = +mdy[3]; if (y < 100) y = 2000 + y; return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` }
              const dt = new Date(s.replace(/(\d+)(st|nd|rd|th)/i, '$1'))
              if (!isNaN(dt.getTime())) { const y = dt.getFullYear(); const m = String(dt.getMonth()+1).padStart(2,'0'); const d = String(dt.getDate()).padStart(2,'0'); return `${y}-${m}-${d}` }
              return ''
            }
            if (!date) {
              const m = extractedText.match(/invoice\s*date[:\s]+([0-9\/\-]{6,10}|[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/i)
              if (m) { const iso = toISO(m[1]); if (iso) { setDate(iso); updateConf('date', 0.6) } }
            }
            if (!dueDate) {
              const m = extractedText.match(/due\s*date[:\s]+([0-9\/\-]{6,10}|[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/i)
              if (m) { const iso = toISO(m[1]); if (iso) { setDueDate(iso); updateConf('dueDate', 0.6) } }
            }
            if (!recognitionDate) {
              const m = extractedText.match(/revenue\s*recognition\s*date[:\s]+([0-9\/\-]{6,10}|[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/i)
              if (m) { const iso = toISO(m[1]); if (iso) setRecognitionDate(iso) }
            }
          }
        } catch (e) {}
      } else {
        setMode('expense')
        // AI-first extraction for expense fields
        try {
          let companyHint = ''
          try {
            const prof = await api.get('/api/company-profile')
            const nm = String(prof?.data?.legalName || '').trim()
            const aliases = Array.isArray(prof?.data?.aliases) ? prof.data.aliases.join(', ') : ''
            if (nm) companyHint = `\nMY COMPANY: ${nm}${aliases ? `\nALIASES: ${aliases}` : ''}`
          } catch (e) {}
          const ePrompt = `Extract EXPENSE data with confidences. Return ONLY JSON with keys: {"vendorName","amount","date","invoiceNumber","description","tax":{"enabled":boolean,"name":"Sales Tax","rate":number,"amount":number},"payments":{"amountPaid":number,"balanceDue":number},"confidences":{"vendorName":0..1,"amount":0..1,"date":0..1}}.
Rules for description:
- Provide a short audit-ready summary of goods/services or line items (max 120 chars).
- Prefer item names and service periods if present, e.g., "Business Internet 1Gbps — Service June 2025; Static IP /29".
- Do not include currency amounts.
Use hints to avoid picking our own company as vendor.${companyHint}
TEXT:\n${text.slice(0,12000)}`
          const { data } = await api.post('/api/ai/generate', { prompt: ePrompt }, { timeout: 60000 })
          const m = (data?.content || '').match(/\{[\s\S]*\}/)
          if (m) {
            const j = JSON.parse(m[0])
            if (j.vendorName && !vendor) setVendor(String(j.vendorName))
            // Prefer total including tax if provided
            if (j.tax && (typeof j.tax.amount === 'number')) {
              const amt = (typeof j.amount === 'number' ? j.amount : parseFloat(j.amount || '0'))
              const totalWithTax = Number.isFinite(amt) ? (amt + j.tax.amount) : undefined
              if (totalWithTax && !amount) setAmount(String(parseFloat(totalWithTax.toFixed(2))))
            } else if (j.amount && !amount) {
              setAmount(String(j.amount))
            }
            if (j.date && !date) {
              const toISO = (raw: string): string => {
                if (!raw || typeof raw !== 'string') return ''
                const s = raw.trim()
                const iso = s.match(/^\d{4}-\d{2}-\d{2}/)
                if (iso) return iso[0]
                const mdy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/)
                if (mdy) { let m = +mdy[1], d = +mdy[2], y = +mdy[3]; if (y < 100) y = 2000 + y; return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` }
                const cleaned = s.replace(/(\d+)(st|nd|rd|th)/i, '$1')
                const dt = new Date(cleaned)
                if (!isNaN(dt.getTime())) { const y = dt.getFullYear(); const m = String(dt.getMonth()+1).padStart(2,'0'); const d = String(dt.getDate()).padStart(2,'0'); return `${y}-${m}-${d}` }
                return ''
              }
              const iso = toISO(String(j.date))
              if (iso) setDate(iso)
            }
            if (j.description && !description) setDescription(String(j.description))
            // Capture AI-provided payment/tax hints for later preview/post
            try {
              const taxAmt = (j?.tax?.amount != null) ? Number(j.tax.amount) : undefined
              const amtPaid = (j?.payments?.amountPaid != null) ? Number(j.payments.amountPaid) : undefined
              const balDue = (j?.payments?.balanceDue != null) ? Number(j.payments.balanceDue) : undefined
              if (typeof taxAmt === 'number' || typeof amtPaid === 'number' || typeof balDue === 'number') {
                setNormalizedAmounts(prev => ({
                  subtotal: (prev?.subtotal != null ? prev?.subtotal : (typeof j.amount === 'number' ? j.amount : undefined)),
                  taxAmount: (typeof taxAmt === 'number' ? taxAmt : prev?.taxAmount),
                  total: (prev?.total != null ? prev.total : undefined),
                  amountPaid: (typeof amtPaid === 'number' ? amtPaid : prev?.amountPaid),
                  balanceDue: (typeof balDue === 'number' ? balDue : prev?.balanceDue)
                }))
              }
            } catch {}
            // If AI extracted a plausible invoice number, use it as initial VIN (user can edit)
            try {
              if (j.invoiceNumber && typeof j.invoiceNumber === 'string' && !vendorInvoiceNo) {
                setVendorInvoiceNo(String(j.invoiceNumber))
              }
            } catch {}
          }
        } catch (e) {}
        // Fallbacks if AI fails
        const lower = text.toLowerCase()
        if (!amount) {
          // Prefer a standalone 'Total' label; avoid matching 'Subtotal'
          const mTotalStrict = (text || '').match(/(^|[^a-z])total\b[\s:]*\$?\s*([-0-9,\.]+)/i)
          if (mTotalStrict && mTotalStrict[2]) {
            setAmount(mTotalStrict[2].replace(/,/g, ''))
          } else {
            const tot = (text || '').match(/total\s*[:]?[\s]*\$?[\s]*([-0-9,\.]+)/i)
          if (tot && tot[1]) setAmount(tot[1].replace(/,/g, ''))
          }
        }
        if (!date) {
          const iso = lower.match(/(\d{4}-\d{2}-\d{2})/)
          if (iso) setDate(iso[1])
        }
        if (!vendor) {
          const m = lower.match(/from\s*:?[\s]*([a-z0-9 &\-\.,]{3,80})/i)
          if (m && m[1]) setVendor(m[1].trim())
        }
      }
      if (!date) {
        const iso = lowerAll.match(/(\d{4}-\d{2}-\d{2})/)
        const mdy = lowerAll.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/)
        if (iso) setDate(iso[1])
        else if (mdy) {
          const p = mdy[1].split(/[\/-]/)
          const mm = p[0].padStart(2,'0'); const dd = p[1].padStart(2,'0'); let yy = p[2]
          if (yy.length === 2) yy = `20${yy}`
          setDate(`${yy}-${mm}-${dd}`)
        }
      }
      if (!description) {
        const derived = deriveDescriptionFromOcr(text)
        setDescription(derived || 'Expense captured via AI Document')
      }
      setOcrProgress(100)
      setStage('form')
    } catch (e: any) {
      setError(e?.message || 'Processing failed')
    } finally {
      setIsProcessing(false)
    }
  }

  // Auto-preview once we land on the form and fields are populated
  useEffect(() => {
    if (stage !== 'form') return
    const autoOk = (classification && typeof classification.confidence === 'number' && (classification.confidence as number) >= CLASSIFY_THRESHOLD) || typeConfirmed
    if (!autoOk) return
    if (preview) return
    // Attempt autopreview without user clicks when high confidence or confirmed
    doPreview().catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, typeConfirmed, classification?.confidence])

  // When entering form stage, ensure invoice number has a non-repeating suggestion (AR case)
  useEffect(() => {
    (async () => {
      if (stage !== 'form') return
      if (mode !== 'invoice') return
      if (invoiceNumber && invoiceNumber.trim()) return
      try {
        // Prefer sequential AR number; fall back to unique random if needed
        let suggestion = await TransactionsService.nextSequentialInvoiceNumber()
        if (!suggestion) suggestion = await TransactionsService.suggestInvoiceNumber()
        if (suggestion) setInvoiceNumber(suggestion)
      } catch {}
    })()
  }, [stage, mode])

  const checkDuplicate = async () => {
    try {
      setError(null)
      setDupState(null)
      if (!vendor.trim() || !vendorInvoiceNo.trim()) return
      setCheckingDup(true)
      const res = await ExpensesService.checkDuplicate(vendor.trim(), vendorInvoiceNo.trim())
      setDupState({ checked: true, duplicate: !!res?.duplicate, info: res?.expense })
    } catch (e) {
      // non-blocking
    } finally {
      setCheckingDup(false)
    }
  }

  const doPreview = async () => {
    try {
      setError(null)
      const allowWithoutConfirm = (classification && typeof classification.confidence === 'number' && (classification.confidence as number) >= CLASSIFY_THRESHOLD)
      if (!typeConfirmed && !allowWithoutConfirm) {
        setError('Please confirm the detected document type before previewing.')
        return
      }
      const inferredMode = (classification && String(classification.docType || '').toLowerCase() === 'invoice') ? 'invoice' : mode
      if (inferredMode === 'invoice') {
        const amt = parseFloat(amount)
        if (!customer.trim() || !amount || isNaN(amt) || amt <= 0 || !date) {
          const msg = 'Please fill Customer, Amount (>0), and Date'
          setError(msg); try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch (e) {}
          return
        }
        // Prefer server-normalized amounts; fallback to lightweight client parsing of OCR text
        let norm = normalizedAmounts || {}
        if (((!normalizedAmounts) || Object.values(normalizedAmounts || {}).every((v) => v == null)) && extractedText) {
          try {
            const raw = extractedText
            const number = `([0-9]+(?:[, .']*[0-9]{3})*(?:[.,][0-9]{1,2})?)`
            const parseNum = (s: string | null) => {
              if (!s) return undefined
              let n = s
              if (n.includes(',') && n.includes('.')) n = n.replace(/,/g, '')
              else if (n.includes(' ')) n = n.replace(/\s/g, '').replace(',', '.')
              else if (n.includes(',') && !n.includes('.')) {
                const parts = n.split(',')
                n = parts[parts.length - 1].length <= 2 ? n.replace(',', '.') : n.replace(/,/g, '')
              }
              const v = parseFloat(n)
              return Number.isFinite(v) ? parseFloat(v.toFixed(2)) : undefined
            }
            // First-pass patterns
            const mSubtotal = raw.match(new RegExp(`Subtotal[:\\s]*\\$?\\s*${number}`, 'i'))
            const mTax = raw.match(new RegExp(`Tax[^\\n]*[:\\s]*\\$?\\s*${number}`, 'i'))
            const mTotal = raw.match(new RegExp(`Total[:\\s]*\\$?\\s*${number}`, 'i'))
            const mPaid = raw.match(new RegExp(`Amount\\s*Paid[:\\s]*\\$?\\s*${number}`, 'i'))
            const mBalance = raw.match(new RegExp(`Balance\\s*Due[:\\s]*\\$?\\s*(-?${number})`, 'i'))
            norm = {
              subtotal: parseNum(mSubtotal?.[1] || null),
              taxAmount: parseNum(mTax?.[1] || null),
              total: parseNum(mTotal?.[1] || null),
              amountPaid: parseNum(mPaid?.[1] || null),
              balanceDue: parseNum(mBalance?.[1] || null)
            }
            // Second-pass patterns (more permissive) if anything missing
            if ([norm.subtotal, norm.taxAmount, norm.amountPaid, norm.balanceDue].every(v => v == null)) {
              const txt = raw.replace(/\u00A0/g, ' ')
              const grab = (label: string) => {
                const mm = txt.match(new RegExp(`${label}[\\s:]*\\$?\\s*([-0-9,\.]+)`, 'i'))
                return parseNum(mm?.[1] || null)
              }
              norm = {
                subtotal: grab('subtotal') ?? norm.subtotal,
                taxAmount: grab('tax') ?? norm.taxAmount,
                total: grab('total') ?? norm.total,
                amountPaid: grab('amount\\s*paid') ?? norm.amountPaid,
                balanceDue: grab('balance\\s*due') ?? norm.balanceDue
              }
            }
          } catch (e) {}
        }
        // Derive payment status/amounts if OCR provided values
        let amountPaidVal = typeof norm.amountPaid === 'number' ? norm.amountPaid : (status === 'paid' || status === 'overpaid' ? amt : (status === 'partial' ? Math.max(0, Math.round(amt * 0.5)) : 0))
        let balanceDueVal = typeof norm.balanceDue === 'number' ? norm.balanceDue : (amt - amountPaidVal)
        let paymentStatusVal = status
        if (typeof norm.amountPaid === 'number' || typeof norm.balanceDue === 'number') {
          if (amountPaidVal > amt + 0.01) paymentStatusVal = 'overpaid'
          else if (amountPaidVal > 0 && balanceDueVal > 0.01) paymentStatusVal = 'partial'
          else if (amountPaidVal <= 0.01) paymentStatusVal = 'invoice'
          else paymentStatusVal = 'paid'
        }
        // If revenue recognition date exists and is after invoice date or the OCR mentions deferred/billed-not-paid, treat as prepaid
        try {
          const recOk = recognitionDate && date && (new Date(recognitionDate).getTime() > new Date(date).getTime())
          const mentionsDeferred = /deferred|billed\s*not\s*paid|unearned/i.test(extractedText || '')
          if ((recOk || mentionsDeferred) && amountPaidVal > 0) {
            paymentStatusVal = 'prepaid'
          }
        } catch (e) {}
        const payload: any = {
          customerName: customer.trim(),
          amount: amt,
          amountPaid: amountPaidVal,
          balanceDue: balanceDueVal,
          date,
          description: notes || `Invoice for ${customer.trim()}`,
          invoiceNumber,
          paymentStatus: paymentStatusVal,
          subtotal: typeof norm.subtotal === 'number' ? norm.subtotal : undefined,
          taxSettings: (typeof norm.taxAmount === 'number') ? { enabled: true, amount: norm.taxAmount } : undefined,
          ocrText: extractedText,
          categoryKey: 'PROFESSIONAL_SERVICES'
        }
        const res = await ExpensesService.previewExpense(payload)
        setPreview(res)
      } else {
        const amt = parseFloat(amount)
        if (!vendor.trim() || !amount || isNaN(amt) || amt <= 0 || !date) {
          const msg = 'Please fill Vendor, Amount (>0), and Date'
          setError(msg); try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch (e) {}
          return
        }
        // Use normalized amounts to compute amountPaid/overpayment when available
        let norm = normalizedAmounts || {}
        if (((!normalizedAmounts) || Object.values(normalizedAmounts || {}).every((v) => v == null)) && extractedText) {
          try {
            const raw = extractedText.replace(/\u00A0/g, ' ')
            const number = `([0-9]+(?:[, .']*[0-9]{3})*(?:[.,][0-9]{1,2})?)`
            const parseNum = (s: string | null): number | undefined => {
              if (!s) return undefined
              let n = s
              if (n.includes(',') && n.includes('.')) n = n.replace(/,/g, '')
              else if (n.includes(' ')) n = n.replace(/\s/g, '').replace(',', '.')
              else if (n.includes(',') && !n.includes('.')) {
                const parts = n.split(',')
                n = parts[parts.length - 1].length <= 2 ? n.replace(',', '.') : n.replace(/,/g, '')
              }
              const v = parseFloat(n)
              return Number.isFinite(v) ? parseFloat(v.toFixed(2)) : undefined
            }
            const mSubtotal = raw.match(new RegExp(`\\bSubtotal\\b[\\s:]*\\$?\\s*(-?${number})`, 'i'))
            const mTax = raw.match(new RegExp(`\\b(?:Tax|VAT)\\b[^\n$]*\\$?\\s*(-?${number})`, 'i'))
            const mTotal = raw.match(new RegExp(`\\bTotal\\b[\\s:]*\\$?\\s*(-?${number})`, 'i'))
            const mPaid = raw.match(new RegExp(`\\b(?:Amount\\s*Paid|Payments?\\s*Made)\\b[\\s:\\-]*\\$?\\s*(-?${number})`, 'i'))
            const mBalance = raw.match(new RegExp(`\\bBalance\\s*Due\\b[\\s:]*\\$?\\s*(-?${number})`, 'i'))
            norm = {
              subtotal: parseNum(mSubtotal?.[1] || null),
              taxAmount: parseNum(mTax?.[1] || null),
              total: parseNum(mTotal?.[1] || null),
              amountPaid: parseNum(mPaid?.[1] || null),
              balanceDue: parseNum(mBalance?.[1] || null)
            }
            if (norm.total == null && typeof norm.subtotal === 'number' && typeof norm.taxAmount === 'number') {
              norm.total = parseFloat(((norm.subtotal as number) + (norm.taxAmount as number)).toFixed(2))
            }
          } catch (e) {}
        }
        const totalUsed = typeof (norm as any).total === 'number' ? (norm as any).total as number : amt
        let amountPaidVal = typeof (norm as any).amountPaid === 'number' ? (norm as any).amountPaid as number : totalUsed
        // If credit available is mentioned and amountPaid missing, try to infer from total+credit
        if (extractedText && (norm as any).amountPaid == null) {
          try {
            const mCredit = extractedText.match(/\bCredit\s*(?:Available|Memo)\b[\s:]*\$?\s*(-?[0-9,\.]+)/i)
            if (mCredit) {
              const clean = parseFloat(mCredit[1].replace(/,/g, ''))
              if (Number.isFinite(clean)) amountPaidVal = Math.max(0, totalUsed + clean)
            }
          } catch {}
        }
        const balanceDueVal = parseFloat((totalUsed - amountPaidVal).toFixed(2))
        const epsilon = 0.01
        let paymentStatusVal: any = 'paid'
        if (amountPaidVal > totalUsed + epsilon) paymentStatusVal = 'overpaid'
        else if (Math.abs(balanceDueVal) <= epsilon) paymentStatusVal = 'paid'
        else if (amountPaidVal > epsilon && balanceDueVal > epsilon) paymentStatusVal = 'partial'
        else paymentStatusVal = 'invoice'

        const payload: any = { vendorName: vendor.trim(), amount: totalUsed, amountPaid: amountPaidVal, balanceDue: balanceDueVal, date, paymentStatus: paymentStatusVal, description, ocrText: extractedText }
        if (typeof (norm as any).taxAmount === 'number' && (norm as any).taxAmount > 0) {
          payload.taxSettings = { enabled: true, amount: (norm as any).taxAmount }
        }
        const res = await ExpensesService.previewExpense(payload)
        setPreview(res)
      }
    } catch (e: any) {
      setError(e?.message || 'Preview failed')
    }
  }

  const doPost = async () => {
    try {
      setSubmitting(true)
      setError(null)
      if (mode === 'invoice') {
        const amt = parseFloat(amount)
        const result = await TransactionsService.postInvoice({
          customerName: customer.trim(),
          amount: amt,
          date,
          description: notes || `Invoice for ${customer.trim()}`,
          invoiceNumber: invoiceNumber || undefined,
          paymentStatus: status
        })
        try {
          if (result && result.isExisting) {
            window.dispatchEvent(new CustomEvent('toast', { detail: { message: `Invoice #${invoiceNumber || ''} already exists. Opened existing record.`, type: 'info' } }))
          } else {
            window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Invoice created successfully', type: 'success' } }))
          }
        } catch {}
        try { window.dispatchEvent(new CustomEvent('data:refresh')) } catch {}
        onClose()
      } else {
      const amt = parseFloat(amount)
        // Derive totals, payments, and status at post time to capture tax and overpayments
        let norm = normalizedAmounts || {}
        if (((!normalizedAmounts) || Object.values(normalizedAmounts || {}).every((v) => v == null)) && extractedText) {
          try {
            const raw = extractedText.replace(/\u00A0/g, ' ')
            const number = `([0-9]+(?:[, .']*[0-9]{3})*(?:[.,][0-9]{1,2})?)`
            const parseNum = (s: string | null): number | undefined => {
              if (!s) return undefined
              let n = s
              if (n.includes(',') && n.includes('.')) n = n.replace(/,/g, '')
              else if (n.includes(' ')) n = n.replace(/\s/g, '').replace(',', '.')
              else if (n.includes(',') && !n.includes('.')) {
                const parts = n.split(',')
                n = parts[parts.length - 1].length <= 2 ? n.replace(',', '.') : n.replace(/,/g, '')
              }
              const v = parseFloat(n)
              return Number.isFinite(v) ? parseFloat(v.toFixed(2)) : undefined
            }
            const mSubtotal = raw.match(new RegExp(`\\bSubtotal\\b[\\s:]*\\$?\\s*(-?${number})`, 'i'))
            const mTax = raw.match(new RegExp(`\\b(?:Tax|VAT)\\b[^\n$]*\\$?\\s*(-?${number})`, 'i'))
            const mTotal = raw.match(new RegExp(`\\bTotal\\b[\\s:]*\\$?\\s*(-?${number})`, 'i'))
            const mPaid = raw.match(new RegExp(`\\b(?:Amount\\s*Paid|Payments?\\s*Made)\\b[\\s:\\-]*\\$?\\s*(-?${number})`, 'i'))
            const mBalance = raw.match(new RegExp(`\\bBalance\\s*Due\\b[\\s:]*\\$?\\s*(-?${number})`, 'i'))
            norm = {
              subtotal: parseNum(mSubtotal?.[1] || null),
              taxAmount: parseNum(mTax?.[1] || null),
              total: parseNum(mTotal?.[1] || null),
              amountPaid: parseNum(mPaid?.[1] || null),
              balanceDue: parseNum(mBalance?.[1] || null)
            }
            if (norm.total == null && typeof norm.subtotal === 'number' && typeof norm.taxAmount === 'number') {
              norm.total = parseFloat(((norm.subtotal as number) + (norm.taxAmount as number)).toFixed(2))
            }
          } catch {}
        }
        const totalWithTax = typeof (norm as any).total === 'number' ? (norm as any).total as number : amt
        let amountPaidVal = typeof (norm as any).amountPaid === 'number' ? (norm as any).amountPaid as number : totalWithTax
        // Infer from credit line if present
        if (extractedText && (norm as any).amountPaid == null) {
          try {
            const mCredit = extractedText.match(/\bCredit\s*(?:Available|Memo)\b[\s:]*\$?\s*(-?[0-9,\.]+)/i)
            if (mCredit) {
              const clean = parseFloat(mCredit[1].replace(/,/g, ''))
              if (Number.isFinite(clean)) amountPaidVal = Math.max(0, totalWithTax + clean)
            }
          } catch {}
        }
        const balanceDueVal = parseFloat((totalWithTax - amountPaidVal).toFixed(2))
        const epsilon = 0.01
        let paymentStatusVal: any = 'paid'
        if (amountPaidVal > totalWithTax + epsilon) paymentStatusVal = 'overpaid'
        else if (Math.abs(balanceDueVal) <= epsilon) paymentStatusVal = 'paid'
        else if (amountPaidVal > epsilon && balanceDueVal > epsilon) paymentStatusVal = 'partial'
        else paymentStatusVal = 'invoice'

        // Duplicate VIN guard if provided
        if (vendorInvoiceNo.trim()) {
          try {
            const res = await ExpensesService.checkDuplicate(vendor.trim(), vendorInvoiceNo.trim())
            if (res?.duplicate) {
              const msg = `Duplicate bill detected for ${vendor} with Vendor Invoice No. "${vendorInvoiceNo}"`
              setDupState({ checked: true, duplicate: true, info: res?.expense })
              setError(msg)
              try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch {}
              setSubmitting(false)
              return
            }
          } catch {}
        }

        const res = await ExpensesService.postExpense({ vendorName: vendor.trim(), vendorInvoiceNo: vendorInvoiceNo.trim() || undefined, amount: totalWithTax, amountPaid: amountPaidVal, balanceDue: balanceDueVal, date, paymentStatus: paymentStatusVal, description: description || `Expense: ${vendor.trim()}` })
        try {
          const expenseId = (res as any)?.expenseId || (res as any)?.expense?.id
          if (expenseId && selectedFile) {
            const attach = await ExpensesService.attachReceipt(expenseId, selectedFile)
            setAttachedReceiptUrl(attach?.expense?.receiptUrl || null)
          }
        } catch (e) {}
      }
      try { window.dispatchEvent(new CustomEvent('data:refresh')) } catch (e) {}
      resetAndClose()
    } catch (e: any) {
      const msg = e?.message || 'Post failed'
      setError(msg)
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch (e) {}
    } finally {
      setSubmitting(false)
    }
  }

  // Customer suggestions
  const handleCustomerChange = (val: string) => {
    setCustomer(val)
    setShowSuggest(true)
    if (!val || val.trim().length < 2) { setSuggestions([]); return }
    setLoadingSuggest(true)
    const q = val.trim()
    // debounce
    window.clearTimeout((handleCustomerChange as any)._t)
    ;(handleCustomerChange as any)._t = window.setTimeout(async () => {
      try {
        const res = await CustomersService.searchCustomers(q)
        setSuggestions(Array.isArray(res?.customers) ? res.customers : [])
      } catch (e) { setSuggestions([]) } finally { setLoadingSuggest(false) }
    }, 250)
  }
  const applySuggestion = (c: any) => { setCustomer(c?.name || ''); setShowSuggest(false) }

  return (
    <>
    <ModalPortal>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal-overlay absolute inset-0" onClick={resetAndClose} />
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} className="relative w-[96%] max-w-4xl" onClick={(e) => e.stopPropagation()}>
              <ThemedGlassSurface variant="light" className="p-0 glass-modal liquid-glass overflow-hidden" hover={false}>
                <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-primary/80 font-semibold">AI Import</div>
                    <div className="text-lg sm:text-xl font-semibold">AI Document</div>
                    <div className="text-xs text-secondary-contrast">Upload → Extract → Review → Post</div>
                  </div>
                  <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={resetAndClose}>✕</button>
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
                          <div className="text-xs text-secondary-contrast mt-1">{ocrProgress < 50 ? 'Extracting text…' : 'Analyzing…'}</div>
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
                      <div className="mb-3 text-sm">
                        <label className="flex flex-col gap-1 max-w-xs">
                          <span className="text-secondary-contrast">Document Type</span>
                          <select disabled={!manualEdit} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md disabled:opacity-60" value={mode} onChange={(e) => setMode(e.target.value as any)}>
                            <option value="invoice">Invoice (Revenue)</option>
                            <option value="expense">Expense (Vendor Bill)</option>
                            <option value="other">Other / Receipt</option>
                          </select>
                        </label>
                        {classification && (
                          <div className="mt-1 text-xs text-secondary-contrast">
                            Detected by AI: {(classification.docType || '').toLowerCase() === 'invoice' ? 'Invoice (Revenue)' : (classification.docType || '').toLowerCase() === 'expense' ? 'Expense (Vendor Bill)' : 'Other'}
                            {classification.policy ? ` • Policy: ${classification.policy}` : ''}
                            {typeof classification.confidence === 'number' ? ` • Confidence: ${(classification.confidence * 100).toFixed(0)}%` : ''}
                          </div>
                        )}
                        {/* Confidence Gate */}
                        {classification && (typeof classification.confidence === 'number') && (
                          <div className={`mt-2 text-xs rounded-md border px-3 py-2 ${ (classification.confidence as number) >= CLASSIFY_THRESHOLD ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/30 bg-amber-400/10 text-amber-300' }`}>
                            {(classification.confidence as number) >= CLASSIFY_THRESHOLD
                              ? 'Looks good. You can proceed to preview or post.'
                              : 'Low confidence. Please review fields and confirm type before previewing.'}
                            <div className="mt-1">
                              <label className="inline-flex items-center gap-2">
                                <input type="checkbox" className="accent-primary" checked={typeConfirmed} onChange={(e) => setTypeConfirmed(e.target.checked)} />
                                <span>I reviewed and confirm the detected document type.</span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                      {mode === 'invoice' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <label className="flex flex-col gap-1 relative">
                            <span className="text-secondary-contrast">Customer</span>
                            <input disabled={!manualEdit} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md disabled:opacity-60" value={customer} onChange={(e) => handleCustomerChange(e.target.value)} placeholder="Acme Corp" onFocus={() => setShowSuggest(true)} />
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
                            <input disabled={!manualEdit} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md disabled:opacity-60" value={amount} onChange={(e) => { setAmount(e.target.value); if (manualEdit) updateConf('amount', 1.0) }} placeholder="5000" />
                            {fieldConfidence.amount !== undefined && (
                              <div className={`${(fieldConfidence.amount as number) < 0.6 ? 'text-yellow-400' : 'text-secondary-contrast'} text-xs`}>Confidence: {Math.round((fieldConfidence.amount as number) * 100)}%</div>
                            )}
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-secondary-contrast">Date</span>
                            <input disabled={!manualEdit} type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md disabled:opacity-60" value={date} onChange={(e) => { setDate(e.target.value); if (manualEdit) updateConf('date', 1.0) }} />
                            {fieldConfidence.date !== undefined && (
                              <div className={`${(fieldConfidence.date as number) < 0.6 ? 'text-yellow-400' : 'text-secondary-contrast'} text-xs`}>Confidence: {Math.round((fieldConfidence.date as number) * 100)}%</div>
                            )}
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-secondary-contrast">Due Date</span>
                            <input disabled={!manualEdit} type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md disabled:opacity-60" value={dueDate} onChange={(e) => { setDueDate(e.target.value); if (manualEdit) updateConf('dueDate', 1.0) }} />
                            {fieldConfidence.dueDate !== undefined && (
                              <div className={`${(fieldConfidence.dueDate as number) < 0.6 ? 'text-yellow-400' : 'text-secondary-contrast'} text-xs`}>Confidence: {Math.round((fieldConfidence.dueDate as number) * 100)}%</div>
                            )}
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-secondary-contrast">Invoice #</span>
                            <input disabled={!manualEdit} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md disabled:opacity-60" value={invoiceNumber} onChange={(e) => { setInvoiceNumber(e.target.value); if (manualEdit) updateConf('invoiceNumber', 1.0) }} placeholder="INV-2025-001" />
                            {fieldConfidence.invoiceNumber !== undefined && (
                              <div className={`${(fieldConfidence.invoiceNumber as number) < 0.6 ? 'text-yellow-400' : 'text-secondary-contrast'} text-xs`}>Confidence: {Math.round((fieldConfidence.invoiceNumber as number) * 100)}%</div>
                            )}
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-secondary-contrast">Status</span>
                            <select disabled={!manualEdit} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md disabled:opacity-60" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                              <option value="invoice">Invoice (Unpaid)</option>
                              <option value="paid">Paid</option>
                              <option value="partial">Partial</option>
                              <option value="overpaid">Overpaid</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 sm:col-span-2">
                            <span className="text-secondary-contrast">Description</span>
                            <textarea disabled={!manualEdit} rows={3} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md disabled:opacity-60" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Line items, payment terms, etc." />
                          </label>
                        </div>
                      ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <label className="flex flex-col gap-1">
                          <span className="text-secondary-contrast">Vendor</span>
                            <input disabled={!manualEdit} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md disabled:opacity-60" value={vendor} onChange={(e) => { setVendor(e.target.value); setDupState(null) }} placeholder="Adobe, Uber…" />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-secondary-contrast">Amount</span>
                            <input disabled={!manualEdit} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md disabled:opacity-60" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="59.99" />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-secondary-contrast">Date</span>
                            <input disabled={!manualEdit} type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md disabled:opacity-60" value={date} onChange={(e) => setDate(e.target.value)} />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-secondary-contrast">Vendor Invoice No. (optional)</span>
                            <input disabled={!manualEdit} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md disabled:opacity-60" value={vendorInvoiceNo} onChange={(e) => { setVendorInvoiceNo(e.target.value); setDupState(null) }} onBlur={checkDuplicate} placeholder="#BILL-7002" />
                            {dupState?.duplicate && (
                              <div className="text-xs text-red-400 mt-1">Duplicate detected. A bill with this number already exists for this vendor.</div>
                            )}
                            {checkingDup && <div className="text-xs text-secondary-contrast mt-1">Checking duplicate...</div>}
                        </label>
                        <label className="flex flex-col gap-1 sm:col-span-2">
                          <span className="text-secondary-contrast">Description</span>
                            <textarea disabled={!manualEdit} rows={3} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md disabled:opacity-60" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes…" />
                        </label>
                      </div>
                      )}

                      {preview && (
                        <div className="mt-4 text-sm">
                          <div className="font-semibold mb-2">Account Mapping</div>
                          <div className="rounded-lg border border-white/10 overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-surface/60">
                                <tr>
                                  <th className="text-left px-3 py-2">Type</th>
                                  <th className="text-left px-3 py-2">Account</th>
                                  <th className="text-right px-3 py-2">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                            {preview.entries?.map((e: any, i: number) => (
                                  <tr key={i} className="border-t border-white/10">
                                    <td className="px-3 py-2 uppercase text-secondary-contrast">{(e.type || (e.debit ? 'debit' : 'credit'))}</td>
                                    <td className="px-3 py-2">{e.accountCode} — {e.accountName}</td>
                                    <td className="px-3 py-2 text-right">${Number(e.amount).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {preview.policy && (
                            <div className="mt-2 text-xs text-secondary-contrast">Policy: {preview.policy} • Date used: {preview.dateUsed || date}</div>
                          )}
                        </div>
                      )}

                      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
                      <div className="mt-4 flex flex-wrap gap-2 justify-end">
                        <button className="px-3 py-1.5 text-sm rounded-lg border transition backdrop-blur-glass bg-white/10 hover:bg-white/15 border-white/10 text-foreground" onClick={() => setStage('picker')}>Back</button>
                        <button disabled={submitting || (!!dupState?.duplicate)} className="px-3 py-1.5 text-sm rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-60" onClick={doPost}>{submitting ? 'Posting…' : (mode === 'invoice' ? 'Create Invoice' : 'Post Expense')}</button>
                        <button className="px-3 py-1.5 text-sm rounded-lg bg-white/10 border border-white/10 hover:bg-white/15" onClick={() => setRecurringOpen(true)}>Save as Recurring</button>
                        <button className="px-3 py-1.5 text-sm rounded-lg bg-white/5 border border-white/10" onClick={() => setManualEdit(v => !v)}>{manualEdit ? 'Disable Manual Edit' : 'Edit Manually'}</button>
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
    {recurringOpen && (
      <RecurringModal
        open={recurringOpen}
        onClose={() => setRecurringOpen(false)}
        seed={mode === 'invoice' ? { type: 'INVOICE', customerName: customer, amount: parseFloat(amount || '0'), description: notes || undefined } : { type: 'EXPENSE', vendorName: vendor, amount: parseFloat(amount || '0'), description: description || undefined }}
      />
    )}
    </>
  )
}


