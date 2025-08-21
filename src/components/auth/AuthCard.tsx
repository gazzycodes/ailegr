import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { cn } from '../../lib/utils'

interface AuthCardProps {
	title: string
	subtitle?: string
	children: React.ReactNode
}

export default function AuthCard({ title, subtitle, children }: AuthCardProps) {
	return (
		<div className={cn('relative w-full max-w-md mx-auto')}>
			<ThemedGlassSurface variant="heavy" elevation={3} glow className={cn('p-6 sm:p-8 glass-modal relative z-10')}>
				<div className="mb-4">
					<div className="text-2xl font-bold text-primary-contrast">{title}</div>
					{subtitle && <div className="text-sm text-secondary-contrast mt-1">{subtitle}</div>}
				</div>
				{children}
			</ThemedGlassSurface>
			<div className="pointer-events-none absolute -top-6 -left-8 w-28 h-28 rounded-full opacity-30" style={{ background: 'radial-gradient(circle, rgb(var(--color-primary-500) / 0.20), transparent 60%)' }} />
			<div className="pointer-events-none absolute -bottom-8 -right-10 w-36 h-36 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, rgb(var(--color-secondary-500) / 0.18), transparent 60%)' }} />
		</div>
	)
}


