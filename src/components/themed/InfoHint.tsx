import { useState } from 'react'

export default function InfoHint({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="inline-flex items-center gap-1 relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span className="text-secondary-contrast select-none">{label}</span>
      <span className="w-4 h-4 rounded-full bg-white/10 text-secondary-contrast flex items-center justify-center text-[10px] cursor-default">?</span>
      {open && (
        <span className="absolute z-[50] top-full mt-1 left-0 max-w-xs text-xs bg-surface/95 border border-white/10 backdrop-blur-md rounded px-2 py-1 shadow">
          {children}
        </span>
      )}
    </span>
  )
}


