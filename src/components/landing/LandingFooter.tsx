import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'

export default function LandingFooter() {
	return (
		<footer className="mt-16">
			<ThemedGlassSurface variant="light" elevation={1} className="p-6">
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-sm">
					<Section title="For Businesses" items={[ 'Features', 'Plans & Pricing', 'Compare Products', 'Small Business Accounting' ]} />
					<Section title="Features & Benefits" items={[ 'Invoicing', 'Accounting Reports', 'Inventory', 'Connect Your Apps' ]} />
					<Section title="Accountants" items={[ 'Grow Your Practice', 'Accountant Features', 'Events', 'Resources' ]} />
					<Section title="Learn & Support" items={[ 'Docs', 'FAQ', 'Accounting Glossary', 'Templates' ]} />
				</div>
				<div className="mt-4 text-xs text-secondary-contrast">© {new Date().getFullYear()} AI‑Ledgr. All rights reserved.</div>
			</ThemedGlassSurface>
		</footer>
	)
}

function Section({ title, items }: { title: string; items: string[] }) {
	return (
		<div>
			<div className="font-semibold mb-2">{title}</div>
			<ul className="space-y-1">
				{items.map((i) => (
					<li key={i} className="text-secondary-contrast hover:text-primary cursor-pointer">{i}</li>
				))}
			</ul>
		</div>
	)
}
