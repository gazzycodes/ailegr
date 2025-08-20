import { useEffect, useState } from 'react'
import { motion, useScroll } from 'framer-motion'
import { useTheme } from '../../theme/ThemeProvider'
import { MessageCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ChatFabProps {
  onClick: () => void
  bottomOffset?: number // px
  shiftUp?: boolean // when main FAB is expanded, move chat up to avoid overlap
}

export default function ChatFab({ onClick, bottomOffset = 24, shiftUp = false }: ChatFabProps) {
  const { isDark } = useTheme()
  const { scrollY } = useScroll()
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    let last = 0
    let ticking = false

    const unsub = scrollY.onChange((y) => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const down = y > last
          const up = y < last
          if (down && y > 100) setIsVisible(false)
          else if (up || y < 50) setIsVisible(true)
          last = y
          ticking = false
        })
        ticking = true
      }
    })
    return unsub
  }, [scrollY])

  if (!isVisible) return null

  const effectiveBottom = bottomOffset + (shiftUp ? 120 : 0)
  return (
    <div className={cn('fixed right-6 z-[9999]')} style={{ bottom: effectiveBottom }}>
      <motion.button
        onClick={onClick}
        className="w-14 h-14 rounded-full flex items-center justify-center relative group shadow-lg hover:shadow-xl transition-all duration-300 backdrop-blur-xl overflow-hidden"
        style={{
          background: isDark
            ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.3) 0%, rgba(168, 85, 247, 0.2) 50%, rgba(124, 58, 237, 0.1) 100%)'
            : 'linear-gradient(135deg, rgba(124, 58, 237, 0.2) 0%, rgba(168, 85, 247, 0.15) 50%, rgba(124, 58, 237, 0.1) 100%)',
          backdropFilter: 'blur(20px)',
          border: isDark
            ? '1px solid rgba(124, 58, 237, 0.3)'
            : '1px solid rgba(124, 58, 237, 0.2)'
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <MessageCircle className="w-6 h-6 text-primary relative z-10" />
        <motion.div
          className="absolute inset-0 rounded-full bg-primary/20"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.15, 0], opacity: [0, 0.25, 0] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        />
        <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/30 to-transparent opacity-60 rounded-t-full" />
        <motion.div
          className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: isDark
              ? 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%)'
              : 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%)'
          }}
        />
        <div className="absolute inset-1 rounded-full bg-gradient-to-br from-primary/10 to-transparent" />
        <motion.div
          className="absolute -top-9 right-0 px-2 py-0.5 text-xs rounded bg-primary/20 text-primary border border-primary/30"
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: [6, 0, 6], opacity: [0, 1, 0] }}
          transition={{ duration: 2.4, repeat: Infinity }}
        >
          New
        </motion.div>
      </motion.button>
    </div>
  )
}


