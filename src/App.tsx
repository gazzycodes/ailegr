import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ThemedGlassSurface } from './components/themed/ThemedGlassSurface'
import { Navigation } from './components/layout/Navigation'
import { Dashboard } from './components/dashboard/Dashboard'
import { TransactionUniverse } from './components/3d/TransactionUniverse'
import { Invoices } from './components/transactions/Invoices'
import Customers from './components/customers/Customers'
import SettingsView from './components/settings/Settings'
import Reports from './components/reports/Reports'
import { VoiceCommandInterface } from './components/voice/VoiceCommandInterface'
import { PredictiveAssistant } from './components/ai/PredictiveAssistant'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import { FloatingParticles } from './components/effects/FloatingParticles'
import { CollapsibleFloatingActionButton } from './components/layout/CollapsibleFloatingActionButton'
import AiInvoiceModal from './components/ai/AiInvoiceModal'
import AiRevenueModal from './components/ai/AiRevenueModal'
import ChatDrawer from './components/ai/ChatDrawer'
import ChatFab from './components/layout/ChatFab'
import {
  AdaptiveLayout
} from './components/layout/SmartFloatingElements'
import { useTheme } from './theme/ThemeProvider'
import { cn } from './lib/utils'
import ToastContainer from './components/themed/Toast'
import useToast from './components/themed/useToast'

// Main application view states
type AppView = 'dashboard' | 'universe' | 'transactions' | 'reports' | 'customers' | 'settings'

// Revolutionary App Component
function App() {
  const [currentView, setCurrentView] = useState<AppView>('dashboard')
  const [isVoiceActive, setIsVoiceActive] = useState(false)
  const [showPredictiveAssistant, setShowPredictiveAssistant] = useState(false)
  const [openAiInvoice, setOpenAiInvoice] = useState(false)
  const [openAiRevenue, setOpenAiRevenue] = useState(false)
  const [openChat, setOpenChat] = useState(false)
  const { currentTheme, isDark } = useTheme()
  const [fabExpanded, setFabExpanded] = useState(false)
  const { toasts, push, remove } = useToast()

  // Listen for global toast events from deep components (error cases)
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail || {}
      if (detail?.message) {
        push(detail.message, detail.type || 'info', detail.duration || 3000)
      }
    }
    window.addEventListener('toast', handler as any)
    return () => window.removeEventListener('toast', handler as any)
  }, [push])

  // Simulate business health for emotional interface
  const [businessHealth, setBusinessHealth] = useState(78) // 0-100 scale

  // Breathing effect for the main container
  const containerVariants = {
    initial: { opacity: 0, scale: 0.95 },
    animate: { 
      opacity: 1, 
      scale: 1,
      transition: {
        duration: 0.8,
        ease: [0.23, 1, 0.32, 1]
      }
    },
    exit: { 
      opacity: 0, 
      scale: 1.05,
      transition: { duration: 0.3 }
    }
  }

  // Page transition variants
  const pageVariants = {
    initial: { opacity: 0, x: 20, scale: 0.98 },
    animate: { 
      opacity: 1, 
      x: 0, 
      scale: 1,
      transition: {
        duration: 0.5,
        ease: [0.23, 1, 0.32, 1]
      }
    },
    exit: { 
      opacity: 0, 
      x: -20, 
      scale: 1.02,
      transition: { duration: 0.3 }
    }
  }

  // Simulate business health changes for emotional interface (much slower and more stable)
  useEffect(() => {
    const interval = setInterval(() => {
      setBusinessHealth(prev => {
        const variation = (Math.random() - 0.5) * 1 // ±0.5 variation (much smaller)
        return Math.max(60, Math.min(85, prev + variation)) // Keep within stable range
      })
    }, 30000) // 30 seconds instead of 5 seconds

    return () => clearInterval(interval)
  }, [])

  // Removed emotional interface system to prevent background color issues

  // Render the current view
  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard businessHealth={businessHealth} />
      case 'universe':
        return <TransactionUniverse />
      case 'transactions':
        return <Invoices />
      case 'reports':
        return <Reports />
      case 'customers':
        return <Customers />
      case 'settings':
        return <SettingsView />
      default:
        return <Dashboard businessHealth={businessHealth} />
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="initial"
      animate="animate"
      className={cn(
        "min-h-screen w-full bg-background transition-all duration-300 ease-out",
        isDark && "dark-theme-animated-bg"
      )}
    >
      {/* Subtle ambient effects (much more subtle) */}
      <div className="fixed inset-0 pointer-events-none">        
        {/* Very subtle breathing glow */}
        <div className="absolute inset-0 opacity-5 animate-pulse bg-gradient-conic from-primary/5 via-transparent to-primary/5" />
      </div>

      {/* Revolutionary Navigation - Now Fixed Position */}
      <Navigation
        currentView={currentView}
        onViewChange={setCurrentView}
        businessHealth={businessHealth}
      />

      {/* Main Application Layout */}
      <div className="relative z-10 min-h-screen">
        {/* Main Content Area with Adaptive Layout - No sidebar padding for floating nav */}
        <main className="relative overflow-hidden transition-all duration-500 ease-out">
          <AdaptiveLayout
            floatingElements={
              <>
                {/* Theme Switcher & Voice Command - Top Right */}
                <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
                  <ThemedGlassSurface variant="light" className="p-2">
                    <VoiceCommandInterface
                      isActive={isVoiceActive}
                      onToggle={setIsVoiceActive}
                    />
                  </ThemedGlassSurface>
                  <ThemedGlassSurface variant="light" className="p-2">
                    <ThemeSwitcher />
                  </ThemedGlassSurface>
                </div>
              </>
            }
          >
            {/* Main Content with Page Transitions */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentView}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full"
              >
                {renderCurrentView()}
              </motion.div>
            </AnimatePresence>
          </AdaptiveLayout>
        </main>
      </div>

      {/* Predictive AI Assistant - appears contextually */}
      <AnimatePresence>
        {showPredictiveAssistant && (
          <PredictiveAssistant
            businessHealth={businessHealth}
            currentView={currentView}
            onDismiss={() => setShowPredictiveAssistant(false)}
          />
        )}
      </AnimatePresence>

      {/* Voice Command Overlay */}
      <AnimatePresence>
        {isVoiceActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center justify-center"
            onClick={() => setIsVoiceActive(false)}
          >
            <ThemedGlassSurface
              variant="heavy"
              className="p-8 text-center max-w-md mx-4"
            >
              <div className="text-lg font-semibold text-gradient-primary mb-4">
                🎙️ Voice Command Active
              </div>
              <div className="text-secondary-contrast mb-6">
                Try saying: "Add $500 Adobe subscription" or "Show me profit trends"
              </div>
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
              </div>
            </ThemedGlassSurface>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Particles Effect */}
      <FloatingParticles
        count={15}
        colors={['primary', 'financial-revenue', 'financial-profit']}
        enabled={currentView === 'dashboard'}
      />

      {/* Collapsible Floating Action Button */}
      <CollapsibleFloatingActionButton
        actions={[
          { icon: "📄", label: "AI Invoice", action: () => setOpenAiInvoice(true) },
          { icon: "💵", label: "AI Revenue", action: () => setOpenAiRevenue(true) },
          
        ]}
        onExpandedChange={setFabExpanded}
      />

      {/* Scroll-aware Chat FAB */}
      {!fabExpanded && (
        <ChatFab onClick={() => setOpenChat(true)} bottomOffset={96} />
      )}

      {/* AI Modals & Chat Drawer */}
      <AiInvoiceModal open={openAiInvoice} onClose={() => { setOpenAiInvoice(false) }} />
      <AiRevenueModal open={openAiRevenue} onClose={() => { setOpenAiRevenue(false) }} />
      <ToastContainer toasts={toasts} onClose={remove} />
      <ChatDrawer open={openChat} onClose={() => setOpenChat(false)} onOpenAiInvoice={() => { setOpenChat(false); setOpenAiInvoice(true) }} onOpenAiRevenue={() => { setOpenChat(false); setOpenAiRevenue(true) }} />

      {/* Performance monitoring in development - Responsive positioning */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 left-4 md:left-6 z-40 max-w-[200px] md:max-w-none">
          <ThemedGlassSurface variant="heavy" className="px-4 py-2 shadow-lg">
            <div className="text-xs font-medium text-primary-contrast whitespace-nowrap">
              Theme: <span className="text-primary">{currentTheme}</span> | Health: <span className="text-financial-profit">{businessHealth.toFixed(0)}%</span>
            </div>
          </ThemedGlassSurface>
        </div>
      )}
    </motion.div>
  )
}

export default App
