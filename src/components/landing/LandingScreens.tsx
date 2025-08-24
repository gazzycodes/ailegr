import { memo, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import FinancialDataService from '../../services/financialDataService'
import { useAuth } from '../../theme/AuthProvider'

/**
 * LandingScreens
 * Token-driven media collage: three glass "app windows" with faux charts.
 * No external images; pure CSS/SVG so it stays lightweight and theme-compliant.
 */
export default memo(function LandingScreens() {
	const rootRef = useRef<HTMLDivElement | null>(null)
	const aRef = useRef<HTMLDivElement | null>(null)
	const bRef = useRef<HTMLDivElement | null>(null)
	const cRef = useRef<HTMLDivElement | null>(null)
	const raf = useRef<number | null>(null)
	const [mounted, setMounted] = useState(false)
	const [mrr, setMrr] = useState<number | null>(null)
	const pRef = useRef(0)
	const mouseRef = useRef({ x: 0, y: 0 })
	const { session } = useAuth()

	useEffect(() => {
		setMounted(true)
		// Try to fetch metrics for live KPI; ignore errors if server not running
		;(async () => {
			try {
				if (!session?.access_token) return
				const data = await FinancialDataService.getDashboardData()
				const value = Number(data?.metrics?.totalRevenue)
				if (!isNaN(value) && value > 0) setMrr(value)
			} catch {}
		})()
		const applyTransforms = () => {
			if (!rootRef.current) return
			const p = pRef.current
			const { x: mx, y: my } = mouseRef.current
			// Translate values by scroll progress
			const yA = p * 10
			const yB = p * 18
			const yC = p * 12
			// Mouse parallax (clamped -1..1)
			const clamp = (v: number) => Math.max(-1, Math.min(1, v))
			const nx = clamp(mx)
			const ny = clamp(my)
			// X shift and subtle 3D tilt
			const xA = nx * 6, rxA = -ny * 3, ryA = nx * 4
			const xB = nx * -10, rxB = -ny * 4, ryB = nx * -6
			const xC = nx * 8, rxC = -ny * 3, ryC = nx * 4
			if (aRef.current) aRef.current.style.transform = `translateX(${xA}px) translateY(${yA}px) rotateX(${rxA}deg) rotateY(${ryA}deg)`
			if (bRef.current) bRef.current.style.transform = `translateX(${xB}px) translateY(${yB}px) rotateX(${rxB}deg) rotateY(${ryB}deg)`
			if (cRef.current) cRef.current.style.transform = `translateX(${xC}px) translateY(${yC}px) rotateX(${rxC}deg) rotateY(${ryC}deg)`
		}

		const onScroll = () => {
			if (!rootRef.current) return
			if (raf.current) cancelAnimationFrame(raf.current)
			raf.current = requestAnimationFrame(() => {
				const rect = rootRef.current!.getBoundingClientRect()
				const vh = window.innerHeight || 1
				// progress from -1 (above) to 1 (below)
				pRef.current = Math.max(-1, Math.min(1, 1 - (rect.top + rect.height / 2) / vh))
				applyTransforms()
			})
		}

		const onMouseMove = (e: MouseEvent) => {
			if (!rootRef.current) return
			const rect = rootRef.current.getBoundingClientRect()
			const cx = rect.left + rect.width / 2
			const cy = rect.top + rect.height / 2
			mouseRef.current = {
				x: (e.clientX - cx) / (rect.width / 2),
				y: (e.clientY - cy) / (rect.height / 2)
			}
			if (raf.current) cancelAnimationFrame(raf.current)
			raf.current = requestAnimationFrame(applyTransforms)
		}
		onScroll()
		window.addEventListener('scroll', onScroll, { passive: true })
		window.addEventListener('mousemove', onMouseMove, { passive: true })
		return () => {
			if (raf.current) cancelAnimationFrame(raf.current)
			window.removeEventListener('scroll', onScroll)
			window.removeEventListener('mousemove', onMouseMove)
		}
	}, [session?.access_token])

	return (
		<div ref={rootRef} className="relative w-full h-[320px] sm:h-[360px] lg:h-[420px]" style={{ perspective: '1000px' }}>
			{/* Small KPI chip */}
			<div className="absolute right-2 -top-3 sm:right-4 sm:-top-4 glass-modal rounded-lg border border-white/10 px-3 py-1.5 text-xs shadow-xl">
				MRR: <span className="font-semibold">{(mrr ?? 48400).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})}</span> · +6.2%
			</div>

			{/* Ambient gradient */}
			<div
				className="absolute inset-0 rounded-2xl"
				style={{
					background:
						"radial-gradient(120% 80% at 20% 0%, rgb(var(--color-secondary-500) / 0.08), transparent 60%)," +
						"radial-gradient(120% 80% at 100% 60%, rgb(var(--color-primary-500) / 0.10), transparent 65%)",
					filter: 'saturate(1.1)'
				}}
			/>

			{/* Window A */}
			<div ref={aRef} className="absolute left-2 top-6 sm:left-4 sm:top-6 lg:left-6 lg:top-6 w-[62%] sm:w-[58%] lg:w-[50%] glass-modal liquid-glass rounded-xl border border-white/20 shadow-xl will-change-transform overflow-hidden">
				<WindowChrome title="Dashboard" />
				<div className="p-3 sm:p-4 grid grid-cols-3 gap-3">
					{/* Bars */}
					{Array.from({ length: 9 }).map((_, i) => (
						<div key={i} className="h-16 sm:h-20 rounded bg-white/20 overflow-hidden">
							<div className="h-full w-full origin-bottom bg-primary/30" style={{ transform: `scaleY(${0.35 + ((i * 37) % 60) / 100})` }} />
						</div>
					))}
				</div>
				<div className="sheen" />
			</div>

			{/* Window B */}
			<div ref={bRef} className="absolute right-2 top-10 sm:right-4 lg:right-8 w-[48%] sm:w-[44%] lg:w-[40%] glass-modal liquid-glass rounded-xl border border-white/20 shadow-xl will-change-transform overflow-hidden">
				<WindowChrome title="Cash Flow" />
				<div className="p-3 sm:p-4">
					<Sparkline />
				</div>
				<div className="sheen" />
			</div>

			{/* Window C */}
			<div ref={cRef} className="absolute left-6 bottom-2 sm:left-10 lg:left-14 w-[42%] sm:w-[38%] lg:w-[34%] glass-modal liquid-glass rounded-xl border border-white/20 shadow-xl will-change-transform overflow-hidden">
				<WindowChrome title="Invoices" />
				<div className="p-3 sm:p-4 space-y-2">
					{['Acme Co.', 'Orbit Labs', 'Nova Studio', 'Pioneer LLC'].map((name, i) => (
						<div key={name} className="flex items-center justify-between text-xs">
							<div className="truncate pr-2">{name}</div>
							<div className="text-financial-revenue">${(1200 + i * 480).toLocaleString()}</div>
						</div>
					))}
				</div>
				<div className="sheen" />
			</div>

			{/* AI reply chip - positioned near hero globe area replaced by integrated chip in hero; keep a subtle one below Cash Flow */}
			<motion.div
				className="absolute right-3 sm:right-6 top-[64%] sm:top-[61%] glass-modal rounded-lg border border-white/10 px-3 py-2 text-xs shadow-xl max-w-[240px] sm:max-w-[300px]"
				initial={{ y: -6, opacity: 0 }}
				animate={{ y: 0, opacity: 1 }}
				transition={{ duration: 0.35 }}
			>
				<div className="font-medium mb-0.5">AI</div>
				<div className="text-secondary-contrast leading-snug">
					Revenue dipped due to an 18% drop in ACME services. Suggest: follow‑up and offer 5% off for renewal.
				</div>
			</motion.div>
		</div>
	)
})

function WindowChrome({ title }: { title: string }) {
	return (
		<div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
			<div className="flex items-center gap-1.5">
				<span className="w-2 h-2 rounded-full bg-white/30" />
				<span className="w-2 h-2 rounded-full bg-white/30" />
				<span className="w-2 h-2 rounded-full bg-white/30" />
				<div className="ml-2 text-[10px] tracking-wide text-secondary-contrast">{title}</div>
			</div>
			<div className="text-[10px] text-secondary-contrast">AI‑Ledgr</div>
		</div>
	)
}

function Sparkline() {
	return (
		<svg viewBox="0 0 240 60" className="w-full h-16">
			<defs>
				<linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
					<stop offset="0%" stopColor={`rgb(var(--color-primary-500))`} stopOpacity="0.35" />
					<stop offset="100%" stopColor={`rgb(var(--color-primary-500))`} stopOpacity="0" />
				</linearGradient>
			</defs>
			<path d="M0 40 C 30 10, 60 20, 90 28 S 150 46, 180 30 210 12, 240 26" fill="none" stroke={`rgb(var(--color-primary-500))`} strokeWidth="2" />
			<path d="M0 60 L0 40 C 30 10, 60 20, 90 28 S 150 46, 180 30 210 12, 240 26 L240 60 Z" fill="url(#g)" />
		</svg>
	)
}
