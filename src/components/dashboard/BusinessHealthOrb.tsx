import React, { useRef, useEffect, useState } from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'
import { Heart, Shield, TrendingUp, AlertTriangle } from 'lucide-react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { useTheme } from '../../theme/ThemeProvider'
import { cn } from '../../lib/utils'

interface BusinessHealthOrbProps {
  healthScore: number // 0-100
  metrics: {
    revenue: { current: number; previous: number; trend: 'up' | 'down'; change: number }
    expenses: { current: number; previous: number; trend: 'up' | 'down'; change: number }
    profit: { current: number; previous: number; trend: 'up' | 'down'; change: number }
    cashFlow: { current: number; previous: number; trend: 'up' | 'down'; change: number }
  }
}

interface HealthIndicator {
  score: number
  label: string
  color: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  pulse: boolean
}

export function BusinessHealthOrb({ healthScore, metrics }: BusinessHealthOrbProps) {
  const orbRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [, _setMousePosition] = useState({ x: 0, y: 0 })
  const { currentTheme } = useTheme()

  // Determine if there is any real data
  const noData = [
    metrics?.revenue?.current,
    metrics?.expenses?.current,
    metrics?.profit?.current,
    metrics?.cashFlow?.current
  ].every((v) => !(Number.isFinite(v) && Number(v) !== 0))

  const effectiveScore = noData ? 0 : healthScore

  // Animated health score
  const animatedScore = useSpring(0, {
    stiffness: 100,
    damping: 30
  })

  useEffect(() => {
    animatedScore.set(effectiveScore)
  }, [effectiveScore])

  // Transform score to rotation for the orb (slower rotation)
  useTransform(animatedScore, [0, 100], [0, 360])
  useTransform(animatedScore, [0, 100], [0.9, 1.1])

  // Enhanced theme-aware health status
  const getHealthStatus = (): HealthIndicator => {
    if (noData) {
      return {
        score: 0,
        label: 'Getting Started',
        color: currentTheme === 'blue'
          ? 'from-blue-400 via-indigo-500 to-blue-600'
          : currentTheme === 'green'
          ? 'from-teal-400 via-cyan-500 to-teal-600'
          : 'from-violet-400 via-purple-500 to-violet-600',
        icon: Shield,
        description: 'Add your first transaction to compute health',
        pulse: false
      }
    }
    if (effectiveScore >= 80) {
      return {
        score: effectiveScore,
        label: 'Thriving',
        color: currentTheme === 'green' 
          ? 'from-emerald-400 via-green-500 to-emerald-600'
          : currentTheme === 'blue'
          ? 'from-emerald-400 via-teal-500 to-cyan-500'
          : 'from-emerald-400 via-green-500 to-emerald-600',
        icon: TrendingUp,
        description: 'Your business is performing exceptionally well',
        pulse: true
      }
    } else if (effectiveScore >= 60) {
      return {
        score: effectiveScore,
        label: 'Stable',
        color: currentTheme === 'blue'
          ? 'from-blue-400 via-indigo-500 to-blue-600'
          : currentTheme === 'green'
          ? 'from-teal-400 via-cyan-500 to-teal-600'
          : currentTheme === 'light'
          ? 'from-indigo-400 via-purple-500 to-indigo-600'
          : 'from-violet-400 via-purple-500 to-violet-600',
        icon: Shield,
        description: 'Solid performance with room for growth',
        pulse: false
      }
    } else if (effectiveScore >= 40) {
      return {
        score: effectiveScore,
        label: 'Cautious',
        color: currentTheme === 'green'
          ? 'from-yellow-400 via-amber-500 to-orange-500'
          : 'from-amber-400 via-yellow-500 to-orange-500',
        icon: AlertTriangle,
        description: 'Some areas need attention',
        pulse: true
      }
    } else {
      return {
        score: effectiveScore,
        label: 'Critical',
        color: currentTheme === 'blue'
          ? 'from-red-400 via-rose-500 to-pink-500'
          : 'from-red-400 via-red-500 to-rose-500',
        icon: Heart,
        description: 'Immediate action required',
        pulse: true
      }
    }
  }

  const healthStatus = getHealthStatus()
  const Icon = healthStatus.icon

  // Mouse tracking for 3D effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (orbRef.current) {
        const rect = orbRef.current.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        
        _setMousePosition({
          x: (e.clientX - centerX) / rect.width,
          y: (e.clientY - centerY) / rect.height
        })
      }
    }

    if (isHovered) {
      document.addEventListener('mousemove', handleMouseMove)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
    }
  }, [isHovered])

  // Calculate individual metric health scores
  const getMetricHealth = (metric: typeof metrics.revenue) => {
    const cur = Number(metric?.current) || 0
    const prev = Number(metric?.previous) || 0
    let change = Number(metric?.change)
    if (!Number.isFinite(change)) {
      if (prev === 0) change = 0
      else change = ((cur - prev) / Math.abs(prev)) * 100
    }
    const trend = (metric?.trend as any) || (change >= 0 ? 'up' : 'down')
    const delta = Math.abs(change)
    const base = 50
    const growthScore = trend === 'up' ? Math.min(100, base + delta) : Math.max(0, base - delta)
    return Number.isFinite(growthScore) ? Math.round(growthScore) : 0
  }

  const metricHealthScores = {
    revenue: getMetricHealth(metrics.revenue),
    expenses: 100 - getMetricHealth(metrics.expenses), // Invert for expenses (lower is better)
    profit: getMetricHealth(metrics.profit),
    cashFlow: getMetricHealth(metrics.cashFlow)
  }

  return (
    <ThemedGlassSurface 
      variant="medium" 
      glow={true}
      className="p-6 h-full relative"
    >
      {/* Enhanced Header */}
      <div className="flex items-center gap-3 mb-6">
        <motion.div 
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shadow-lg",
            "bg-gradient-to-br border border-white/20",
            healthStatus.color
          )}
          whileHover={{ scale: 1.1, rotate: 5 }}
          transition={{ type: "spring", stiffness: 400, damping: 10 }}
        >
          <Icon className="w-5 h-5 text-white drop-shadow-lg" />
        </motion.div>
        <div>
          <h3 className="text-xl font-bold text-primary-contrast mb-1">Business Health</h3>
          <p className="text-sm text-secondary-contrast">Real-time wellness monitoring</p>
        </div>
      </div>

      {/* Main Health Orb */}
      <div className="flex flex-col items-center space-y-6">
        <motion.div
          ref={orbRef}
          className="relative w-36 h-36 cursor-pointer"
          onHoverStart={() => setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
          whileHover={{
            scale: 1.05,
            rotateX: 5,
            rotateY: 5,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          {/* Enhanced Orb Glow with Theme Colors */}
          <motion.div
            className={cn(
              "absolute inset-0 rounded-full blur-2xl",
              `bg-gradient-to-br ${healthStatus.color}`,
              healthStatus.pulse && "animate-pulse"
            )}
            animate={{
              scale: isHovered ? 1.3 : 1.1,
              opacity: isHovered ? 0.6 : 0.4,
            }}
            transition={{ duration: 0.3 }}
          />

          {/* Main Orb with Enhanced Colors */}
          <motion.div
            className={cn(
              "relative w-full h-full rounded-full border-4",
              "backdrop-blur-sm shadow-2xl overflow-hidden",
              `bg-gradient-to-br ${healthStatus.color}`,
              currentTheme === 'light' ? 'border-white/30' : 'border-white/20'
            )}
            animate={{
              rotate: isHovered ? 360 : 0,
              boxShadow: isHovered 
                ? `0 0 60px rgba(139, 92, 246, 0.6), 0 0 100px rgba(139, 92, 246, 0.3)`
                : `0 0 30px rgba(139, 92, 246, 0.3)`
            }}
            transition={{ 
              rotate: { duration: 2, ease: "easeInOut" },
              boxShadow: { duration: 0.3 }
            }}
          >
            {/* Inner light effect */}
            <div className="absolute inset-2 rounded-full bg-white/10 backdrop-blur-sm" />
            
            {/* Enhanced Score display */}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="text-center text-white"
                animate={{ scale: isHovered ? 1.15 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <motion.div
                  className="text-5xl font-black tracking-tight leading-none"
                  style={{ fontWeight: 900 }}
                  animate={{
                    textShadow: isHovered
                      ? "0 0 40px rgba(255,255,255,1), 0 0 80px rgba(255,255,255,0.7), 0 0 120px rgba(255,255,255,0.4)"
                      : "0 0 20px rgba(255,255,255,0.8), 0 0 40px rgba(255,255,255,0.4)"
                  }}
                  transition={{ duration: 0.3 }}
                >
                  {noData ? 'N/A' : Math.round(animatedScore.get())}
                </motion.div>
                <motion.div 
                  className="text-xs font-bold opacity-95 uppercase tracking-widest mt-1"
                  animate={{
                    textShadow: isHovered
                      ? "0 0 20px rgba(255,255,255,0.8)"
                      : "0 0 10px rgba(255,255,255,0.5)"
                  }}
                >
                  SCORE
                </motion.div>
              </motion.div>
            </div>

            {/* Floating particles */}
            {Array.from({ length: 8 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 bg-white/40 rounded-full"
                animate={{
                  x: [
                    Math.cos((i * Math.PI * 2) / 8) * 40,
                    Math.cos((i * Math.PI * 2) / 8 + Math.PI) * 40,
                    Math.cos((i * Math.PI * 2) / 8) * 40
                  ],
                  y: [
                    Math.sin((i * Math.PI * 2) / 8) * 40,
                    Math.sin((i * Math.PI * 2) / 8 + Math.PI) * 40,
                    Math.sin((i * Math.PI * 2) / 8) * 40
                  ],
                  opacity: [0.1, 0.4, 0.1]
                }}
                transition={{
                  duration: 8 + i * 1,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                style={{
                  left: '50%',
                  top: '50%',
                  marginLeft: '-2px',
                  marginTop: '-2px'
                }}
              />
            ))}
          </motion.div>

          {/* Orbital rings */}
          {[1, 2, 3].map((ring) => (
            <motion.div
              key={ring}
              className="absolute inset-0 rounded-full border border-white/10"
              style={{
                width: `${100 + ring * 20}%`,
                height: `${100 + ring * 20}%`,
                left: `${-ring * 10}%`,
                top: `${-ring * 10}%`
              }}
              animate={{
                rotate: [0, ring % 2 === 0 ? -360 : 360]
              }}
              transition={{
                duration: 20 + ring * 5,
                repeat: Infinity,
                ease: "linear"
              }}
            />
          ))}
        </motion.div>

        {/* Enhanced Health Status */}
        <div className="text-center">
          <motion.h4
            className={cn(
              "text-2xl font-bold mb-2 bg-gradient-to-r bg-clip-text text-transparent",
              healthStatus.score >= 80 && (
                currentTheme === 'green' 
                  ? "from-emerald-400 to-green-500"
                  : currentTheme === 'blue'
                  ? "from-emerald-400 to-teal-500"
                  : "from-emerald-400 to-green-500"
              ),
              healthStatus.score >= 60 && healthStatus.score < 80 && (
                currentTheme === 'blue'
                  ? "from-blue-400 to-indigo-500"
                  : currentTheme === 'green'
                  ? "from-teal-400 to-cyan-500"
                  : currentTheme === 'light'
                  ? "from-indigo-400 to-purple-500"
                  : "from-violet-400 to-purple-500"
              ),
              healthStatus.score >= 40 && healthStatus.score < 60 && "from-amber-400 to-orange-500",
              healthStatus.score < 40 && "from-red-400 to-rose-500"
            )}
            animate={{ 
              scale: isHovered ? 1.05 : 1,
              textShadow: isHovered ? "0 0 20px rgba(139, 92, 246, 0.5)" : "0 0 0px rgba(139, 92, 246, 0)"
            }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            {healthStatus.label}
          </motion.h4>
          <p className="text-sm text-secondary-contrast max-w-[220px] mx-auto leading-relaxed">
            {healthStatus.description}
          </p>
        </div>

        {/* Enhanced Theme-Aware Metric Health Indicators */}
        <div className="w-full space-y-3">
          {Object.entries(metricHealthScores).map(([key, score], index) => {
            const getMetricGradient = (score: number) => {
              if (score >= 80) {
                return currentTheme === 'green' 
                  ? "from-emerald-400 via-green-500 to-emerald-600"
                  : currentTheme === 'blue'
                  ? "from-emerald-400 via-teal-500 to-cyan-500"
                  : "from-emerald-400 via-green-500 to-emerald-600"
              } else if (score >= 60) {
                return currentTheme === 'blue'
                  ? "from-blue-400 via-indigo-500 to-blue-600"
                  : currentTheme === 'green'
                  ? "from-teal-400 via-cyan-500 to-teal-600"
                  : currentTheme === 'light'
                  ? "from-indigo-400 via-purple-500 to-indigo-600"
                  : "from-violet-400 via-purple-500 to-violet-600"
              } else if (score >= 40) {
                return "from-amber-400 via-yellow-500 to-orange-500"
              } else {
                return "from-red-400 via-red-500 to-rose-500"
              }
            }

            return (
              <motion.div 
                key={key} 
                className={cn(
                  "flex items-center justify-between p-3 rounded-xl backdrop-blur-sm border transition-all duration-300 cursor-pointer",
                  "bg-gradient-to-r from-white/5 to-white/10",
                  currentTheme === 'light' ? "border-white/20 hover:border-white/30" : "border-white/10 hover:border-white/20",
                  "hover:from-white/10 hover:to-white/15 hover:shadow-lg"
                )}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 + 0.5, type: "spring", stiffness: 100, damping: 15 }}
                whileHover={{ scale: 1.03, x: 6 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="text-sm font-bold capitalize text-primary-contrast">
                  {key === 'cashFlow' ? 'Cash Flow' : key}
                </span>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-24 h-3 rounded-full overflow-hidden shadow-inner relative",
                    currentTheme === 'light' ? "bg-neutral-200/50" : "bg-neutral-700/50"
                  )}>
                    <motion.div
                      className={cn(
                        "h-full rounded-full relative shadow-lg",
                        `bg-gradient-to-r ${getMetricGradient(score)}`
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: `${noData ? 0 : score}%` }}
                      transition={{ duration: 1.5, delay: index * 0.2 + 0.8, ease: "easeOut" }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/30 to-transparent rounded-full" />
                      <motion.div 
                        className="absolute right-0 top-0 w-1 h-full bg-white/60 rounded-r-full"
                        animate={{ opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      />
                    </motion.div>
                  </div>
                  <span className="text-sm font-bold text-primary-contrast w-12 text-right">
                    {noData ? '—' : Number.isFinite(score) ? Math.round(score) : 0}%
                  </span>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Enhanced Theme-Aware Action Button */}
        <motion.button
          whileHover={{ 
            scale: 1.06, 
            y: -3,
            boxShadow: "0 20px 40px rgba(139, 92, 246, 0.3), 0 10px 20px rgba(0, 0, 0, 0.2)"
          }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          className={cn(
            "w-full py-4 px-6 rounded-xl text-sm font-bold transition-all duration-300",
            "text-white shadow-xl border-2 relative overflow-hidden cursor-pointer",
            `bg-gradient-to-r ${healthStatus.color}`,
            currentTheme === 'light' ? "border-white/30 hover:border-white/50" : "border-white/20 hover:border-white/40",
            "hover:shadow-2xl"
          )}
        >
          <motion.span 
            className="relative z-10 flex items-center justify-center gap-2"
            animate={{
              textShadow: "0 0 20px rgba(255,255,255,0.8)"
            }}
          >
            <span className="text-lg">
              {healthStatus.score >= 80 ? "🚀" : "💡"}
            </span>
            {healthStatus.score >= 80 ? "Optimize Further" : "Improve Health"}
          </motion.span>
          
          {/* Animated overlay */}
          <motion.div 
            className="absolute inset-0 bg-gradient-to-r from-white/20 via-white/10 to-transparent"
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{ 
              duration: 2, 
              repeat: Infinity, 
              repeatDelay: 3,
              ease: "easeInOut"
            }}
          />
          
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/15 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300" />
        </motion.button>
      </div>
    </ThemedGlassSurface>
  )
}
