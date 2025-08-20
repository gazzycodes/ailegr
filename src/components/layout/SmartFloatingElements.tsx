import { useState, useEffect, ReactNode } from 'react'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import { cn } from '../../lib/utils'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'



interface FloatingToolbarProps {
  children: ReactNode
  position?: 'top' | 'bottom' | 'right' | 'left'
  className?: string
  collapsible?: boolean
}

interface AdaptiveLayoutProps {
  children: ReactNode
  floatingElements?: ReactNode
  className?: string
}

interface FloatingElementProps {
  children: ReactNode
  position: 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left'
  priority: number
  className?: string
  offset?: { x: number; y: number }
  hideOnScroll?: boolean
  adaptToContent?: boolean
}

interface SmartFloatingElementsProps {
  children: ReactNode
  className?: string
}

// Hook to detect viewport size and content layout
const useResponsiveLayout = () => {
  const [layout, setLayout] = useState({
    isMobile: false,
    isTablet: false,
    isDesktop: false,
    contentWidth: 0,
    contentHeight: 0,
    hasFloatingElements: false
  })

  useEffect(() => {
    const updateLayout = () => {
      const width = window.innerWidth
      const height = window.innerHeight

      setLayout({
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isDesktop: width >= 1024,
        contentWidth: width,
        contentHeight: height,
        hasFloatingElements: true
      })
    }

    updateLayout()
    window.addEventListener('resize', updateLayout)

    return () => window.removeEventListener('resize', updateLayout)
  }, [])

  return layout
}

// Hook to detect content overlap and adjust positioning
const useContentAwareness = () => {
  const [contentBounds, setContentBounds] = useState<DOMRect[]>([])
  const [shouldAdjustLayout, setShouldAdjustLayout] = useState(false)

  useEffect(() => {
    const updateContentBounds = () => {
      // Find all important content elements
      const importantElements = document.querySelectorAll(
        '[data-important], .financial-metric-card, .chart-container, .important-content, [class*="grid"]'
      )

      const bounds = Array.from(importantElements).map(el =>
        el.getBoundingClientRect()
      )

      setContentBounds(bounds)

      // Check if we need to adjust layout based on content density
      const viewportHeight = window.innerHeight
      const contentDensity = bounds.length / (viewportHeight / 100)
      setShouldAdjustLayout(contentDensity > 5) // Adjust if content is dense
    }

    updateContentBounds()

    // Use intersection observer for better performance
    const observer = new IntersectionObserver(() => {
      updateContentBounds()
    }, { threshold: 0.1 })

    // Observe important elements
    document.querySelectorAll('[data-important], .financial-metric-card').forEach(el => {
      observer.observe(el)
    })

    window.addEventListener('resize', updateContentBounds)
    window.addEventListener('scroll', updateContentBounds)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateContentBounds)
      window.removeEventListener('scroll', updateContentBounds)
    }
  }, [])

  return { contentBounds, shouldAdjustLayout }
}

// Responsive Floating Toolbar Component
const ResponsiveFloatingToolbar: React.FC<FloatingToolbarProps> = ({
  children,
  position: _position = 'right',
  className,
  collapsible = true
}) => {
  const layout = useResponsiveLayout()
  const { shouldAdjustLayout } = useContentAwareness()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const { scrollY } = useScroll()

  // Auto-collapse on mobile or when content is dense
  useEffect(() => {
    if (layout.isMobile || shouldAdjustLayout) {
      setIsCollapsed(true)
    } else {
      setIsCollapsed(false)
    }
  }, [layout.isMobile, shouldAdjustLayout])

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

  const getPositionStyles = () => {
    if (layout.isMobile) {
      const style: React.CSSProperties = {
        position: 'fixed',
        bottom: 20,
        right: 16,
        zIndex: 1000,
        transform: isCollapsed ? 'scale(0.9)' : 'scale(1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end'
      }
      return style
    }

    if (layout.isTablet) {
      const style: React.CSSProperties = {
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: 1000
      }
      return style
    }

    // Desktop - improved positioning to avoid conflicts
    const style: React.CSSProperties = {
      position: 'fixed',
      right: shouldAdjustLayout ? 16 : 24,
      bottom: shouldAdjustLayout ? 16 : 24,
      zIndex: 1000
    }
    return style
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          style={getPositionStyles()}
          className={cn(
            'transition-all duration-300',
            className
          )}
        >
          {/* Mobile Collapsible Interface */}
          {layout.isMobile && collapsible ? (
            <div className="relative">
              {/* Main Toggle Button with Enhanced Liquid Glass */}
              <motion.div
                className="relative w-16 h-16"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 25
                }}
              >
                <ThemedGlassSurface
                  variant="heavy"
                  className="w-full h-full rounded-full p-0 shadow-2xl border border-primary/30"
                  style={{
                    background: 'linear-gradient(135deg, rgba(var(--color-primary-500), 0.15) 0%, rgba(var(--color-primary-600), 0.05) 100%)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    boxShadow: '0 8px 32px rgba(var(--color-primary-500), 0.2), inset 0 1px 0 rgba(255,255,255,0.2)'
                  }}
                >
                  <motion.button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="w-full h-full rounded-full flex items-center justify-center text-2xl font-medium text-foreground transition-all duration-200 relative group"
                    style={{ overflow: 'hidden' }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {/* Enhanced background gradient - properly contained */}
                    <div
                      className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent opacity-80 group-hover:opacity-100 transition-opacity"
                      style={{ borderRadius: 'inherit' }}
                    />

                    {/* Subtle inner glow - properly contained */}
                    <div
                      className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent opacity-60 group-hover:opacity-80 transition-opacity"
                      style={{ borderRadius: 'inherit' }}
                    />

                    {/* Animated + symbol */}
                    <motion.div
                      animate={{ rotate: isCollapsed ? "0deg" : "45deg" }}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 20
                      }}
                      className="relative z-10 font-semibold text-primary group-hover:text-primary-foreground transition-colors"
                    >
                      +
                    </motion.div>
                  </motion.button>
                </ThemedGlassSurface>
              </motion.div>

              {/* Expanded Content Panel with Liquid Glass */}
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.8 }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 25,
                      duration: 0.3
                    }}
                    className="absolute bottom-16 right-0 w-auto max-w-[calc(100vw-32px)]"
                  >
                    <ThemedGlassSurface variant="heavy" className="p-3 shadow-2xl bg-background/95 backdrop-blur-xl border border-border/50">
                      <div className="flex flex-row gap-3 items-center justify-end">
                        {children}
                      </div>
                    </ThemedGlassSurface>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            /* Desktop/Tablet - Always Visible Container with Liquid Glass */
            <ThemedGlassSurface variant="medium" className="p-3">
              <div className="flex flex-col gap-2">
                {children}
              </div>
            </ThemedGlassSurface>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Adaptive Layout Component that adjusts content based on floating elements
const AdaptiveLayout: React.FC<AdaptiveLayoutProps> = ({
  children,
  floatingElements,
  className
}) => {
  const layout = useResponsiveLayout()
  const { shouldAdjustLayout } = useContentAwareness()
  const [contentPadding, setContentPadding] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  })

  useEffect(() => {
    // Calculate dynamic padding based on floating elements and screen size
    let padding = { top: 0, right: 0, bottom: 0, left: 0 }

    if (layout.isMobile) {
      padding = {
        top: 80, // Space for mobile header/navigation
        right: 20, // Minimal space for floating elements
        bottom: 80, // Space for floating action buttons
        left: 16
      }
    } else if (layout.isTablet) {
      padding = {
        top: 80, // Space for tablet header/navigation
        right: 24, // Minimal space for floating elements
        bottom: 80,
        left: 24
      }
    } else {
      // Desktop - account for sidebar and floating elements
      padding = {
        top: 32,
        right: 32, // Just normal margin, no excessive space
        bottom: 100, // Space for floating buttons (voice + quick actions)
        left: 32 // Sidebar margin is handled by main element
      }
    }

    setContentPadding(padding)
  }, [layout, shouldAdjustLayout])

  return (
    <div className={cn('relative min-h-screen', className)}>
      {/* Main content with adaptive padding */}
      <motion.div
        className="main-content transition-all duration-300 ease-out"
        style={{
          paddingTop: `${contentPadding.top}px`,
          paddingRight: `${contentPadding.right}px`,
          paddingBottom: `${contentPadding.bottom}px`,
          paddingLeft: `${contentPadding.left}px`
        }}
        layout
      >
        {children}
      </motion.div>

      {/* Floating elements container */}
      {floatingElements && (
        <div className="floating-elements-container">
          {floatingElements}
        </div>
      )}
    </div>
  )
}

// Smart positioning algorithm
const calculateSmartPosition = (
  position: FloatingElementProps['position'],
  priority: number,
  offset: { x: number; y: number } = { x: 0, y: 0 }
) => {
  const basePositions = {
    'top-right': { top: 24 + offset.y, right: 24 + offset.x },
    'bottom-right': { bottom: 24 + offset.y, right: 24 + offset.x },
    'bottom-left': { bottom: 24 + offset.y, left: 24 + offset.x },
    'top-left': { top: 24 + offset.y, left: 24 + offset.x }
  }

  const finalPosition = { ...basePositions[position] }

  // Adjust position based on priority and content awareness
  const priorityOffset = (5 - priority) * 80 // Higher priority = less offset

  if (position.includes('right') && 'right' in finalPosition) {
    finalPosition.right = (finalPosition.right || 24) + priorityOffset
  }
  if (position.includes('bottom') && 'bottom' in finalPosition) {
    finalPosition.bottom = (finalPosition.bottom || 24) + priorityOffset
  }

  return finalPosition
}

export const FloatingElement = ({
  children,
  position,
  priority,
  className,
  offset = { x: 0, y: 0 },
  hideOnScroll = false
}: FloatingElementProps) => {
  const { scrollY } = useScroll()

  // Hide on scroll if specified
  const opacity = useTransform(
    scrollY,
    [0, 100],
    hideOnScroll ? [1, 0] : [1, 1]
  )

  // Calculate smart position
  const smartPosition = calculateSmartPosition(
    position,
    priority,
    offset
  )
  
  // Responsive adjustments
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  // Mobile positioning adjustments
  const mobileAdjustments = isMobile ? {
    ...smartPosition,
    right: 'right' in smartPosition && smartPosition.right ? Math.max(smartPosition.right - 8, 12) : undefined,
    bottom: 'bottom' in smartPosition && smartPosition.bottom ? Math.max(smartPosition.bottom - 8, 12) : undefined,
    top: 'top' in smartPosition && smartPosition.top ? Math.max(smartPosition.top - 8, 12) : undefined,
    left: 'left' in smartPosition && smartPosition.left ? Math.max(smartPosition.left - 8, 12) : undefined,
  } : smartPosition
  
  return (
    <motion.div
      className={cn(
        "fixed z-40 transition-all duration-300 ease-out",
        `priority-${priority}`, // For CSS targeting if needed
        className
      )}
      style={{
        ...mobileAdjustments,
        opacity: hideOnScroll ? opacity : 1,
        zIndex: 40 + priority // Higher priority = higher z-index
      }}
      initial={{ 
        opacity: 0, 
        scale: 0.8,
        y: position.includes('bottom') ? 20 : -20
      }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        y: 0
      }}
      exit={{ 
        opacity: 0, 
        scale: 0.8,
        y: position.includes('bottom') ? 20 : -20
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        duration: 0.4
      }}
      whileHover={{
        scale: 1.05,
        transition: { duration: 0.2 }
      }}
    >
      {children}
    </motion.div>
  )
}

export const SmartFloatingElements = ({ 
  children, 
  className 
}: SmartFloatingElementsProps) => {
  return (
    <div className={cn("relative", className)}>
      {children}
      
      {/* Minimal responsive padding to prevent content overlap */}
      <style>{`
        @media (max-width: 768px) {
          .main-content {
            padding-right: 20px;
            padding-bottom: 100px;
          }
        }

        @media (min-width: 769px) {
          .main-content {
            padding-right: 32px;
            padding-bottom: 100px;
          }
        }
      `}</style>
    </div>
  )
}

// Utility component for grouping floating elements
export const FloatingGroup = ({
  children,
  className,
  spacing = 16
}: {
  children: ReactNode
  className?: string
  spacing?: number
}) => {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        "transition-all duration-300 ease-out",
        className
      )}
      style={{ gap: spacing }}
    >
      {children}
    </div>
  )
}

// Pre-configured floating elements for common use cases
export const FloatingThemeSwitch = ({ children }: { children: ReactNode }) => (
  <FloatingElement position="top-right" priority={5} hideOnScroll={false}>
    {children}
  </FloatingElement>
)

export const FloatingVoiceCommand = ({ children }: { children: ReactNode }) => (
  <FloatingElement position="top-right" priority={4} offset={{ x: 60, y: 0 }}>
    {children}
  </FloatingElement>
)

export const FloatingActionButtons = ({ children }: { children: ReactNode }) => (
  <ResponsiveFloatingToolbar position="bottom" collapsible={true}>
    <FloatingGroup spacing={12}>
      {children}
    </FloatingGroup>
  </ResponsiveFloatingToolbar>
)

// Enhanced responsive floating elements
export const ResponsiveFloatingMenu = ({
  children,
  className
}: {
  children: ReactNode
  className?: string
}) => {
  const layout = useResponsiveLayout()

  return (
    <ResponsiveFloatingToolbar
      position={layout.isMobile ? 'bottom' : 'right'}
      collapsible={layout.isMobile}
      className={className}
    >
      {children}
    </ResponsiveFloatingToolbar>
  )
}

// Export all components
export {
  ResponsiveFloatingToolbar,
  AdaptiveLayout,
  useResponsiveLayout,
  useContentAwareness
}
