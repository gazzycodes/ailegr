import { useEffect, useMemo, useRef, useState } from 'react'
import ProductsService, { type Product } from '../../services/productsService'
import { ThemedGlassSurface } from './ThemedGlassSurface'

type ProductPickerProps = {
  value?: Product | null
  onChange: (product: Product | null) => void
  placeholder?: string
  allowTypes?: Array<'service' | 'inventory'>
  compact?: boolean
  className?: string
}

export default function ProductPicker({ value, onChange, placeholder = 'Select product', allowTypes, compact, className }: ProductPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [overlayPos, setOverlayPos] = useState<{ top?: number; bottom?: number; left: number; width: number; height?: number; isSheet?: boolean }>({ left: 0, width: 0 })

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const data = await ProductsService.listProducts({ active: true })
        if (mounted) setItems(Array.isArray(data) ? data : [])
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const allow = new Set((allowTypes && allowTypes.length) ? allowTypes : ['service','inventory'])
    return items
      .filter(p => allow.has(p.type))
      .filter(p => q === '' || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q))
      .slice(0, 200)
  }, [items, query, allowTypes])

  useEffect(() => {
    if (!open) return
    const calc = () => {
      try {
        const btn = buttonRef.current
        if (!btn) return
        const r = btn.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        const margin = 8
        const parentWidth = vw - margin * 2
        const isSheet = vw <= 640
        const minW = Math.min(360, parentWidth)
        const maxW = Math.min(720, parentWidth)
        let panelWidth = Math.max(Math.min(Math.max(r.width, minW), maxW), 260)
        if (isSheet) {
          panelWidth = Math.max(280, Math.min(parentWidth, vw - margin * 2))
          const left = Math.max(margin, Math.min((vw - panelWidth) / 2, vw - margin - panelWidth))
          const sheetHeight = Math.min(Math.max(vh * 0.7, 320), vh - margin * 2)
          const top = Math.round(vh - sheetHeight - margin)
          setOverlayPos({ top, left, width: Math.round(panelWidth), height: Math.round(sheetHeight), isSheet: true })
          return
        }
        const top = Math.round(r.bottom + 6)
        const left = Math.max(margin, Math.min(r.left, vw - margin - panelWidth))
        const desiredHeight = Math.min(Math.max(vh * 0.6, 320), vh - margin * 2)
        const spaceBelow = Math.max(0, vh - (r.bottom + 6) - margin)
        const spaceAbove = Math.max(0, r.top - margin)
        if (spaceBelow >= 240 || spaceBelow >= spaceAbove) {
          const h = Math.max(240, Math.min(desiredHeight, spaceBelow))
          setOverlayPos({ top, left, width: Math.round(panelWidth), height: Math.round(h), isSheet: false })
        } else {
          const bottom = Math.round(vh - r.top + 6)
          const h = Math.max(240, Math.min(desiredHeight, spaceAbove))
          setOverlayPos({ bottom, left, width: Math.round(panelWidth), height: Math.round(h), isSheet: false })
        }
      } catch {}
    }
    calc()
    const onWin = () => calc()
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    return () => { window.removeEventListener('resize', onWin); window.removeEventListener('scroll', onWin, true) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (overlayRef.current && overlayRef.current.contains(t)) return
      if (buttonRef.current && buttonRef.current.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const display = value ? (value.sku ? `${value.name} — ${value.sku}` : value.name) : (placeholder || 'Select product')

  return (
    <div className={(compact ? 'inline-block ' : 'block ') + (className || '')}>
      <button
        ref={buttonRef}
        onClick={() => { setOpen(v => !v); setTimeout(() => setHighlightIndex(0), 0) }}
        className={(compact ? 'px-2 h-8 text-xs rounded-md ' : 'px-3 py-2 rounded-lg ') + 'text-left bg-white/10 border border-white/10 hover:bg-white/15 outline-none ' + (compact ? 'whitespace-nowrap truncate max-w-[min(52vw,320px)]' : 'w-full')}
      >
        {display}
      </button>
      {open && (
        <div
          ref={overlayRef}
          className="z-[100000] fixed"
          style={{ top: overlayPos.top, bottom: overlayPos.bottom, left: overlayPos.left, width: overlayPos.width, maxWidth: '96vw' }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return }
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIndex(i => Math.min((filtered.length - 1), Math.max(0, i + 1))) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIndex(i => Math.max(0, i - 1)) }
            if (e.key === 'Enter') { e.preventDefault(); const item = filtered[highlightIndex]; if (item) { onChange(item); setOpen(false) } }
          }}
        >
          <ThemedGlassSurface variant="light" className={(overlayPos.isSheet ? 'p-3 rounded-t-2xl mt-0 ' : 'mt-2 rounded-xl p-2 ') + 'w-full shadow-2xl'}>
            <div className="-mx-2 px-2 py-2 sticky top-0 bg-surface/60 backdrop-blur-md z-[1]">
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={query}
                  onChange={(e)=>{ setQuery(e.target.value); setHighlightIndex(0) }}
                  placeholder="Search products by name or SKU"
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none"
                />
                <button className="px-2 py-1 text-xs rounded-lg bg-white/10 border border-white/10" onClick={()=> setOpen(false)}>{overlayPos.isSheet ? 'Done' : 'Close'}</button>
              </div>
            </div>
            <div className="overflow-auto" style={{ maxHeight: (overlayPos.height ? `${overlayPos.height - 72}px` : (overlayPos.isSheet ? '68vh' : '56vh')) }}>
              {loading && <div className="text-sm text-secondary-contrast p-2">Loading products…</div>}
              {!loading && filtered.map((p, i) => (
                <button
                  key={p.id}
                  onMouseEnter={()=> setHighlightIndex(i)}
                  onClick={() => { onChange(p); setOpen(false) }}
                  className={'w-full text-left px-3 py-2 border-b border-white/5 hover:bg-white/10 ' + (i === highlightIndex ? 'bg-white/10' : '')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-secondary-contrast truncate">{p.sku || p.barcode || ''}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-secondary-contrast uppercase">{p.type}</span>
                      {p.price != null && <span className="text-xs">${Number(p.price).toFixed(2)}</span>}
                    </div>
                  </div>
                </button>
              ))}
              {!loading && filtered.length === 0 && (
                <div className="text-sm text-secondary-contrast p-2">No products found</div>
              )}
            </div>
            {value && (
              <div className="mt-2 flex gap-2">
                <button className="px-2 py-1 text-xs rounded-lg bg-white/10 border border-white/10" onClick={() => onChange(null)}>Clear</button>
              </div>
            )}
          </ThemedGlassSurface>
        </div>
      )}
    </div>
  )
}


