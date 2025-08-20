import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Brain, 
  TrendingUp, 
  AlertCircle, 
  Lightbulb, 
  Target,
  Zap,
  Eye,
  ChevronRight
} from 'lucide-react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { cn } from '../../lib/utils'

interface PredictiveInsightsProps {
  businessHealth: number
  metrics: {
    revenue: { current: number; previous: number; trend: 'up' | 'down'; change: number }
    expenses: { current: number; previous: number; trend: 'up' | 'down'; change: number }
    profit: { current: number; previous: number; trend: 'up' | 'down'; change: number }
    cashFlow: { current: number; previous: number; trend: 'up' | 'down'; change: number }
  }
}

interface Insight {
  id: string
  type: 'opportunity' | 'warning' | 'prediction' | 'recommendation'
  title: string
  description: string
  impact: 'high' | 'medium' | 'low'
  confidence: number // 0-100
  icon: React.ComponentType<{ className?: string }>
  action?: string
  priority: number
}

const generateInsights = (businessHealth: number, metrics: any): Insight[] => {
  const insights: Insight[] = []

  // Revenue insights
  if (metrics.revenue.trend === 'up' && metrics.revenue.change > 20) {
    insights.push({
      id: 'revenue-growth',
      type: 'opportunity',
      title: 'Accelerating Revenue Growth',
      description: `Revenue is up ${metrics.revenue.change.toFixed(1)}%. Consider scaling marketing efforts to capitalize on this momentum.`,
      impact: 'high',
      confidence: 87,
      icon: TrendingUp,
      action: 'Scale Marketing',
      priority: 1
    })
  }

  // Expense optimization
  if (metrics.expenses.change > 15) {
    insights.push({
      id: 'expense-warning',
      type: 'warning',
      title: 'Rising Expense Pattern',
      description: `Expenses increased by ${metrics.expenses.change.toFixed(1)}%. Review variable costs for optimization opportunities.`,
      impact: 'medium',
      confidence: 92,
      icon: AlertCircle,
      action: 'Review Expenses',
      priority: 2
    })
  }

  // Cash flow predictions
  const projectedCashFlow = metrics.cashFlow.current * (1 + metrics.cashFlow.change / 100)
  insights.push({
    id: 'cashflow-prediction',
    type: 'prediction',
    title: 'Next Month Cash Flow',
    description: `Based on current trends, expect $${projectedCashFlow.toLocaleString()} cash flow next month.`,
    impact: 'high',
    confidence: 78,
    icon: Eye,
    priority: 3
  })

  // Business health recommendations
  if (businessHealth < 70) {
    insights.push({
      id: 'health-recommendation',
      type: 'recommendation',
      title: 'Business Health Improvement',
      description: 'Focus on increasing profit margins and optimizing operational efficiency to boost overall health score.',
      impact: 'high',
      confidence: 85,
      icon: Target,
      action: 'Optimize Operations',
      priority: 1
    })
  }

  // Profit margin insights
  const profitMargin = (metrics.profit.current / metrics.revenue.current) * 100
  if (profitMargin > 25) {
    insights.push({
      id: 'profit-opportunity',
      type: 'opportunity',
      title: 'Strong Profit Margins',
      description: `Excellent ${profitMargin.toFixed(1)}% profit margin. Consider reinvesting in growth initiatives.`,
      impact: 'medium',
      confidence: 94,
      icon: Lightbulb,
      action: 'Reinvest in Growth',
      priority: 4
    })
  }

  // AI-powered seasonal prediction
  insights.push({
    id: 'seasonal-prediction',
    type: 'prediction',
    title: 'Seasonal Trend Analysis',
    description: 'Historical data suggests 15% revenue increase likely in the next quarter based on seasonal patterns.',
    impact: 'medium',
    confidence: 73,
    icon: Brain,
    priority: 5
  })

  return insights.sort((a, b) => a.priority - b.priority).slice(0, 4)
}

export function PredictiveInsights({ businessHealth, metrics }: PredictiveInsightsProps) {
  const [insights, setInsights] = useState<Insight[]>([])
  const [selectedInsight, setSelectedInsight] = useState<string | null>(null)
  const [isThinking, setIsThinking] = useState(true)

  // Simulate AI thinking process
  useEffect(() => {
    setIsThinking(true)
    const timer = setTimeout(() => {
      setInsights(generateInsights(businessHealth, metrics))
      setIsThinking(false)
    }, 2000)

    return () => clearTimeout(timer)
  }, [businessHealth, metrics])

  const getInsightColor = (type: Insight['type']) => {
    switch (type) {
      case 'opportunity':
        return {
          bg: 'from-green-500/20 to-emerald-500/10',
          border: 'border-green-500/30',
          icon: 'text-green-400',
          glow: 'shadow-green-500/20'
        }
      case 'warning':
        return {
          bg: 'from-yellow-500/20 to-orange-500/10',
          border: 'border-yellow-500/30',
          icon: 'text-yellow-400',
          glow: 'shadow-yellow-500/20'
        }
      case 'prediction':
        return {
          bg: 'from-blue-500/20 to-indigo-500/10',
          border: 'border-blue-500/30',
          icon: 'text-blue-400',
          glow: 'shadow-blue-500/20'
        }
      case 'recommendation':
        return {
          bg: 'from-purple-500/20 to-pink-500/10',
          border: 'border-purple-500/30',
          icon: 'text-purple-400',
          glow: 'shadow-purple-500/20'
        }
    }
  }

  const getImpactIcon = (impact: Insight['impact']) => {
    switch (impact) {
      case 'high':
        return '🔥'
      case 'medium':
        return '⚡'
      case 'low':
        return '💡'
    }
  }

  return (
    <ThemedGlassSurface variant="medium" className="p-6 h-full enhanced-card-hover">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
          <Brain className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">AI Insights</h3>
          <p className="text-sm text-secondary-contrast">
            Predictive intelligence for your business
          </p>
        </div>
      </div>

      {/* AI Thinking Animation */}
      <AnimatePresence>
        {isThinking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center py-8"
          >
            <div className="text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary mx-auto mb-4"
              />
              <div className="text-sm text-muted-contrast">
                AI analyzing your financial patterns...
              </div>
              <div className="flex items-center justify-center gap-1 mt-2">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 bg-primary/60 rounded-full"
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.5, 1, 0.5]
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.2
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Insights List */}
      <AnimatePresence>
        {!isThinking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            {insights.map((insight, index) => {
              const colors = getInsightColor(insight.type)
              const Icon = insight.icon
              const isSelected = selectedInsight === insight.id

              return (
                <motion.div
                  key={insight.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={cn(
                    "p-4 rounded-lg border cursor-pointer transition-all duration-300 group",
                    "bg-gradient-to-r backdrop-blur-sm",
                    colors.bg,
                    isSelected ? [colors.border, colors.glow, "shadow-lg"] : "border-border/20 hover:border-border/40"
                  )}
                  onClick={() => setSelectedInsight(isSelected ? null : insight.id)}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center flex-shrink-0",
                      isSelected && "scale-110"
                    )}>
                      <Icon className={cn("w-4 h-4", colors.icon)} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm group-hover:text-primary transition-colors">
                          {insight.title}
                        </h4>
                        <span className="text-xs">
                          {getImpactIcon(insight.impact)}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-muted-contrast ml-auto">
                          <span>{insight.confidence}%</span>
                          <div className="w-1 h-1 bg-current rounded-full" />
                        </div>
                      </div>

                      <p className="text-xs text-muted-contrast leading-relaxed">
                        {insight.description}
                      </p>

                      {insight.action && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="mt-2 px-3 py-1 text-xs bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors flex items-center gap-1"
                        >
                          <Zap className="w-3 h-3" />
                          {insight.action}
                          <ChevronRight className="w-3 h-3" />
                        </motion.button>
                      )}
                    </div>
                  </div>

                  {/* Confidence Bar */}
                  <div className="mt-3 w-full h-1 bg-surface/50 rounded-full overflow-hidden">
                    <motion.div
                      className={cn("h-full rounded-full", colors.icon.replace('text-', 'bg-'))}
                      initial={{ width: 0 }}
                      animate={{ width: `${insight.confidence}%` }}
                      transition={{ duration: 1, delay: index * 0.1 + 0.5 }}
                    />
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Status */}
      <div className="mt-6 pt-4 border-t border-border/20">
        <div className="flex items-center justify-between text-xs text-muted-contrast">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span>AI Engine Active</span>
          </div>
          <span>Last updated: Now</span>
        </div>
      </div>
    </ThemedGlassSurface>
  )
}
