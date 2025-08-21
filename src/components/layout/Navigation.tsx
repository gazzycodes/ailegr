import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  LayoutDashboard, 
  Globe, 
  ArrowUpDown, 
  FileText, 
  Settings,
  TrendingUp,
  Activity,
  Zap
} from 'lucide-react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { cn } from '../../lib/utils'
import { useTheme } from '../../theme/ThemeProvider'

interface NavigationProps {
  currentView: string
  onViewChange: (view: any) => void
  businessHealth: number
}

interface NavItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  badge?: string
}

const navItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Command Center',
    icon: LayoutDashboard,
    description: 'Financial mission control',
    badge: 'AI'
  },
  {
    id: 'universe',
    label: 'Financial Universe',
    icon: Globe,
    description: '3D data exploration',
    badge: '3D'
  },
  {
    id: 'transactions',
    label: 'Transaction Flow',
    icon: ArrowUpDown,
    description: 'Liquid money movement',
    badge: 'LIVE'
  },
  {
    id: 'reports',
    label: 'Intelligence Reports',
    icon: FileText,
    description: 'AI-powered insights'
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: Activity,
    description: 'Manage clients'
  },
  {
    id: 'settings',
    label: 'System Config',
    icon: Settings,
    description: 'Customize your universe'
  }
]

export function Navigation({ 
  currentView, 
  onViewChange, 
  businessHealth
}: NavigationProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const { currentTheme, isDark } = useTheme()

  // Get health status indicator
  const getHealthStatus = () => {
    if (businessHealth >= 80) return { label: 'Thriving', color: 'text-green-400', icon: '🚀' }
    if (businessHealth >= 60) return { label: 'Stable', color: 'text-blue-400', icon: '📈' }
    if (businessHealth >= 40) return { label: 'Cautious', color: 'text-yellow-400', icon: '⚠️' }
    return { label: 'Critical', color: 'text-red-400', icon: '🔴' }
  }

  const healthStatus = getHealthStatus()

  // Navigation item animation variants
  const itemVariants = {
    hidden: { opacity: 0, x: -20, scale: 0.95 },
    visible: (i: number) => ({
      opacity: 1,
      x: 0,
      scale: 1,
      transition: {
        delay: i * 0.1,
        duration: 0.4,
        ease: [0.23, 1, 0.32, 1]
      }
    }),
    hover: {
      scale: 1.05,
      x: 8,
      transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] }
    }
  }

  return (
    <div className={cn(
      "fixed left-2 md:left-4 top-1/2 -translate-y-1/2 z-40 transition-all duration-500",
      isExpanded ? "w-72" : "w-16"
    )}>
      {/* Main Navigation Panel */}
      <ThemedGlassSurface
        variant="medium"
        elevation={2}
        className="h-auto w-full flex flex-col z-40 transition-all duration-500 ease-out breathe"
      >
        {/* Navigation Header */}
        <div className="p-4 border-b border-border/20">
          <motion.button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center gap-3 text-left group"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center group-hover:from-primary/30 group-hover:to-primary/20 transition-all">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="overflow-hidden"
                >
                  <div className={cn(
                    "text-sm font-bold text-gradient-primary",
                    currentTheme === 'blue' && "theme-blue",
                    currentTheme === 'green' && "theme-green"
                  )}>
                    EZE Ledger
                  </div>
                  <div className="text-xs text-secondary-contrast">
                    Revolutionary AI
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Business Health Indicator */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-4 border-b border-border/20"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-lg">{healthStatus.icon}</span>
                <div className="flex-1">
                  <div className={cn("text-sm font-medium", !isDark ? "text-foreground/90" : healthStatus.color)}>
                    {healthStatus.label}
                  </div>
                  <div className={cn("text-xs", isDark ? "text-muted-contrast" : "text-foreground/60") }>
                    Health Score: {businessHealth.toFixed(0)}%
                  </div>
                </div>
              </div>
              
              {/* Health Bar */}
              <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    businessHealth >= 80 && "bg-gradient-to-r from-green-500 to-emerald-400",
                    businessHealth >= 60 && businessHealth < 80 && "bg-gradient-to-r from-blue-500 to-indigo-400",
                    businessHealth >= 40 && businessHealth < 60 && "bg-gradient-to-r from-yellow-500 to-orange-400",
                    businessHealth < 40 && "bg-gradient-to-r from-red-500 to-pink-400"
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${businessHealth}%` }}
                  transition={{ duration: 1, ease: [0.23, 1, 0.32, 1] }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation Items */}
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item, index) => {
            const Icon = item.icon
            const isActive = currentView === item.id
            const isHovered = hoveredItem === item.id

            return (
              <motion.div
                key={item.id}
                custom={index}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                whileHover="hover"
                className="relative"
              >
                <button
                  onClick={() => { onViewChange(item.id); if (isExpanded) setIsExpanded(false) }}
                  onMouseEnter={() => setHoveredItem(item.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200",
                    "group relative overflow-hidden",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : isDark
                        ? "hover:bg-surface/50 text-muted-contrast hover:text-primary-contrast"
                        : "text-foreground/90 hover:text-primary hover:bg-surface/70"
                  )}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="activeIndicator"
                      className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full"
                      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                    />
                  )}

                  {/* Hover glow effect */}
                  {isHovered && (
                    <motion.div
                      className="absolute inset-0 bg-primary/5 rounded-lg"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.2 }}
                    />
                  )}

                  {/* Icon with breathing effect */}
                  <div className={cn(
                    "w-6 h-6 flex items-center justify-center relative z-10",
                    isActive && "animate-pulse"
                  )}>
                    <Icon className={cn("w-5 h-5", !isActive && !isDark && "text-foreground/90 group-hover:text-primary")} />
                  </div>

                  {/* Label and description */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="flex-1 text-left overflow-hidden relative z-10"
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn("text-sm font-medium", !isDark && "text-foreground/90") }>
                            {item.label}
                          </span>
                          {item.badge && (
                            <span className={cn("px-1.5 py-0.5 text-xs rounded", isDark ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary/90") }>
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <div className={cn("text-xs", isDark ? "text-muted-contrast" : "text-foreground/60") }>
                          {item.description}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>

                {/* Tooltip for collapsed state */}
                <AnimatePresence>
                  {!isExpanded && isHovered && (
                    <motion.div
                      initial={{ opacity: 0, x: -10, scale: 0.9 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -10, scale: 0.9 }}
                      className="absolute left-16 top-1/2 -translate-y-1/2 z-50"
                    >
                      <ThemedGlassSurface
                        variant="heavy"
                        className="px-3 py-2 text-sm whitespace-nowrap"
                      >
                        <div className="font-medium text-primary-contrast">{item.label}</div>
                        <div className="text-xs text-muted-contrast">
                          {item.description}
                        </div>
                      </ThemedGlassSurface>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </nav>

        {/* Bottom Status */}
        <div className="p-4 border-t border-border/20">
          <AnimatePresence>
            {isExpanded ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2 text-xs text-muted-contrast">
                  <Activity className="w-3 h-3" />
                  <span>Real-time sync active</span>
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-contrast">
                  <TrendingUp className="w-3 h-3" />
                  <span>Performance: 60 FPS</span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex justify-center"
              >
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ThemedGlassSurface>

      {/* Invisible backdrop for mobile - completely transparent to preserve glass effect */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 md:hidden"
            style={{
              // Completely transparent - only serves as click target
              background: 'transparent',
              backdropFilter: 'none'
            }}
            onClick={() => setIsExpanded(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
