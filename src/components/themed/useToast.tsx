import { useCallback, useState } from 'react'
import { Toast } from './Toast'

export default function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((message: string, type: Toast['type'] = 'info', duration = 3000, variant: Toast['variant'] = 'default', icon?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts(prev => [...prev, { id, message, type, duration, variant, icon }])
  }, [])

  return { toasts, push, remove }
}


