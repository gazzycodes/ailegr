import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ThemedGlassSurface } from './ThemedGlassSurface'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
  variant?: 'invoice' | 'revenue' | 'expense' | 'default'
  icon?: string
}

export function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onClose(toast.id), toast.duration ?? 3000)
    return () => clearTimeout(t)
  }, [toast.id])

  const palette = (() => {
    const v = toast.variant || 'default'
    if (v === 'revenue') return { main: 'var(--color-financial-revenue)', border: 'rgba(16,185,129,0.35)' }
    if (v === 'expense') return { main: 'var(--color-financial-expense)', border: 'rgba(239,68,68,0.35)' }
    if (v === 'invoice') return { main: 'var(--color-primary-500)', border: 'rgba(139,92,246,0.35)' }
    // fallback by type
    if (toast.type === 'success') return { main: 'var(--color-financial-revenue)', border: 'rgba(16,185,129,0.35)' }
    if (toast.type === 'error') return { main: 'var(--color-financial-expense)', border: 'rgba(239,68,68,0.35)' }
    return { main: 'var(--color-primary-500)', border: 'rgba(139,92,246,0.35)' }
  })()

  const bgStyle = {
    background: `linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 60%, transparent 100%)`,
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    borderColor: palette.border,
    boxShadow: `0 10px 25px rgba(0,0,0,0.25), 0 0 0 1px ${palette.border}`
  } as React.CSSProperties

  const accentStyle = { background: `rgb(${palette.main})` } as React.CSSProperties

  const icon = toast.icon || (toast.variant === 'revenue' ? '💰' : toast.variant === 'expense' ? '💳' : toast.variant === 'invoice' ? '🧾' : (toast.type === 'error' ? '⚠️' : toast.type === 'success' ? '✅' : 'ℹ️'))

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
    >
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl z-10 pointer-events-none" style={accentStyle} />
        <ThemedGlassSurface
          variant="light"
          className={`pl-5 pr-4 py-3 rounded-xl border relative`}
          hover={false}
          style={bgStyle}
        >
          <div className="flex items-start gap-3">
            <div className="text-base leading-none mt-0.5" aria-hidden="true">{icon}</div>
            <div className="text-sm font-medium">{toast.message}</div>
          </div>
        </ThemedGlassSurface>
      </div>
    </motion.div>
  )
}

export default function ToastContainer({ toasts, onClose }: { toasts: Toast[]; onClose: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-[99999] flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onClose={onClose} />
        ))}
      </AnimatePresence>
    </div>
  )
}


