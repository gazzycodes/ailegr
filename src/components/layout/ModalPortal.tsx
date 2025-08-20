import React, { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'

interface ModalPortalProps {
  children: React.ReactNode
}

export const ModalPortal: React.FC<ModalPortalProps> = ({ children }) => {
  const container = useMemo(() => {
    const el = document.createElement('div')
    el.setAttribute('data-modal-root', '')
    return el
  }, [])

  useEffect(() => {
    document.body.appendChild(container)
    return () => {
      try {
        document.body.removeChild(container)
      } catch {}
    }
  }, [container])

  return createPortal(children, container)
}

export default ModalPortal


