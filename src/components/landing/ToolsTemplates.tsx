import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'

const ITEMS = [
	{ h: 'Invoice Template', d: 'Professional, brand-ready invoice starter.' },
	{ h: 'Budget Template', d: 'Plan cash with month-by-month view.' },
	{ h: 'COA Starter', d: 'Best-practice chart of accounts.' },
	{ h: 'Close Checklist', d: 'Monthly close, step-by-step.' }
]

export default function ToolsTemplates() {
	return (
		<ThemedGlassSurface elevation={1} variant="light" className="p-4">
			<div className="text-sm font-semibold mb-3">Free tools & templates</div>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
				{ITEMS.map((i) => (
					<div key={i.h} className="rounded-lg border border-white/10 bg-white/5 p-3">
						<div className="font-medium">{i.h}</div>
						<div className="text-xs text-secondary-contrast">{i.d}</div>
					</div>
				))}
			</div>
		</ThemedGlassSurface>
	)
}
