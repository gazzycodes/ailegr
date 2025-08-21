import { useMemo, useState } from 'react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { cn } from '../../lib/utils'

interface Plan {
	name: string
	tag?: string
	monthly: number
	annual: number
	features: string[]
}

const PLANS: Plan[] = [
	{ name: 'Starter', monthly: 9, annual: 7, features: ['1 user', 'Invoicing', 'OCR receipts (50/mo)', 'P&L & Balance Sheet'] },
	{ name: 'Growth', tag: 'MOST POPULAR', monthly: 19, annual: 15, features: ['3 users', 'AI categorization', 'OCR receipts (200/mo)', 'Trial Balance & COA tools'] },
	{ name: 'Team', monthly: 39, annual: 32, features: ['5 users', 'Rules & automation', 'OCR receipts (600/mo)', 'Scheduled reports'] },
	{ name: 'Pro', monthly: 79, annual: 64, features: ['10 users', 'Advanced permissions', 'OCR receipts (1500/mo)', 'Priority support'] }
]

export default function PricingGrid() {
	const [annual, setAnnual] = useState(true)
	const plans = useMemo(() => PLANS, [])
	return (
		<div className="w-full" id="pricing">
			{/* Toggle */}
			<div className="flex items-center justify-center gap-2 mb-4">
				<button
					className={cn('px-3 py-1.5 rounded-lg text-sm border', annual ? 'bg-white/10 border-white/10' : 'bg-primary/20 border-primary/30 text-primary')}
					onClick={() => setAnnual(false)}
				>
					Monthly
				</button>
				<button
					className={cn('px-3 py-1.5 rounded-lg text-sm border', annual ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-white/10 border-white/10')}
					onClick={() => setAnnual(true)}
				>
					Annual <span className="ml-1 text-xs text-secondary-contrast">(save)</span>
				</button>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				{plans.map((p) => (
					<ThemedGlassSurface key={p.name} elevation={1} variant="light" className="p-4 flex flex-col">
						<div className="flex items-center justify-between mb-2">
							<div className="font-semibold">{p.name}</div>
							{p.tag && (
								<span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">{p.tag}</span>
							)}
						</div>
						<div className="text-2xl font-bold mb-1">
							US$ {annual ? p.annual : p.monthly}
							<span className="text-xs font-medium text-secondary-contrast">/mo</span>
						</div>
						<div className="text-xs text-secondary-contrast mb-3">Billed {annual ? 'annually' : 'monthly'}</div>
						<ul className="text-sm text-secondary-contrast space-y-1 mb-3">
							{p.features.map((f) => (
								<li key={f} className="flex items-start gap-2">
									<span className="inline-block mt-1 w-1.5 h-1.5 rounded-full bg-primary" />
									<span>{f}</span>
								</li>
							))}
						</ul>
						<button className="mt-auto px-3 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/25 transition-colors text-sm">
							Select plan
						</button>
					</ThemedGlassSurface>
				))}
			</div>
		</div>
	)
}
