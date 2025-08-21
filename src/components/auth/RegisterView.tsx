import { useState } from 'react'
import AuthCard from './AuthCard'
import { cn } from '../../lib/utils'

export default function RegisterView({ onLogin }: { onLogin?: () => void }) {
	const [email, setEmail] = useState('')
	const [name, setName] = useState('')
	const [password, setPassword] = useState('')
	return (
		<div className="min-h-[70vh] flex items-center justify-center px-4">
			<AuthCard title="Create your account" subtitle="Start your AI‑First finance journey">
				<form className="space-y-3">
					<label className="block text-sm">
						<span className="text-secondary-contrast">Name</span>
						<input value={name} onChange={e=>setName(e.target.value)} className={cn('mt-1 w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:ring-focus')} />
					</label>
					<label className="block text-sm">
						<span className="text-secondary-contrast">Email</span>
						<input value={email} onChange={e=>setEmail(e.target.value)} type="email" required className={cn('mt-1 w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:ring-focus')} placeholder="you@example.com" />
					</label>
					<label className="block text-sm">
						<span className="text-secondary-contrast">Password</span>
						<input value={password} onChange={e=>setPassword(e.target.value)} type="password" required className={cn('mt-1 w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:ring-focus')} />
					</label>
					<button type="button" className="w-full mt-2 px-4 py-2 rounded-xl bg-primary/20 text-primary border border-primary/30 focus:ring-primary">
						Create account
					</button>
					<div className="text-xs text-secondary-contrast text-center">
						Already have an account? <button type="button" className="underline" onClick={onLogin}>Sign in</button>
					</div>
				</form>
			</AuthCard>
		</div>
	)
}


