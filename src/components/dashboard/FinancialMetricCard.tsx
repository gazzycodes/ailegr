
import { LucideIcon } from 'lucide-react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { cn } from '../../lib/utils'
import { useTheme } from '../../theme/ThemeProvider'
import { useMemo } from 'react'

interface FinancialMetricCardProps {
  title: string
  value: number
  previousValue: number
  trend: 'up' | 'down'
  change: number
  icon: LucideIcon
  color: 'revenue' | 'expense' | 'profit' | 'primary'
  sparkline?: number[]
}

const colorClasses = {
  revenue: {
    icon: 'text-financial-revenue',
    background: 'from-financial-revenue/20 to-financial-revenue/10',
    glow: 'revenue-glow',
    border: 'border-financial-revenue/30'
  },
  expense: {
    icon: 'text-financial-expense',
    background: 'from-financial-expense/20 to-financial-expense/10',
    glow: 'expense-glow',
    border: 'border-financial-expense/30'
  },
  profit: {
    icon: 'text-financial-profit',
    background: 'from-financial-profit/20 to-financial-profit/10',
    glow: 'profit-glow',
    border: 'border-financial-profit/30'
  },
  primary: {
    icon: 'text-primary',
    background: 'from-primary/20 to-primary/10',
    glow: 'shadow-primary',
    border: 'border-primary/30'
  }
}

export function FinancialMetricCard({
  title,
  value,
  previousValue,
  trend,
  change,
  icon: Icon,
  color,
  sparkline
}: FinancialMetricCardProps) {
  const colorClass = colorClasses[color]
  const isPositive = trend === 'up'
  const { currentTheme, isDark } = useTheme()
  
  // Format currency values
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  // Lightweight sparkline path generator (no axes, minimal DOM)
  const spark = useMemo(() => {
    const values = Array.isArray(sparkline) ? sparkline.filter(v => Number.isFinite(v)) : []
    if (!values || values.length < 2) return null

    const width = 160
    const height = 40
    const padX = 2
    const padY = 4
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1

    const points = values.map((v, i) => {
      const x = padX + (i * (width - padX * 2)) / (values.length - 1)
      const y = height - padY - ((v - min) / range) * (height - padY * 2)
      return { x, y }
    })

    let d = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1]
      const p1 = points[i]
      const cx1 = p0.x + (p1.x - p0.x) / 3
      const cx2 = p0.x + 2 * (p1.x - p0.x) / 3
      d += ` C ${cx1} ${p0.y}, ${cx2} ${p1.y}, ${p1.x} ${p1.y}`
    }

    const last = points[points.length - 1]
    return { d, lastX: last.x, lastY: last.y, width, height }
  }, [sparkline])

  return (
    <ThemedGlassSurface
      variant="medium"
      glow={false}
      hover={false}
      className={cn(
        "p-6 h-full enhanced-card-hover shimmer-effect",
        isDark && currentTheme === 'dark' && "white-glow"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className={cn(
          "w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center",
          colorClass.background
        )}>
          <Icon className={cn("w-6 h-6", colorClass.icon)} />
        </div>
        
        {/* Trend Indicator */}
        <div className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
          isPositive 
            ? "bg-green-500/10 text-green-400" 
            : "bg-red-500/10 text-red-400"
        )}>
          <div className={cn("w-3 h-3", !isPositive && "rotate-180")}>
            ▲
          </div>
          {change.toFixed(1)}%
        </div>
      </div>

      {/* Value - Clean Typography */}
      <div className="space-y-2">
        <div className={cn(
          "text-3xl font-bold tracking-tight leading-none text-primary-contrast",
          isDark && "text-bright-glow"
        )}>
          {formatCurrency(value)}
        </div>

        <div className="text-sm font-medium text-secondary-contrast uppercase tracking-wide">
          {title}
        </div>
      </div>

      {/* Previous Period Comparison */}
      <div className="mt-4 pt-4 border-t border-border/20">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-contrast">
            Previous: {formatCurrency(previousValue)}
          </span>
          <span className={cn(
            "font-medium",
            isPositive ? "text-green-400" : "text-red-400"
          )}>
            {isPositive ? '+' : ''}{formatCurrency(value - previousValue)}
          </span>
        </div>
      </div>

      {/* Simple Progress Bar */}
      <div className="mt-4">
        {spark ? (
          <div className="w-full h-10">
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${spark.width} ${spark.height}`}
              preserveAspectRatio="none"
              className={cn(
                color === 'revenue' && 'text-financial-revenue',
                color === 'expense' && 'text-financial-expense',
                color === 'profit' && 'text-financial-profit',
                color === 'primary' && 'text-primary'
              )}
            >
              <path d={spark.d} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.9" />
              <circle cx={spark.lastX} cy={spark.lastY} r="2.5" fill="currentColor" />
            </svg>
          </div>
        ) : (
          <div className="w-full h-1 bg-surface rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full bg-gradient-to-r",
                color === 'revenue' && "from-financial-revenue/60 to-financial-revenue",
                color === 'expense' && "from-financial-expense/60 to-financial-expense",
                color === 'profit' && "from-financial-profit/60 to-financial-profit",
                color === 'primary' && "from-primary/60 to-primary"
              )}
              style={{ width: `${Math.min(100, (value / (previousValue * 1.5)) * 100)}%` }}
            />
          </div>
        )}
      </div>
    </ThemedGlassSurface>
  )
}
