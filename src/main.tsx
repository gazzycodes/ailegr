import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import queryClient from './queryClient'
import { ThemeProvider } from './theme/ThemeProvider.tsx'
import { AuthProvider } from './theme/AuthProvider'
import App from './App.tsx'
import './index.css'

// Global data:refresh handler to centralize React Query invalidation
if (typeof window !== 'undefined') {
  const refreshHandler = () => {
    try {
      // Invalidate common dashboards and reports
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['pnl'] })
      queryClient.invalidateQueries({ queryKey: ['balance-sheet'] })
      queryClient.invalidateQueries({ queryKey: ['trial-balance'] })
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] })
      // Invalidate common lists that change after postings
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    } catch {}
  }
  try { window.addEventListener('data:refresh', refreshHandler as any) } catch {}
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
