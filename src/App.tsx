import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ThemedGlassSurface } from './components/themed/ThemedGlassSurface'
import { Navigation } from './components/layout/Navigation'
import { Dashboard } from './components/dashboard/Dashboard'
import { TransactionUniverse } from './components/3d/TransactionUniverse'
import { Invoices } from './components/transactions/Invoices'
import Customers from './components/customers/Customers'
import SettingsView from './components/settings/Settings'
import AdminPanel from './components/settings/AdminPanel'
import Reports from './components/reports/Reports'
import Landing from './components/landing/Landing'
import LoginView from './components/auth/LoginView'
import RegisterView from './components/auth/RegisterView'
import ResetPasswordView from './components/auth/ResetPasswordView'
import { VoiceCommandInterface } from './components/voice/VoiceCommandInterface'
import { PredictiveAssistant } from './components/ai/PredictiveAssistant'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import { FloatingParticles } from './components/effects/FloatingParticles'
import { CollapsibleFloatingActionButton } from './components/layout/CollapsibleFloatingActionButton'
import AiDocumentModal from './components/ai/AiDocumentModal'
import RecurringModal from './components/recurring/RecurringModal'
import ChatDrawer from './components/ai/ChatDrawer'
import ChatFab from './components/layout/ChatFab'
import {
  AdaptiveLayout
} from './components/layout/SmartFloatingElements'
import { useTheme } from './theme/ThemeProvider'
import { cn } from './lib/utils'
import ToastContainer from './components/themed/Toast'
import useToast from './components/themed/useToast'
import { useAuth } from './theme/AuthProvider'
import AssetModal from './components/assets/AssetModal'
import AssetRegister from './components/assets/AssetRegister'
import AssetsPage from './components/assets/AssetsPage'
import ProductsPage from './components/assets/ProductsPage'
import AiHelpModal from './components/ai/AiHelpModal'

// Main application view states
type AppView = 'landing' | 'login' | 'register' | 'reset-password' | 'dashboard' | 'universe' | 'transactions' | 'reports' | 'customers' | 'settings' | 'admin' | 'assets' | 'products'

// Revolutionary App Component
function App() {
  const [currentView, setCurrentView] = useState<AppView>('landing')
  const [isVoiceActive, setIsVoiceActive] = useState(false)
  const [showPredictiveAssistant, setShowPredictiveAssistant] = useState(false)
  const [openAiDocument, setOpenAiDocument] = useState(false)
  const [openRecurring, setOpenRecurring] = useState(false)
  const [openChat, setOpenChat] = useState(false)
  const [openAsset, setOpenAsset] = useState(false)
  const [openAssetRegister, setOpenAssetRegister] = useState(false)
  const [openAiHelp, setOpenAiHelp] = useState(false)
  useEffect(() => {
    const onAssetNew = (e: any) => {
      try { (onAssetNew as any)._seed = e?.detail?.seed || null } catch {}
      setOpenAsset(true)
    }
    const onAssetsOpen = (e: any) => {
      try {
        const id = e?.detail?.assetId
        if (id) {
          setCurrentView('assets')
          setTimeout(() => {
            try { (window as any)._openAssetId = id; window.dispatchEvent(new CustomEvent('assets:select', { detail: { assetId: id } })) } catch {}
          }, 0)
        }
      } catch {}
    }
    const onKey = (e: KeyboardEvent) => { if (e.altKey && e.key.toLowerCase() === 'a') setOpenAssetRegister(true) }
    window.addEventListener('asset:new', onAssetNew as any)
    window.addEventListener('assets:open', onAssetsOpen as any)
    window.addEventListener('keydown', onKey)
    const onAiHelp = () => setOpenAiHelp(true)
    try { window.addEventListener('ai:help', onAiHelp as any) } catch {}
    const onNavigate = (e: any) => {
      try {
        const v = String(e?.detail?.view || '') as any
        const allowed = ['landing','login','register','reset-password','dashboard','admin','universe','transactions','reports','customers','settings','assets','products']
        if (allowed.includes(v)) setCurrentView(v)
      } catch {}
    }
    try { window.addEventListener('navigate:view', onNavigate as any) } catch {}
    return () => { window.removeEventListener('asset:new', onAssetNew as any); window.removeEventListener('assets:open', onAssetsOpen as any); window.removeEventListener('keydown', onKey); try { window.removeEventListener('ai:help', onAiHelp as any) } catch {}; try { window.removeEventListener('navigate:view', onNavigate as any) } catch {} }
  }, [])
  const { currentTheme, isDark } = useTheme()
  const [fabExpanded, setFabExpanded] = useState(false)
  const { toasts, push, remove } = useToast()
  const { session, loading } = useAuth()
  const [apiError, setApiError] = useState<{ message: string; status?: number } | null>(null)

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

  // Global API error banner
  useEffect(() => {
    const onApiError = (e: any) => {
      try {
        const d = e?.detail || {}
        const msg = d?.message || 'Something went wrong. Please try again.'
        setApiError({ message: msg, status: d?.status })
        // Auto-clear after a few seconds unless hovered
        window.clearTimeout((onApiError as any)._t)
        ;(onApiError as any)._t = window.setTimeout(() => setApiError(null), 6000)
      } catch {}
    }
    try { window.addEventListener('api:error', onApiError as any) } catch {}
    return () => { try { window.removeEventListener('api:error', onApiError as any) } catch {} }
  }, [])

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

  // Shallow URL routing → view state mapping
  const viewFromPathname = (path: string): AppView => {
    const p = path.replace(/\/$/, '') || '/'
    switch (p) {
      case '/': return 'landing'
      case '/login': return 'login'
      case '/register': return 'register'
      case '/reset-password': return 'reset-password'
      case '/dashboard': return 'dashboard'
      case '/admin': return 'admin'
      case '/universe': return 'universe'
      case '/transactions': return 'transactions'
      case '/reports': return 'reports'
      case '/customers': return 'customers'
      case '/settings': return 'settings'
      case '/assets': return 'assets'
      case '/products': return 'products'
      default: return 'landing'
    }
  }

  const pathForView = (view: AppView): string => {
    switch (view) {
      case 'landing': return '/'
      case 'login': return '/login'
      case 'register': return '/register'
      case 'reset-password': return '/reset-password'
      case 'dashboard': return '/dashboard'
      case 'admin': return '/admin'
      case 'universe': return '/universe'
      case 'transactions': return '/transactions'
      case 'reports': return '/reports'
      case 'customers': return '/customers'
      case 'settings': return '/settings'
      case 'assets': return '/assets'
      case 'products': return '/products'
      default: return '/'
    }
  }

  // init from URL
  useEffect(() => {
    try {
      const initial = viewFromPathname(window.location.pathname)
      if (initial !== currentView) setCurrentView(initial)
      // keep history state in sync without adding a new entry
      window.history.replaceState({ view: initial }, '', pathForView(initial))
      const onPop = () => setCurrentView(viewFromPathname(window.location.pathname))
      window.addEventListener('popstate', onPop)
      return () => window.removeEventListener('popstate', onPop)
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // push URL on view change
  useEffect(() => {
    try {
      const path = pathForView(currentView)
      if (window.location.pathname !== path) {
        window.history.pushState({ view: currentView }, '', path)
      }
      document.title = `AILedgr — ${currentView.charAt(0).toUpperCase()}${currentView.slice(1)}`
    } catch {}
  }, [currentView])

  // If user is already authenticated and navigates to a public route (/, /login, /register, /reset-password),
  // redirect them to the dashboard automatically.
  useEffect(() => {
    if (loading) return
    const isPublic = currentView === 'landing' || currentView === 'login' || currentView === 'register' || currentView === 'reset-password'
    if (session && isPublic) {
      setCurrentView('dashboard')
      try { window.history.replaceState({ view: 'dashboard' }, '', '/dashboard') } catch {}
    }
  }, [session, loading, currentView])

  // Render the current view
  const renderCurrentView = () => {
    // Auth route guard: only allow app views when logged in
    const isPublic = currentView === 'landing' || currentView === 'login' || currentView === 'register' || currentView === 'reset-password'
    if (!loading && !session && !isPublic) {
      setCurrentView('login')
      return <LoginView onRegister={() => setCurrentView('register')} />
    }
    switch (currentView) {
      case 'landing':
        return <Landing onGetStarted={() => setCurrentView('register')} onSignIn={() => setCurrentView('login')} />
      case 'login':
        return <LoginView onRegister={() => setCurrentView('register')} />
      case 'register':
        return <RegisterView onLogin={() => setCurrentView('login')} />
      case 'reset-password':
        return <ResetPasswordView onDone={() => setCurrentView('login')} />
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
      case 'admin':
        return <AdminPanel onBack={() => setCurrentView('dashboard')} />
      case 'assets':
        return <AssetsPage />
      case 'products':
        return <ProductsPage />
      default:
        return <Landing onGetStarted={() => setCurrentView('register')} onSignIn={() => setCurrentView('login')} />
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
      {/* Aurora background temporarily removed to diagnose load flash */}
      {/* Subtle ambient effects (much more subtle) */}
      <div className="fixed inset-0 pointer-events-none">        
        {/* Very subtle breathing glow */}
        <div className="absolute inset-0 opacity-5 animate-pulse bg-gradient-conic from-primary/5 via-transparent to-primary/5" />
      </div>

      {/* App Navigation (hidden on public landing/auth views, including reset-password) */}
      {!(currentView === 'landing' || currentView === 'login' || currentView === 'register' || currentView === 'reset-password') && (
        <Navigation
          currentView={currentView}
          onViewChange={setCurrentView}
          businessHealth={businessHealth}
        />
      )}

      {/* Main Application Layout */}
      <div className="relative z-10 min-h-screen">
        {/* Global API Error Banner */}
        {apiError && (
          <div className="fixed top-0 left-0 right-0 z-[10000] flex justify-center pointer-events-none">
            <div
              className="pointer-events-auto m-3 max-w-2xl w-[92%] rounded-lg border border-white/10 bg-red-500/10 text-red-200 backdrop-blur-xl shadow-lg"
              onMouseEnter={() => { window.clearTimeout(((null as any) as any)); }}
            >
              <div className="px-4 py-2 text-sm flex items-center justify-between gap-3">
                <div className="truncate">
                  {apiError.status ? `[${apiError.status}] ` : ''}{apiError.message}
                </div>
                <button className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/15 border border-white/10" onClick={() => setApiError(null)}>Dismiss</button>
              </div>
            </div>
          </div>
        )}
        {/* Main Content Area with Adaptive Layout - No sidebar padding for floating nav */}
        <main className="relative overflow-hidden transition-all duration-500 ease-out">
          <AdaptiveLayout
            floatingElements={
              !(currentView === 'landing' || currentView === 'login' || currentView === 'register' || currentView === 'reset-password') ? (
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
              ) : null
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

      {/* Collapsible Floating Action Button (hidden on landing/auth) */}
      {!(currentView === 'landing' || currentView === 'login' || currentView === 'register' || currentView === 'reset-password') && (
        <CollapsibleFloatingActionButton
          actions={[
            { icon: "📄", label: "AI Document", action: () => setOpenAiDocument(true) },
            { icon: "🔁", label: "Recurring", action: () => setOpenRecurring(true) },
            { icon: "🏗️", label: "Add Asset", action: () => setOpenAsset(true) },
            { icon: "📦", label: "Asset Register", action: () => setOpenAssetRegister(true) },
          ]}
          onExpandedChange={setFabExpanded}
        />
      )}

      {/* Scroll-aware Chat FAB (hidden on landing/auth) */}
      {!fabExpanded && !(currentView === 'landing' || currentView === 'login' || currentView === 'register' || currentView === 'reset-password') && (
        <ChatFab onClick={() => setOpenChat(true)} bottomOffset={96} />
      )}

      {/* AI Modals & Chat Drawer */}
      <AiDocumentModal open={openAiDocument} onClose={() => { setOpenAiDocument(false) }} />
      <RecurringModal open={openRecurring} onClose={() => setOpenRecurring(false)} />
      <AssetModal open={openAsset} onClose={() => setOpenAsset(false)} seed={(window as any).onAssetNew?._seed || null} />
      <AssetRegister open={openAssetRegister} onClose={() => setOpenAssetRegister(false)} />
      <AiHelpModal open={openAiHelp} onClose={() => setOpenAiHelp(false)} />
      <ToastContainer toasts={toasts} onClose={remove} />
      {!(currentView === 'landing' || currentView === 'login' || currentView === 'register' || currentView === 'reset-password') && (
        <ChatDrawer open={openChat} onClose={() => setOpenChat(false)} onOpenAiDocument={() => { setOpenChat(false); setOpenAiDocument(true) }} />
      )}

      {/* Performance monitoring in development - hide on public views */}
      {process.env.NODE_ENV === 'development' && !(currentView === 'landing' || currentView === 'login' || currentView === 'register' || currentView === 'reset-password') && (
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
