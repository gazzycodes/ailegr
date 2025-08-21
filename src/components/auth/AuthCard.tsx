import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { cn } from '../../lib/utils'

interface AuthCardProps {
	title: string
	subtitle?: string
	children: React.ReactNode
}

export default function AuthCard({ title, subtitle, children }: AuthCardProps) {
	return (
		<ThemedGlassSurface variant="heavy" elevation={3} glow className={cn('p-6 sm:p-8 w-full max-w-md mx-auto glass-modal')}>
			<div className="mb-4">
				<div className="text-2xl font-bold text-primary-contrast">{title}</div>
				{subtitle && <div className="text-sm text-secondary-contrast mt-1">{subtitle}</div>}
			</div>
			{children}
		</ThemedGlassSurface>
	)
}


