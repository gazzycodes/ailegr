import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock } from 'lucide-react'
import AuthCard from './AuthCard'
import { cn } from '../../lib/utils'
import supabase from '../../services/supabaseClient'

export default function ResetPasswordView({ onDone }: { onDone?: () => void }) {
	const [password, setPassword] = useState('')
	const [confirm, setConfirm] = useState('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string>('')
	const [success, setSuccess] = useState<string>('')
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setSessionReady(true)
    }).data?.subscription

    ;(async () => {
      try {
        // If a session already exists, mark ready
        const { data } = await supabase.auth.getSession()
        if (data?.session) { setSessionReady(true); return }

        // Preferred: let Supabase parse URL/hash and store the session
        const authAny = supabase.auth as any
        if (typeof authAny.getSessionFromUrl === 'function') {
          try {
            const { data: d, error: ge } = await authAny.getSessionFromUrl({ storeSession: true })
            if (!ge && d?.session) { setSessionReady(true); return }
          } catch {}
        }

        // Try supported token formats from Supabase confirmation URL
        const url = new URL(window.location.href)
        const type = url.searchParams.get('type') || url.hash.match(/type=([^&]+)/)?.[1]

        // 1) access_token & refresh_token in URL or hash
        const access = url.searchParams.get('access_token') || url.hash.match(/access_token=([^&]+)/)?.[1]
        const refresh = url.searchParams.get('refresh_token') || url.hash.match(/refresh_token=([^&]+)/)?.[1]
        if (access && refresh) {
          const { data: s2, error: e2 } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh })
          if (!e2 && s2?.session) { setSessionReady(true); return }
        }

        // 2) PKCE exchange via ?code= when type=recovery
        const code = url.searchParams.get('code') || url.hash.match(/code=([^&]+)/)?.[1]
        if (code && (supabase.auth as any).exchangeCodeForSession) {
          const { data: s, error } = await (supabase.auth as any).exchangeCodeForSession({ code })
          if (!error && s?.session) { setSessionReady(true); return }
        }
      } catch {}
      // If we reach here, we couldn't establish a session
      setSessionReady(false)
    })()

    return () => { try { sub?.unsubscribe() } catch {} }
  }, [])

	const submit = async () => {
		if (!password || password.length < 8) { setError('Password must be at least 8 characters'); return }
		if (password !== confirm) { setError('Passwords do not match'); return }
		setLoading(true); setError(''); setSuccess('')
		try {
			const { data, error } = await supabase.auth.updateUser({ password })
			if (error) throw error
			setSuccess('Password updated. You can now sign in.')
			window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Password updated', type: 'success' } }))
			setTimeout(() => {
				onDone?.()
				try { window.history.pushState({ view: 'login' }, '', '/login'); window.dispatchEvent(new PopStateEvent('popstate')) } catch {}
			}, 800)
		} catch (e: any) {
			setError(e?.message || 'Failed to update password')
			window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Failed to update password', type: 'error' } }))
		} finally { setLoading(false) }
	}

	return (
		<div className="relative min-h-[70vh] flex items-center justify-center px-4">
			<motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5 }} className="w-full">
				<AuthCard title="Set a new password" subtitle="Enter your new password below">
					<form className="space-y-4" onSubmit={(e)=>{ e.preventDefault(); submit() }}>
						<label className="block text-sm">
							<span className="text-secondary-contrast">New Password</span>
							<div className="relative mt-1">
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-contrast/80"><Lock size={16} /></span>
								<input value={password} onChange={e=>setPassword(e.target.value)} type="password" required className={cn('w-full pl-9 pr-3 py-3 rounded-xl bg-white/10 border border-white/10 focus:ring-focus backdrop-blur-sm transition-all duration-200 focus:shadow-[0_0_0_4px_rgb(var(--color-primary-500)_/_0.15)]')} placeholder="Enter new password" />
							</div>
						</label>
						<label className="block text-sm">
							<span className="text-secondary-contrast">Confirm Password</span>
							<div className="relative mt-1">
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-contrast/80"><Lock size={16} /></span>
								<input value={confirm} onChange={e=>setConfirm(e.target.value)} type="password" required className={cn('w-full pl-9 pr-3 py-3 rounded-xl bg-white/10 border border-white/10 focus:ring-focus backdrop-blur-sm transition-all duration-200 focus:shadow-[0_0_0_4px_rgb(var(--color-primary-500)_/_0.15)]')} placeholder="Confirm new password" />
							</div>
						</label>
						<AnimatePresence>
							{error && (<motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-xs text-red-400">{error}</motion.div>)}
							{success && (<motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-xs text-green-400">{success}</motion.div>)}
						</AnimatePresence>
						{!sessionReady && (
							<div className="text-xs text-red-400">Auth session missing! Please open the link directly from your email again.</div>
						)}
						<motion.button type="submit" disabled={loading || !sessionReady} whileTap={{ scale: 0.98 }} className="relative overflow-hidden group w-full mt-2 px-4 py-3 rounded-2xl bg-primary/20 text-primary border border-primary/30 focus:ring-primary disabled:opacity-60 transition-all duration-300 hover:bg-primary/25">
							{loading ? 'Updating…' : 'Update password'}
						</motion.button>
					</form>
				</AuthCard>
			</motion.div>
		</div>
	)
}


