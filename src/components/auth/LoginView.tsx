import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock } from 'lucide-react'
import AuthCard from './AuthCard'
import ForgotPasswordModal from './ForgotPasswordModal'
import { cn } from '../../lib/utils'
import supabase from '../../services/supabaseClient'

export default function LoginView({ onRegister }: { onRegister?: () => void }) {
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string>('')
	const [success, setSuccess] = useState<string>('') // kept for future UI feedback
	const [shakeSignal, setShakeSignal] = useState<number>(0)
	const [forgotOpen, setForgotOpen] = useState(false)

	// Resolve theme colors → hex for confetti (from CSS vars)
	const varToHex = (varName: string) => {
		try {
			const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
			if (!raw) return '#a855f7'
			const [r, g, b] = raw.split(' ').map((n) => parseInt(n, 10))
			const toHex = (n: number) => n.toString(16).padStart(2, '0')
			return `#${toHex(r)}${toHex(g)}${toHex(b)}`
		} catch {
			return '#a855f7'
		}
	}

	const fireConfetti = async () => {
		try {
			const mod = await import('canvas-confetti')
			const confetti = (mod as any).default || (mod as any)
			const colors = ['--color-primary-500','--color-financial-profit','--color-secondary-500','--color-warning-500'].map(varToHex)
			confetti({ particleCount: 80, spread: 60, origin: { y: 0.5 }, colors })
			confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 }, colors })
			confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 }, colors })
		} catch {}
	}

	const signIn = async () => {
		setLoading(true); setError('')
		try {
			const { error } = await supabase.auth.signInWithPassword({ email, password })
			if (error) throw error
			setSuccess('Signed in successfully')
			await fireConfetti()
			window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Signed in', type: 'success' } }))
			// Shallow routing → push to /dashboard (tiny delay to let confetti show)
			setTimeout(() => {
				window.history.pushState({ view: 'dashboard' }, '', '/dashboard')
				window.dispatchEvent(new PopStateEvent('popstate'))
			}, 450)
		} catch (e: any) {
			const msg = e?.message || 'Sign in failed'
			setError(msg)
			window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } }))
			setShakeSignal(Math.random())
		} finally { setLoading(false) }
	}

	return (
		<div className="relative min-h-[70vh] flex items-center justify-center px-4">
			{/* Ambient orbs */}
			<motion.div className="pointer-events-none absolute -top-12 -right-10 w-72 h-72 rounded-full" style={{ background: 'radial-gradient(circle, rgb(var(--color-primary-500) / 0.18), transparent 60%)' }} animate={{ x: [0, 6, 0], y: [0, -4, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} />
			<motion.div className="pointer-events-none absolute -bottom-10 -left-8 w-64 h-64 rounded-full" style={{ background: 'radial-gradient(circle, rgb(var(--color-secondary-500) / 0.14), transparent 60%)' }} animate={{ x: [0, -4, 0], y: [0, 5, 0] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }} />
			<motion.div
				initial={{ opacity: 0, y: 12, scale: 0.98 }}
				animate={{ opacity: 1, y: 0, scale: 1, x: error ? [0, -8, 8, -6, 6, -3, 3, 0] : 0 }}
				key={shakeSignal}
				transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
				className="w-full"
			>
				<AuthCard title="Welcome back" subtitle="Sign in to your account">
					<form className="space-y-4" onSubmit={(e)=>{e.preventDefault(); signIn()}}>
						<label className="block text-sm">
							<span className="text-secondary-contrast">Email</span>
							<div className="relative mt-1">
								<motion.span aria-hidden className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full" initial={false} animate={{ opacity: email ? 0.35 : 0.15, scale: email ? 1 : 0.9 }} style={{ background: 'rgb(var(--color-primary-500) / 0.20)' }} />
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-contrast/80 transition-colors" style={{ color: email ? 'rgb(var(--color-primary-500))' : undefined }}><Mail size={16} /></span>
								<input value={email} onChange={e=>setEmail(e.target.value)} type="email" required className={cn('w-full pl-9 pr-3 py-3 rounded-xl bg-white/10 border border-white/10 focus:ring-focus backdrop-blur-sm transition-all duration-200 focus:shadow-[0_0_0_4px_rgb(var(--color-primary-500)_/_0.15)]')} placeholder="you@example.com" />
								<motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-xl" initial={false} animate={{ boxShadow: email ? 'inset 0 0 0 1px rgba(255,255,255,0.08)' : 'none' }} />
							</div>
						</label>
						<label className="block text-sm">
							<span className="text-secondary-contrast">Password</span>
							<div className="relative mt-1">
								<motion.span aria-hidden className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full" initial={false} animate={{ opacity: password ? 0.35 : 0.15, scale: password ? 1 : 0.9 }} style={{ background: 'rgb(var(--color-primary-500) / 0.20)' }} />
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-contrast/80 transition-colors" style={{ color: password ? 'rgb(var(--color-primary-500))' : undefined }}><Lock size={16} /></span>
								<input value={password} onChange={e=>setPassword(e.target.value)} type="password" required className={cn('w-full pl-9 pr-3 py-3 rounded-xl bg-white/10 border border-white/10 focus:ring-focus backdrop-blur-sm transition-all duration-200 focus:shadow-[0_0_0_4px_rgb(var(--color-primary-500)_/_0.15)]')} placeholder="Enter password" />
								<motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-xl" initial={false} animate={{ boxShadow: password ? 'inset 0 0 0 1px rgba(255,255,255,0.08)' : 'none' }} />
							</div>
						</label>
						<AnimatePresence>
							{error && (
								<motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-xs text-red-400">
									{error}
								</motion.div>
							)}
						</AnimatePresence>
						<motion.button type="submit" disabled={loading} whileTap={{ scale: 0.98 }} className="relative overflow-hidden group w-full mt-2 px-4 py-3 rounded-2xl bg-primary/20 text-primary border border-primary/30 focus:ring-primary disabled:opacity-60 transition-all duration-300 hover:bg-primary/25 hover:shadow-[0_8px_40px_rgba(0,0,0,0.15)]">
							<motion.div className="absolute inset-0 -translate-x-full group-hover:translate-x-0 transition-transform duration-700 opacity-60" style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--color-primary-500) / 0.30), transparent)' }} />
							<motion.span initial={false} animate={{ scale: loading ? 0.98 : 1 }} className="relative inline-flex items-center justify-center gap-2">
								{loading ? 'Signing in…' : 'Sign in'}
							</motion.span>
						</motion.button>
						<div className="text-xs text-secondary-contrast text-center flex flex-col gap-1">
							<button type="button" className="underline" onClick={() => setForgotOpen(true)}>Forgot your password?</button>
							<div>
								Don&apos;t have an account? <button type="button" className="underline" onClick={onRegister}>Sign up</button>
							</div>
						</div>
					</form>
				</AuthCard>
			</motion.div>
			{/* Success overlay removed; we use non-blocking toast notifications instead */}
			<ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} defaultEmail={email} />
		</div>
	)
}


