import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, X } from 'lucide-react'
import ModalPortal from '../layout/ModalPortal'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { cn } from '../../lib/utils'
import supabase from '../../services/supabaseClient'

interface ForgotPasswordModalProps {
	open: boolean
	onClose: () => void
	defaultEmail?: string
}

export default function ForgotPasswordModal({ open, onClose, defaultEmail = '' }: ForgotPasswordModalProps) {
	const [email, setEmail] = useState(defaultEmail)
	const [loading, setLoading] = useState(false)
	const [message, setMessage] = useState<string>('')
	const [error, setError] = useState<string>('')

	const submit = async () => {
		if (!email) return
		setLoading(true); setMessage(''); setError('')
		try {
			const redirectTo = `${window.location.origin}/reset-password`
			const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
			if (error) throw error
			setMessage('Password reset link sent. Check your email.')
			window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Reset link sent', type: 'success' } }))
		} catch (e: any) {
			const msg = e?.message || 'Failed to send reset email'
			setError(msg)
			window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } }))
		} finally { setLoading(false) }
	}

	if (!open) return null

	return (
		<ModalPortal>
			<div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true">
				{/* Overlay */}
				<motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />

				{/* Modal */}
				<motion.div initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.2 }} className="relative w-full max-w-md">
					<ThemedGlassSurface variant="heavy" elevation={3} className="p-6 sm:p-7">
						<div className="flex items-start justify-between gap-3 mb-3">
							<div>
								<div className="text-lg font-semibold text-primary-contrast">Forgot password</div>
								<div className="text-xs text-secondary-contrast">Enter your email to receive a reset link</div>
							</div>
							<button className="p-1 rounded-md hover:bg-white/10" onClick={onClose} aria-label="Close">
								<X size={16} />
							</button>
						</div>
						<label className="block text-sm">
							<span className="text-secondary-contrast">Email</span>
							<div className="relative mt-1">
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-contrast/80"><Mail size={16} /></span>
								<input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" className={cn('w-full pl-9 pr-3 py-3 rounded-xl bg-white/10 border border-white/10 focus:ring-focus backdrop-blur-sm transition-all duration-200 focus:shadow-[0_0_0_4px_rgb(var(--color-primary-500)_/_0.15)]')} placeholder="you@example.com" />
							</div>
						</label>
						<AnimatePresence>
							{error && (
								<motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-xs text-red-400 mt-2">{error}</motion.div>
							)}
							{message && (
								<motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-xs text-green-400 mt-2">{message}</motion.div>
							)}
						</AnimatePresence>
						<motion.button type="button" disabled={loading || !email} whileTap={{ scale: 0.98 }} onClick={submit} className="mt-4 w-full px-4 py-3 rounded-2xl bg-primary/20 text-primary border border-primary/30 hover:bg-primary/25 disabled:opacity-60 transition-all duration-300">
							{loading ? 'Sending…' : 'Send reset link'}
						</motion.button>
					</ThemedGlassSurface>
				</motion.div>
			</div>
		</ModalPortal>
	)
}


