import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ThemedGlassSurface } from './ThemedGlassSurface'
import InfoHint from './InfoHint'
import ReportsService from '../../services/reportsService'

type CoaSelectorProps = {
  value?: string
  onChange: (accountCode: string | undefined) => void
  allowedTypes: Array<'REVENUE' | 'EXPENSE' | 'COGS' | 'ASSET' | 'LIABILITY' | 'EQUITY'>
  label?: string
  placeholder?: string
  disabled?: boolean
  warningText?: string
  hint?: string
  variant?: 'default' | 'compact'
  className?: string
}

export default function CoaSelector({ value, onChange, allowedTypes, label, placeholder, disabled, warningText, hint, variant = 'default', className }: CoaSelectorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState<Array<{ code: string; name: string; type: string; normalBalance: string }>>([])
  const [loading, setLoading] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState<number>(0)
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const [overlayPos, setOverlayPos] = useState<{ top?: number; bottom?: number; left: number; width: number; height?: number; isSheet?: boolean }>({ top: 0, left: 0, width: 0, isSheet: false })

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const data = await ReportsService.getChartOfAccounts()
        const list: Array<any> = Array.isArray(data?.accounts) ? data.accounts : (Array.isArray(data) ? data : [])
        const flat = list.map((a: any) => ({ code: a.code, name: a.name, type: a.type, normalBalance: a.normalBalance }))
        if (mounted) setAccounts(flat)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const filtered = useMemo(() => {
    const tset = new Set(allowedTypes.map(t => String(t).toUpperCase()))
    const q = query.trim().toLowerCase()
    return accounts
      .filter(a => tset.has(String(a.type).toUpperCase()) || (String(a.type).toUpperCase() === 'EXPENSE' && tset.has('COGS') && a.code.startsWith('50')))
      .filter(a => q === '' || a.code.includes(q) || a.name.toLowerCase().includes(q))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [accounts, allowedTypes, query])

  // Default safe subset: exclude control/system and parent headers; users can opt-in to full COA
  const visible = useMemo(() => {
    if (showAdvanced) return filtered
    const controlCodes = new Set(['1010','1200','2010','2150','1360','2050'])
    return filtered.filter(a => !controlCodes.has(String(a.code)) && !(String(a.code).length === 4 && String(a.code).endsWith('00')))
  }, [filtered, showAdvanced])

  const selected = useMemo(() => accounts.find(a => a.code === value), [accounts, value])

  // Recalculate overlay position when opened or on viewport changes
  useEffect(() => {
    if (!open) return
    const calc = () => {
      try {
        const btn = buttonRef.current
        if (!btn) return
        const r = btn.getBoundingClientRect()
        // Try to constrain inside the nearest modal surface
        let modalRect: DOMRect | null = null
        try {
          const modal = btn.closest('.glass-modal') as HTMLElement | null
          if (modal) modalRect = modal.getBoundingClientRect()
        } catch {}
        const margin = 8
        const vw = window.innerWidth
        const vh = window.innerHeight
        const leftBound = (modalRect ? modalRect.left : margin) + margin
        const rightBound = (modalRect ? modalRect.right : vw - margin) - margin
        // Responsive width limits (do not exceed modal)
        const parentWidth = (modalRect ? (modalRect.width - margin * 2) : (vw - margin * 2))
        const minW = Math.min(360, parentWidth)
        const maxW = Math.min(720, parentWidth)
        let panelWidth = Math.max(Math.min(Math.max(r.width, minW), maxW), 240)
        // Decide if we should render as a mobile sheet
        const isSheet = vw <= 640 || parentWidth < 420
        if (isSheet) {
          panelWidth = Math.max(280, Math.min(parentWidth, vw - margin * 2))
          const left = Math.max(leftBound, Math.min((modalRect ? modalRect.left + (modalRect.width - panelWidth) / 2 : (vw - panelWidth) / 2), rightBound - panelWidth))
          const sheetHeight = Math.min(Math.max(vh * 0.68, 360), vh - margin * 2)
          const top = Math.round(vh - sheetHeight - margin)
          setOverlayPos({ top, left, width: Math.round(panelWidth), height: Math.round(sheetHeight), isSheet: true })
          return
        }
        // Popover placement with smart flip
        let left = Math.max(leftBound, Math.min(r.left, rightBound - panelWidth))
        const desiredHeight = Math.min(Math.max(vh * 0.56, 320), vh - margin * 2)
        const spaceBelow = Math.max(0, vh - (r.bottom + 6) - margin)
        const spaceAbove = Math.max(0, r.top - margin)
        if (spaceBelow >= 240 || spaceBelow >= spaceAbove) {
          const top = Math.round(r.bottom + 6)
          const h = Math.max(240, Math.min(desiredHeight, spaceBelow))
          setOverlayPos({ top, left: Math.round(left), width: Math.round(panelWidth), height: Math.round(h), isSheet: false })
        } else {
          const bottom = Math.round(vh - r.top + 6)
          const h = Math.max(240, Math.min(desiredHeight, spaceAbove))
          setOverlayPos({ bottom, left: Math.round(left), width: Math.round(panelWidth), height: Math.round(h), isSheet: false })
        }
      } catch {}
    }
    calc()
    const onWin = () => calc()
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [open])

  // Click-outside to close
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    if (overlayPos.isSheet) document.body.style.overflow = 'hidden'
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (overlayRef.current && overlayRef.current.contains(t)) return
      if (buttonRef.current && buttonRef.current.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => { document.removeEventListener('mousedown', onDoc); document.body.style.overflow = prevOverflow }
  }, [open, overlayPos.isSheet])

  const isCompact = variant === 'compact'
  const buttonText = selected ? `${selected.code}${selected.name ? ` — ${selected.name}` : ''}` : (placeholder || 'Account')

  return (
    <div ref={containerRef} className={(isCompact ? 'inline-block ' : 'w-full ') + (className || '') + ' relative'}>
      {!isCompact && label && (
        <div className="text-xs text-secondary-contrast mb-1 flex items-center gap-1">
          <span>{label}</span>
          {hint && <InfoHint label={label}>{hint}</InfoHint>}
        </div>
      )}
      <button
        ref={buttonRef}
        disabled={disabled}
        onClick={() => { setOpen(v => !v); setTimeout(() => setHighlightIndex(0), 0) }}
        className={(isCompact ? 'px-2 h-8 text-xs rounded-md ' : 'px-3 py-2 rounded-lg ') + 'text-left bg-white/10 border border-white/10 hover:bg-white/15 outline-none ' + (isCompact ? 'whitespace-nowrap truncate max-w-[min(52vw,320px)]' : 'w-full')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {buttonText}
      </button>
      {open && createPortal((
        <div
          ref={overlayRef}
          className="z-[100000]"
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return }
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIndex(i => Math.min((filtered.length - 1), Math.max(0, i + 1))) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIndex(i => Math.max(0, i - 1)) }
            if (e.key === 'Enter') { e.preventDefault(); const acc = filtered[highlightIndex]; if (acc) { onChange(acc.code); setOpen(false) } }
          }}
          style={{ position: 'fixed', top: overlayPos.top, bottom: overlayPos.bottom, left: overlayPos.left, width: overlayPos.width, maxWidth: '96vw' }}
        >
          <ThemedGlassSurface
            variant="light"
            className={(overlayPos.isSheet ? 'p-3 rounded-t-2xl mt-0 ' : 'mt-2 rounded-xl p-2 ') + 'w-full shadow-2xl'}
          >
            <div className="sticky top-0 z-[1] -mx-2 px-2 py-2 bg-surface/60 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <input autoFocus value={query} onChange={e=>{ setQuery(e.target.value); setHighlightIndex(0) }} placeholder="Search by code or name" className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none" />
                <button className="px-2 py-1 text-xs rounded-lg bg-white/10 border border-white/10" onClick={()=> setOpen(false)}>{overlayPos.isSheet ? 'Done' : 'Close'}</button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={showAdvanced} onChange={(e)=>{ setShowAdvanced(e.target.checked); setHighlightIndex(0) }} />
                  <span>Show advanced</span>
                </label>
                <div className="text-[11px] text-amber-400">Be careful to prevent misposting.</div>
              </div>
              {warningText && <div className="text-xs text-amber-400 mt-2">{warningText}</div>}
            </div>
            <div className="overflow-auto" style={{ maxHeight: (overlayPos.height ? `${overlayPos.height - 72}px` : (overlayPos.isSheet ? '68vh' : '56vh')) }} role="listbox" aria-label="Chart of Accounts">
              {loading && <div className="text-sm text-secondary-contrast p-2">Loading accounts…</div>}
              {!loading && visible.map((acc, i) => (
                <button
                  key={acc.code}
                  onMouseEnter={()=> setHighlightIndex(i)}
                  onClick={() => { onChange(acc.code); setOpen(false) }}
                  className={"w-full text-left px-3 py-2 border-b border-white/5 hover:bg-white/10 " + (i === highlightIndex ? 'bg-white/10' : '')}
                  role="option"
                  aria-selected={i === highlightIndex}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium truncate">{acc.code} — {acc.name}</div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-secondary-contrast uppercase">{acc.type}</span>
                  </div>
                </button>
              ))}
              {!loading && visible.length === 0 && (
                <div className="text-sm text-secondary-contrast p-2">No accounts found</div>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <button className="px-2 py-1 text-xs rounded-lg bg-white/10 border border-white/10" onClick={() => { onChange(undefined); setOpen(false) }}>Reset to AI</button>
            </div>
          </ThemedGlassSurface>
        </div>
      ), document.body)}
    </div>
  )
}


