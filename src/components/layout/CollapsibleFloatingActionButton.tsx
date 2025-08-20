import { useState, useEffect } from 'react'
import { motion, AnimatePresence, useScroll } from 'framer-motion'
import { cn } from '../../lib/utils'
//
import { useTheme } from '../../theme/ThemeProvider'

interface FloatingAction {
  icon: string
  label: string
  action: () => void
  color?: string
}

interface CollapsibleFloatingActionButtonProps {
  actions: FloatingAction[]
  className?: string
  onExpandedChange?: (expanded: boolean) => void
}

export function CollapsibleFloatingActionButton({
  actions,
  className,
  onExpandedChange
}: CollapsibleFloatingActionButtonProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const { scrollY } = useScroll()
  const { isDark } = useTheme()

  // Smart scroll behavior - hide on scroll down, show on scroll up
  useEffect(() => {
    let lastScrollY = 0
    let ticking = false

    const unsubscribe = scrollY.onChange((latest) => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollingDown = latest > lastScrollY
          const scrollingUp = latest < lastScrollY
          
          // Hide when scrolling down past 100px
          if (scrollingDown && latest > 100) {
            setIsVisible(false)
            setIsExpanded(prev => {
              if (prev) onExpandedChange?.(false)
              return false
            }) // Also collapse when hiding
          }
          // Show when scrolling up or near top
          else if (scrollingUp || latest < 50) {
            setIsVisible(true)
          }
          
          lastScrollY = latest
          ticking = false
        })
        ticking = true
      }
    })
    return unsubscribe
  }, [scrollY])

  const toggleExpanded = () => {
    const next = !isExpanded
    setIsExpanded(next)
    onExpandedChange?.(next)
  }

  if (!isVisible) return null

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        y: 0 
      }}
      exit={{ opacity: 0, scale: 0.8, y: 20 }}
      className={cn(
        "fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3",
        className
      )}
    >
      {/* Expanded Action Buttons */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 25,
              staggerChildren: 0.1
            }}
            className="flex flex-col gap-3 relative z-[2]"
          >
            {actions.map((action, index) => (
              <motion.div
                key={action.label}
                initial={{ opacity: 0, x: 20, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.8 }}
                transition={{ delay: index * 0.05 }}
              >
                <motion.button
                  onClick={() => {
                    action.action()
                    setIsExpanded(prev => {
                      if (prev) onExpandedChange?.(false)
                      return false
                    }) // Collapse after action
                  }}
                  className={cn(
                    "group relative overflow-hidden",
                    "flex items-center gap-3 px-4 py-3 text-sm font-medium",
                    "bg-background/90 hover:bg-primary/10 transition-all duration-300",
                    "border border-border/30 rounded-xl",
                    "backdrop-blur-xl shadow-lg hover:shadow-xl",
                    "min-w-[160px] justify-start",
                    // Liquid glass effect
                    "before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/20 before:via-white/5 before:to-transparent before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-300"
                  )}
                  whileHover={{ scale: 1.02, x: -2 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    background: isDark
                      ? "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 50%, transparent 100%)"
                      : "linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.1) 100%)",
                    backdropFilter: "blur(20px)",
                    border: isDark
                      ? "1px solid rgba(255,255,255,0.1)"
                      : "1px solid rgba(0,0,0,0.1)"
                  }}
                >
                  <span className="text-lg relative z-10">{action.icon}</span>
                  <span className="text-foreground relative z-10">{action.label}</span>

                  {/* Enhanced liquid glass shimmer */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    layoutId={`hover-${action.label}`}
                  />

                  {/* Glass reflection effect */}
                  <div
                    className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/20 to-transparent opacity-60 rounded-t-xl"
                  />
                </motion.button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main FAB Button - FIXED styling */}
      <motion.button
        onClick={toggleExpanded}
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center relative group",
          "shadow-lg hover:shadow-xl transition-all duration-300",
          "backdrop-blur-xl overflow-hidden"
        )}
        style={{
          background: isDark
            ? "linear-gradient(135deg, rgba(124, 58, 237, 0.3) 0%, rgba(168, 85, 247, 0.2) 50%, rgba(124, 58, 237, 0.1) 100%)"
            : "linear-gradient(135deg, rgba(124, 58, 237, 0.2) 0%, rgba(168, 85, 247, 0.15) 50%, rgba(124, 58, 237, 0.1) 100%)",
          backdropFilter: "blur(20px)",
          border: isDark
            ? "1px solid rgba(124, 58, 237, 0.3)"
            : "1px solid rgba(124, 58, 237, 0.2)"
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        animate={{
          rotate: isExpanded ? 45 : 0,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        {/* Plus Icon */}
        <motion.div
          className="relative z-10"
          animate={{ rotate: isExpanded ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          <div className="w-6 h-0.5 bg-primary rounded-full" />
          <div className="w-0.5 h-6 bg-primary rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
        </motion.div>

        {/* Ripple effect on click */}
        <motion.div
          className="absolute inset-0 rounded-full bg-primary/20"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: isExpanded ? 1.2 : 0, opacity: isExpanded ? 0.3 : 0 }}
          transition={{ duration: 0.3 }}
        />

        {/* Enhanced liquid glass effects */}
        <div
          className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/30 to-transparent opacity-60 rounded-t-full"
        />

        <motion.div
          className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: isDark
              ? "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%)"
              : "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%)"
          }}
        />

        {/* Subtle inner glow */}
        <div className="absolute inset-1 rounded-full bg-gradient-to-br from-primary/10 to-transparent" />
      </motion.button>

      {/* Backdrop blur overlay when expanded */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/10 backdrop-blur-[1px] z-[1]"
            onClick={() => {
              setIsExpanded(false)
              onExpandedChange?.(false)
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
