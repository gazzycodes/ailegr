import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'

const APPS = [
	{ name: 'Stripe', hue: '--color-primary-500' },
	{ name: 'Shopify', hue: '--color-secondary-500' },
	{ name: 'Square', hue: '--color-financial-profit' },
	{ name: 'GDrive', hue: '--color-financial-asset' },
	{ name: 'Dropbox', hue: '--color-primary-500' },
	{ name: 'Email', hue: '--color-warning-500' }
]

export default function IntegrationsBelt() {
	return (
		<div className="w-full">
			<ThemedGlassSurface elevation={1} variant="light" className="p-4">
				<div className="text-sm font-semibold mb-3">Connect your tools</div>
				<div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
					{APPS.map((a) => (
						<div key={a.name} className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
							<div
								className="mx-auto mb-2 w-8 h-8 rounded-full"
								style={{ backgroundColor: `rgb(var(${a.hue}))`, opacity: 0.85 }}
							/>
							<div className="text-xs">{a.name}</div>
						</div>
					))}
				</div>
			</ThemedGlassSurface>
		</div>
	)
}
