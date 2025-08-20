import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Brain, 
  MessageCircle, 
  X, 
  Lightbulb, 
  TrendingUp, 
  AlertTriangle,
  Target,
  Zap,
  Eye,
  Bot
} from 'lucide-react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { cn } from '../../lib/utils'

interface PredictiveAssistantProps {
  businessHealth: number
  currentView: string
  onDismiss: () => void
}

interface AssistantMessage {
  id: string
  type: 'suggestion' | 'insight' | 'warning' | 'question'
  content: string
  action?: string
  confidence: number
  icon: React.ComponentType<{ className?: string }>
}

// Generate contextual messages based on business health and current view
const generateContextualMessages = (businessHealth: number, currentView: string): AssistantMessage[] => {
  const messages: AssistantMessage[] = []

  // Health-based messages
  if (businessHealth < 60) {
    messages.push({
      id: 'health-concern',
      type: 'warning',
      content: 'I notice your business health score could use attention. Would you like me to analyze the key factors affecting it?',
      action: 'Analyze Health Factors',
      confidence: 92,
      icon: AlertTriangle
    })
  } else if (businessHealth > 80) {
    messages.push({
      id: 'health-excellent',
      type: 'suggestion',
      content: 'Your business is thriving! This might be a great time to explore expansion opportunities or optimize your tax strategy.',
      action: 'Explore Growth Options',
      confidence: 87,
      icon: TrendingUp
    })
  }

  // View-specific messages
  switch (currentView) {
    case 'dashboard':
      messages.push({
        id: 'dashboard-insight',
        type: 'insight',
        content: 'I see you\'re reviewing your dashboard. Based on your recent transactions, there\'s a potential 15% savings opportunity in your software subscriptions.',
        action: 'Review Subscriptions',
        confidence: 84,
        icon: Lightbulb
      })
      break
    
    case 'universe':
      messages.push({
        id: 'universe-guide',
        type: 'suggestion',
        content: 'The 3D visualization shows strong revenue-to-profit correlation. Would you like me to identify which revenue streams are most profitable?',
        action: 'Analyze Revenue Streams',
        confidence: 91,
        icon: Eye
      })
      break
    
    case 'transactions':
      messages.push({
        id: 'transaction-pattern',
        type: 'insight',
        content: 'I\'ve detected an unusual spending pattern this month. Your office expenses are 40% higher than average. Should I investigate?',
        action: 'Investigate Spending',
        confidence: 88,
        icon: Brain
      })
      break
  }

  // Predictive suggestions
  const randomSuggestions = [
    {
      id: 'tax-optimization',
      type: 'suggestion' as const,
      content: 'Based on your current profit trajectory, you might benefit from accelerating some expenses before year-end to optimize your tax position.',
      action: 'Tax Planning Assistant',
      confidence: 79,
      icon: Target
    },
    {
      id: 'cash-flow-prediction',
      type: 'insight' as const,
      content: 'Your cash flow pattern suggests you\'ll have excess liquidity next month. Consider investment opportunities or debt reduction.',
      action: 'Investment Suggestions',
      confidence: 82,
      icon: TrendingUp
    },
    {
      id: 'efficiency-insight',
      type: 'question' as const,
      content: 'I noticed you process invoices manually. Would you like me to set up automated invoice workflows to save 2-3 hours per week?',
      action: 'Setup Automation',
      confidence: 95,
      icon: Zap
    }
  ]

  // Add a random suggestion
  const randomSuggestion = randomSuggestions[Math.floor(Math.random() * randomSuggestions.length)]
  messages.push(randomSuggestion)

  return messages.slice(0, 2) // Limit to 2 messages for better UX
}

export function PredictiveAssistant({ 
  businessHealth, 
  currentView, 
  onDismiss 
}: PredictiveAssistantProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0)
  const [isThinking, setIsThinking] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)

  // Generate messages when component mounts or context changes
  useEffect(() => {
    setIsThinking(true)
    const timer = setTimeout(() => {
      const newMessages = generateContextualMessages(businessHealth, currentView)
      setMessages(newMessages)
      setCurrentMessageIndex(0)
      setIsThinking(false)
      setIsExpanded(true)
    }, 1500)

    return () => clearTimeout(timer)
  }, [businessHealth, currentView])

  // Auto-cycle through messages
  useEffect(() => {
    if (messages.length > 1 && !isThinking) {
      const interval = setInterval(() => {
        setCurrentMessageIndex(prev => (prev + 1) % messages.length)
      }, 8000)

      return () => clearInterval(interval)
    }
  }, [messages.length, isThinking])

  const currentMessage = messages[currentMessageIndex]

  const getMessageColor = (type: AssistantMessage['type']) => {
    switch (type) {
      case 'suggestion':
        return {
          bg: 'from-blue-500/20 to-indigo-500/10',
          border: 'border-blue-500/30',
          icon: 'text-blue-400'
        }
      case 'insight':
        return {
          bg: 'from-green-500/20 to-emerald-500/10',
          border: 'border-green-500/30',
          icon: 'text-green-400'
        }
      case 'warning':
        return {
          bg: 'from-yellow-500/20 to-orange-500/10',
          border: 'border-yellow-500/30',
          icon: 'text-yellow-400'
        }
      case 'question':
        return {
          bg: 'from-purple-500/20 to-pink-500/10',
          border: 'border-purple-500/30',
          icon: 'text-purple-400'
        }
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, x: 100 }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        x: 0,
        width: isExpanded ? 400 : 60
      }}
      exit={{ opacity: 0, scale: 0.8, x: 100 }}
      className="fixed bottom-6 right-6 z-40"
      transition={{ 
        duration: 0.5, 
        ease: [0.23, 1, 0.32, 1],
        width: { duration: 0.3 }
      }}
    >
      <ThemedGlassSurface
        variant="heavy"
        className={cn(
          "relative overflow-hidden transition-all duration-300",
          isExpanded ? "p-6" : "p-3"
        )}
      >
        {/* Collapsed State - Just the AI Avatar */}
        <AnimatePresence>
          {!isExpanded && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExpanded(true)}
              className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center group hover:scale-105 transition-transform"
            >
              <Bot className="w-6 h-6 text-white group-hover:rotate-12 transition-transform" />
              
              {/* Breathing glow */}
              <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
              
              {/* Notification dot */}
              {messages.length > 0 && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-background animate-pulse" />
              )}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Expanded State - Full Assistant */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">AI Assistant</h3>
                    <p className="text-xs text-muted-contrast">
                      {isThinking ? 'Analyzing...' : 'Ready to help'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIsExpanded(false)}
                    className="p-1 rounded-md hover:bg-surface/50 transition-colors"
                  >
                    <Bot className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onDismiss}
                    className="p-1 rounded-md hover:bg-surface/50 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Thinking Animation */}
              <AnimatePresence>
                {isThinking && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-3 p-4 rounded-lg bg-surface/30"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary"
                    />
                    <div className="text-sm text-muted-contrast">
                      Analyzing your financial patterns...
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Message Display */}
              <AnimatePresence mode="wait">
                {!isThinking && currentMessage && (
                  <motion.div
                    key={currentMessage.id}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 1.05 }}
                    transition={{ duration: 0.3 }}
                    className={cn(
                      "p-4 rounded-lg border bg-gradient-to-r",
                      getMessageColor(currentMessage.type).bg,
                      getMessageColor(currentMessage.type).border
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0"
                      )}>
                        <currentMessage.icon className={cn(
                          "w-4 h-4",
                          getMessageColor(currentMessage.type).icon
                        )} />
                      </div>

                      <div className="flex-1 space-y-3">
                        <p className="text-sm leading-relaxed">
                          {currentMessage.content}
                        </p>

                        {/* Confidence & Action */}
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-muted-contrast">
                            {currentMessage.confidence}% confidence
                          </div>
                          
                          {currentMessage.action && (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors flex items-center gap-1"
                            >
                              <Zap className="w-3 h-3" />
                              {currentMessage.action}
                            </motion.button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Message Navigation */}
              {messages.length > 1 && !isThinking && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {messages.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentMessageIndex(index)}
                        className={cn(
                          "w-2 h-2 rounded-full transition-all",
                          index === currentMessageIndex ? "bg-primary" : "bg-surface"
                        )}
                      />
                    ))}
                  </div>
                  
                  <div className="text-xs text-muted-contrast">
                    {currentMessageIndex + 1} of {messages.length}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-border/20">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 p-2 text-xs bg-surface/50 hover:bg-surface text-foreground rounded-md transition-colors flex items-center justify-center gap-1"
                >
                  <MessageCircle className="w-3 h-3" />
                  Chat
                </motion.button>
                
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 p-2 text-xs bg-surface/50 hover:bg-surface text-foreground rounded-md transition-colors flex items-center justify-center gap-1"
                >
                  <Brain className="w-3 h-3" />
                  Insights
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating particles for AI effect */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-primary/40 rounded-full"
              animate={{
                x: [0, 100, 0],
                y: [0, -50, 0],
                opacity: [0, 0.8, 0]
              }}
              transition={{
                duration: 4 + i,
                repeat: Infinity,
                delay: i * 1.5,
                ease: "easeInOut"
              }}
              style={{
                left: `${20 + i * 30}%`,
                top: `${80 - i * 20}%`
              }}
            />
          ))}
        </div>
      </ThemedGlassSurface>
    </motion.div>
  )
}
