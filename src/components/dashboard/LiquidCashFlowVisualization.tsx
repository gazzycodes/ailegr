import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity } from 'lucide-react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { useTheme } from '../../theme/ThemeProvider'
//

interface LiquidCashFlowVisualizationProps {
  data: {
    revenue: { current: number; previous: number; trend: 'up' | 'down'; change: number }
    expenses: { current: number; previous: number; trend: 'up' | 'down'; change: number }
    profit: { current: number; previous: number; trend: 'up' | 'down'; change: number }
    cashFlow: { current: number; previous: number; trend: 'up' | 'down'; change: number }
  }
  // Optional real time-series injected from API (last N months)
  series?: {
    revenue: number[]
    expenses: number[]
    profit?: number[]
    labels?: string[]
  }
  timeRange: string
  activeMetric: string | null
}

// Build chart data from real series when provided; otherwise fall back to stable generator
const generateChartData = (
  baseValue: number,
  trend: 'up' | 'down',
  series?: number[],
  labels?: string[],
  seed: number = 1
) => {
  if (series && series.length > 0) {
    // Ensure final point aligns with current metric when possible
    const adjusted = [...series]
    if (Math.abs(adjusted[adjusted.length - 1] - baseValue) > baseValue * 0.001) {
      adjusted[adjusted.length - 1] = baseValue
    }
    return adjusted.map((v, i) => ({ value: Math.round(v), month: i, label: labels?.[i] }))
  }
  // Fallback: stable generator
  const data = [] as { value: number; month: number }[]
  let current = baseValue * 0.7
  const variation = baseValue * 0.05
  const trendMultiplier = trend === 'up' ? 1.15 : 0.95
  for (let i = 0; i < 12; i++) {
    const pseudoRandom = Math.sin(seed * i * 0.5) * 0.5
    const randomVariation = pseudoRandom * variation
    current = current * (1 + (trendMultiplier - 1) * 0.1) + randomVariation
    data.push({ value: Math.round(current), month: i })
  }
  return data
}

export function LiquidCashFlowVisualization({
  data
}: LiquidCashFlowVisualizationProps) {
  const { isDark } = useTheme()
  const [hoveredPoint, setHoveredPoint] = useState<string | null>(null)
  const [, setAnimationProgress] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [tooltipLeft, setTooltipLeft] = useState<number | null>(null)

  // Build chart data from real series when available; recompute on prop changes
  const chartData = useMemo(() => {
    const labels = (data as any).series?.labels
    const revenueData = generateChartData(
      data.revenue.current,
      data.revenue.trend,
      (data as any).series?.revenue,
      labels,
      1
    )
    const expenseData = generateChartData(
      data.expenses.current,
      data.expenses.trend,
      (data as any).series?.expenses,
      labels,
      2
    )
    // Profit is derived from revenue - expenses for data integrity when series are provided
    const profitSeries = (data as any).series?.profit
      ?? ((data as any).series?.revenue && (data as any).series?.expenses
        ? (data as any).series!.revenue.map((r: number, i: number) => r - (data as any).series!.expenses[i])
        : undefined)
    const profitData = profitSeries
      ? generateChartData(data.profit.current, data.profit.trend, profitSeries, labels, 3)
      : revenueData.map((p, i) => ({ value: Math.max(0, p.value - (expenseData[i]?.value ?? 0)), month: i }))

    return { revenueData, expenseData, profitData }
  }, [
    data.revenue.current,
    data.revenue.trend,
    data.expenses.current,
    data.expenses.trend,
    data.profit.current,
    data.profit.trend,
    (data as any).series?.revenue,
    (data as any).series?.expenses,
    (data as any).series?.profit,
    (data as any).series?.labels
  ])

  // Ensure we always have at least two points to avoid divide-by-zero in path math
  const ensureTwoPoints = (arr: Array<{ value: number; month: number; label?: string }>) => {
    if (!arr || arr.length === 0) return [{ value: 0, month: 0 }, { value: 0, month: 1 }]
    if (arr.length >= 2) return arr
    const first = arr[0]
    return [first, { ...first, month: (first.month ?? 0) + 1 }]
  }

  const revenueData = ensureTwoPoints(chartData.revenueData)
  const expenseData = ensureTwoPoints(chartData.expenseData)
  const profitData = ensureTwoPoints(chartData.profitData)

  // Animate the liquid flow (slower for better performance)
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationProgress(prev => (prev + 1) % 100)
    }, 200) // Slower animation for smoother experience
    return () => clearInterval(interval)
  }, [])

  // SVG dimensions - responsive
  const width = 500
  const height = 300
  const padding = 48

  // Calculate unified scale for all datasets
  const allValues = [
    ...revenueData.map(d => d.value),
    ...expenseData.map(d => d.value),
    ...profitData.map(d => d.value)
  ]
  const globalMaxValue = Math.max(...allValues)
  const globalMinValue = Math.min(...allValues)
  const globalRange = Math.max(1, globalMaxValue - globalMinValue)
  const hasAnyData = allValues.some(v => Number.isFinite(v))

  const normalize = (value: number) => {
    if (!Number.isFinite(value)) return 0
    if (globalRange === 0) return 0
    return (value - globalMinValue) / globalRange
  }
  // Compute tooltip left to keep it fully visible within container
  const computeTooltipLeft = (index: number) => {
    if (!containerRef.current || !tooltipRef.current) return
    const containerWidth = containerRef.current.clientWidth || width
    const svgX = padding + (index * (width - 2 * padding)) / (revenueData.length - 1)
    const anchorX = (svgX / width) * containerWidth
    const tooltipWidth = tooltipRef.current.clientWidth || 220
    const margin = 8
    const left = Math.min(Math.max(anchorX - tooltipWidth / 2, margin), containerWidth - tooltipWidth - margin)
    setTooltipLeft(left)
  }

  useEffect(() => {
    if (!hoveredPoint) { setTooltipLeft(null); return }
    const [, indexStr] = hoveredPoint.split('-')
    const i = parseInt(indexStr)
    const raf = requestAnimationFrame(() => computeTooltipLeft(i))
    return () => cancelAnimationFrame(raf)
  }, [hoveredPoint])

  useEffect(() => {
    if (!hoveredPoint) return
    const onResize = () => {
      const [, indexStr] = hoveredPoint.split('-')
      computeTooltipLeft(parseInt(indexStr))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [hoveredPoint])


  // Create SVG path for liquid flow with unified scale
  const createFlowPath = (dataPoints: any[], _color: string, offset: number = 0) => {
    if (!dataPoints || dataPoints.length === 0) return ''
    let path = ''
    dataPoints.forEach((point, index) => {
      const x = padding + (index * (width - 2 * padding)) / (dataPoints.length - 1)
      const normalizedValue = normalize(point.value)
      const y = height - padding - (normalizedValue * (height - 2 * padding)) + offset
      if (index === 0) {
        path += `M ${x} ${y}`
      } else {
        const prevX = padding + ((index - 1) * (width - 2 * padding)) / (dataPoints.length - 1)
        const controlX1 = prevX + (x - prevX) / 3
        const controlX2 = prevX + (2 * (x - prevX)) / 3
        const prevY = height - padding - (normalize(dataPoints[index - 1].value) * (height - 2 * padding)) + offset
        path += ` C ${controlX1} ${prevY}, ${controlX2} ${y}, ${x} ${y}`
      }
    })
    // Close to baseline for area fill
    const lastX = padding + ((dataPoints.length - 1) * (width - 2 * padding)) / (dataPoints.length - 1)
    path += ` L ${lastX} ${height - padding} L ${padding} ${height - padding} Z`
    return path
  }

  // Create line path (top edge of the area) for visible strokes
  const createLinePath = (dataPoints: any[], offset: number = 0) => {
    let path = ''
    dataPoints.forEach((point, index) => {
      const x = padding + (index * (width - 2 * padding)) / (dataPoints.length - 1)
      const normalizedValue = normalize(point.value)
      const y = height - padding - (normalizedValue * (height - 2 * padding)) + offset

      if (index === 0) {
        path += `M ${x} ${y}`
      } else {
        const prevX = padding + ((index - 1) * (width - 2 * padding)) / (dataPoints.length - 1)
        const controlX1 = prevX + (x - prevX) / 3
        const controlX2 = prevX + (2 * (x - prevX)) / 3
        const prevY = height - padding - (normalize(dataPoints[index - 1].value) * (height - 2 * padding)) + offset
        path += ` C ${controlX1} ${prevY}, ${controlX2} ${y}, ${x} ${y}`
      }
    })
    return path
  }

  // Helper function to get point coordinates using unified scale - FIXED positioning
  const getPointCoordinates = (dataPoints: any[], index: number, offset: number = 0) => {
    const x = padding + (index * (width - 2 * padding)) / (dataPoints.length - 1)
    const normalizedValue = normalize(dataPoints[index].value)
    // Apply the same offset used for the series so dots sit exactly on the visible line
    const y = height - padding - (normalizedValue * (height - 2 * padding)) + offset
    return { x, y }
  }

  // Helper function to get the actual data point for tooltip
  const getDataPoint = (type: string, index: number) => {
    switch (type) {
      case 'revenue':
        return revenueData[index]
      case 'expense':
        return expenseData[index]
      case 'profit':
        return profitData[index]
      default:
        return null
    }
  }

  return (
    <ThemedGlassSurface variant="medium" className="p-4 sm:p-6 h-full enhanced-card-hover">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-3 sm:gap-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Liquid Cash Flow</h3>
            <p className="text-sm text-secondary-contrast">
              Real-time financial movement visualization
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-financial-revenue" />
            <span>Revenue</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-financial-expense" />
            <span>Expenses</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-financial-profit" />
            <span>Profit</span>
          </div>
        </div>
      </div>

      {/* Liquid Flow Visualization */}
      <div ref={containerRef} className="relative w-full h-[250px] sm:h-[300px] lg:h-[350px] rounded-lg overflow-hidden bg-gradient-to-br from-surface/30 to-transparent">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          className="absolute inset-0"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Liquid gradient definitions */}
            <linearGradient id="revenueGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(var(--color-financial-revenue))" stopOpacity="0.8" />
              <stop offset="100%" stopColor="rgb(var(--color-financial-revenue))" stopOpacity="0.2" />
            </linearGradient>

            <linearGradient id="expenseGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(var(--color-financial-expense))" stopOpacity="0.8" />
              <stop offset="100%" stopColor="rgb(var(--color-financial-expense))" stopOpacity="0.2" />
            </linearGradient>

            <linearGradient id="profitGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(var(--color-financial-profit))" stopOpacity="0.8" />
              <stop offset="100%" stopColor="rgb(var(--color-financial-profit))" stopOpacity="0.2" />
            </linearGradient>

            {/* Liquid flow animation */}
            <pattern id="liquidFlow" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <motion.rect
                width="20"
                height="20"
                fill="url(#revenueGradient)"
                animate={{
                  x: [0, 20, 0],
                  opacity: [0.3, 0.6, 0.3]
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            </pattern>
          </defs>

          {/* Background grid */}
          <g opacity="0.12">
            {Array.from({ length: 4 }).map((_, i) => (
              <line
                key={`h-${i}`}
                x1={padding}
                y1={padding + i * (height - 2 * padding) / 4}
                x2={width - padding}
                y2={padding + i * (height - 2 * padding) / 4}
                stroke="currentColor"
                strokeWidth="1"
              />
            ))}
            {Array.from({ length: revenueData.length }).map((_, i) => (
              <line
                key={`v-${i}`}
                x1={padding + i * (width - 2 * padding) / (revenueData.length - 1 || 1)}
                y1={padding}
                x2={padding + i * (width - 2 * padding) / (revenueData.length - 1 || 1)}
                y2={height - padding}
                stroke="currentColor"
                strokeWidth="1"
              />


            ))}
          </g>

          {/* Liquid layers */}
          {hasAnyData && (
            <motion.path
              d={createFlowPath(expenseData, 'expense', 20)}
              fill="url(#expenseGradient)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 2, delay: 0.5 }}
            />
          )}

          {hasAnyData && (
            <motion.path
              d={createFlowPath(revenueData, 'revenue', 0)}
              fill="url(#revenueGradient)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 2, delay: 1 }}
            />
          )}

          {hasAnyData && (
            <motion.path
              d={createFlowPath(profitData, 'profit', -10)}
              fill="url(#profitGradient)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 2, delay: 1.5 }}
            />
          )}

          {/* Visible line strokes on top of areas for clear visibility across themes */}
          {hasAnyData && (
            <motion.path
              d={createLinePath(expenseData, 20)}
              stroke="rgb(var(--color-financial-expense))"
              strokeWidth="2.5"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.9 }}
              transition={{ duration: 1.6, delay: 0.5 }}
            />
          )}
          <motion.path
            d={hasAnyData ? createLinePath(revenueData, 0) : ''}
            stroke="rgb(var(--color-financial-revenue))"
            strokeWidth="3"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: hasAnyData ? 0.95 : 0 }}
            transition={{ duration: 1.6, delay: 1 }}
          />
          {hasAnyData && (
            <motion.path
              d={createLinePath(profitData, -10)}
              stroke="rgb(var(--color-financial-profit))"
              strokeWidth="2.5"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.9 }}
              transition={{ duration: 1.6, delay: 1.5 }}
            />
          )}


          {/* Interactive data points for all three datasets - FIXED positioning */}
          {/* Revenue data points */}
          {hasAnyData && revenueData.map((_, index) => {
            const { x, y } = getPointCoordinates(revenueData, index, 0)

            return (
              <motion.circle
                key={`revenue-${index}`}
                cx={x}
                cy={y}
                r={hoveredPoint === `revenue-${index}` ? 7 : 5}
                fill="rgb(var(--color-financial-revenue))"
                stroke={isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)"}
                strokeWidth="2"
                className="cursor-pointer drop-shadow-lg"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
                whileHover={{ scale: 1.3 }}
                onMouseEnter={() => setHoveredPoint(`revenue-${index}`)}
                onMouseLeave={() => setHoveredPoint(null)}
                onTouchStart={() => setHoveredPoint(`revenue-${index}`)}
                onTouchEnd={() => setHoveredPoint(null)}
              />
            )
          })}

          {/* Expense data points */}
          {hasAnyData && expenseData.map((_, index) => {
            const { x, y } = getPointCoordinates(expenseData, index, 20)

            return (
              <motion.circle
                key={`expense-${index}`}
                cx={x}
                cy={y}
                r={hoveredPoint === `expense-${index}` ? 7 : 5}
                fill="rgb(var(--color-financial-expense))"
                stroke={isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)"}
                strokeWidth="2"
                className="cursor-pointer drop-shadow-lg"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
                whileHover={{ scale: 1.3 }}
                onMouseEnter={() => setHoveredPoint(`expense-${index}`)}
                onMouseLeave={() => setHoveredPoint(null)}
                onTouchStart={() => setHoveredPoint(`expense-${index}`)}
                onTouchEnd={() => setHoveredPoint(null)}
              />
            )
          })}

          {/* Profit data points */}
          {hasAnyData && profitData.map((_, index) => {
            const { x, y } = getPointCoordinates(profitData, index, -10)

            return (
              <motion.circle
                key={`profit-${index}`}
                cx={x}
                cy={y}
                r={hoveredPoint === `profit-${index}` ? 7 : 5}
                fill="rgb(var(--color-financial-profit))"
                stroke={isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)"}
                strokeWidth="2"
                className="cursor-pointer drop-shadow-lg"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
                whileHover={{ scale: 1.3 }}
                onMouseEnter={() => setHoveredPoint(`profit-${index}`)}
                onMouseLeave={() => setHoveredPoint(null)}
                onTouchStart={() => setHoveredPoint(`profit-${index}`)}
                onTouchEnd={() => setHoveredPoint(null)}
              />
            )
          })}
        </svg>

        {/* Tooltip - FIXED to show correct data */}
        <AnimatePresence>
          {hoveredPoint !== null && (() => {
            // Parse the hovered point to get type and index
            const [type, indexStr] = hoveredPoint.split('-')
            const index = parseInt(indexStr)

            // Get the actual data point being hovered
            const currentPoint = getDataPoint(type, index)
            if (!currentPoint) return null

            // Ensure tooltip stays inside container using measured width
            // Left is computed in an effect and stored in state

            return (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 10 }}
                className="absolute z-10 pointer-events-none"
                style={{
                  left: `${tooltipLeft ?? 0}px`,
                  top: '16px',
                  transform: 'none',
                  maxWidth: 'min(280px, calc(100% - 16px))'
                }}
                ref={tooltipRef as any}
              >
                <ThemedGlassSurface variant="heavy" className="px-4 py-3 text-sm shadow-xl chart-tooltip liquid-glass" hover={false}>
                  {(() => {
                    const label = (revenueData[index]?.label as any) || ''
                    const ordinal = revenueData.length - index
                    const suffix = index === (revenueData.length - 1) ? ' (current)' : ''
                    return (
                      <div className="font-semibold text-foreground mb-2">
                        {label ? label : `Month ${ordinal}`}{suffix}
                      </div>
                    )
                  })()}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-financial-revenue" />
                      <span className="text-financial-revenue font-medium">
                        Revenue: ${revenueData[index]?.value.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-financial-expense" />
                      <span className="text-financial-expense font-medium">
                        Expenses: ${expenseData[index]?.value.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-financial-profit" />
                      <span className="text-financial-profit font-medium">
                        Profit: ${profitData[index]?.value.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-contrast mt-2 pt-2 border-t border-border/30">
                    Hovering: <span className="font-medium">{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                  </div>
                </ThemedGlassSurface>
              </motion.div>
            )
          })()}
        </AnimatePresence>

        {/* Particle effects removed for a cleaner, more professional look */}
      </div>

      {/* Summary Stats - Enhanced Typography with Mobile Responsiveness */}
      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
        <div className="text-center">
          <div className="text-xl sm:text-2xl md:text-3xl font-black text-financial-revenue tracking-tight leading-none drop-shadow-sm">
            ${data.revenue.current.toLocaleString()}
          </div>
          <div className="text-xs sm:text-sm font-medium text-secondary-contrast uppercase tracking-wide mt-1">Total Revenue</div>
        </div>
        <div className="text-center">
          <div className="text-xl sm:text-2xl md:text-3xl font-black text-financial-expense tracking-tight leading-none drop-shadow-sm">
            ${data.expenses.current.toLocaleString()}
          </div>
          <div className="text-xs sm:text-sm font-medium text-secondary-contrast uppercase tracking-wide mt-1">Total Expenses</div>
        </div>
        <div className="text-center">
          <div className="text-xl sm:text-2xl md:text-3xl font-black text-financial-profit tracking-tight leading-none drop-shadow-sm">
            ${data.profit.current.toLocaleString()}
          </div>
          <div className="text-xs sm:text-sm font-medium text-secondary-contrast uppercase tracking-wide mt-1">Net Profit</div>
        </div>
      </div>
    </ThemedGlassSurface>
  )
}
