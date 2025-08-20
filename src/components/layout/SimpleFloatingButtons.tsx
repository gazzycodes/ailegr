import { useState, useEffect } from 'react'
import { motion, useScroll } from 'framer-motion'
import { cn } from '../../lib/utils'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'

// Hook to detect viewport size
const useResponsiveLayout = () => {
  const [layout, setLayout] = useState({
    isMobile: false,
    isTablet: false,
    isDesktop: false,
  })

  useEffect(() => {
    const updateLayout = () => {
      const width = window.innerWidth
      setLayout({
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isDesktop: width >= 1024,
      })
    }

    updateLayout()
    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [])

  return layout
}

// Simple Floating Action Buttons Component
export const SimpleFloatingButtons = () => {
  const layout = useResponsiveLayout()
  const { scrollY } = useScroll()
  const [isVisible, setIsVisible] = useState(true)

  // Smart scroll behavior - hide on scroll down, show on scroll up
  useEffect(() => {
    if (layout.isMobile) {
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
    }
  }, [layout.isMobile, scrollY])

  const actionButtons = [
    {
      icon: "💰",
      label: "Quick Transaction",
      action: () => console.log("Quick Transaction"),
    },
    {
      icon: "🤖",
      label: "AI Insights",
      action: () => console.log("AI Insights"),
    },
    {
      icon: "🎯",
      label: "Set Goals",
      action: () => console.log("Set Goals"),
    }
  ]

  if (!isVisible) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={cn(
        "fixed z-[9999]",
        layout.isMobile
          ? "bottom-4 left-4 right-4"
          : "bottom-4 right-4"
      )}
    >
      {layout.isMobile ? (
        /* Mobile - Horizontal scrollable buttons */
        <ThemedGlassSurface variant="medium" className="p-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {actionButtons.map((button) => (
              <motion.button
                key={button.label}
                onClick={button.action}
                className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center text-lg transition-all duration-200"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title={button.label}
              >
                {button.icon}
              </motion.button>
            ))}
          </div>
        </ThemedGlassSurface>
      ) : (
        /* Desktop - Vertical stack */
        <div className="flex flex-col gap-3">
          {actionButtons.map((button, index) => (
            <motion.div
              key={button.label}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <ThemedGlassSurface variant="medium" className="w-14 h-14 rounded-full p-0 shadow-lg">
                <button
                  onClick={button.action}
                  className="w-full h-full rounded-full flex items-center justify-center text-xl bg-primary/10 hover:bg-primary/20 transition-all duration-200 hover:scale-110"
                  title={button.label}
                >
                  {button.icon}
                </button>
              </ThemedGlassSurface>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
