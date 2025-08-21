import { useEffect, useRef, useState } from 'react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { cn } from '../../lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

export default function LandingTopNav({ onSignIn, onGetStarted }: { onSignIn?: () => void; onGetStarted?: () => void }) {
	const [visible, setVisible] = useState(true)
	const lastY = useRef(0)
	const [menu, setMenu] = useState<null | 'business' | 'accountants' | 'learn'>(null)
	const [mobileOpen, setMobileOpen] = useState(false)
	// Collapse factor (0 → fully open, 1 → fully compact)
	const [collapse, setCollapse] = useState(0)
	const shrink = collapse > 0.05
	// Scroll progress (0 → top, 1 → bottom)
	const [progress, setProgress] = useState(0)
	// Pointer-driven light halo
	const [pointer, setPointer] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
	const [pointerActive, setPointerActive] = useState(false)

	useEffect(() => {
		const onScroll = () => {
			const y = window.scrollY
			lastY.current = y
			// Clamp collapse over the first 260px of scroll
			const c = Math.max(0, Math.min(1, y / 260))
			setCollapse(c)
			// Page progress (for top bar)
			const h = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
			const p = h > 0 ? Math.max(0, Math.min(1, y / h)) : 0
			setProgress(p)
			setVisible(true)
			if (c > 0.05) { setMenu(null); setMobileOpen(false) }
		}
		window.addEventListener('scroll', onScroll, { passive: true })
		return () => window.removeEventListener('scroll', onScroll)
	}, [])

	useEffect(() => {
		const onClick = (e: MouseEvent) => {
			const target = e.target as HTMLElement
			if (!target.closest?.('#landing-topnav')) { setMenu(null); setMobileOpen(false) }
		}
		document.addEventListener('click', onClick)
		return () => document.removeEventListener('click', onClick)
	}, [])

	// Derived animation values
	const scaleX = 1 - 0.22 * collapse // up to ~0.78 width
	const scaleY = 1 - 0.14 * collapse // up to ~0.86 height
	const radius = 16 + 12 * collapse // subtle rounding increase while collapsing
	const waveShift = collapse * 140
	const pointerRadius = 140 - 60 * collapse

	return (
		<div id="landing-topnav" className="fixed top-0 left-0 right-0 z-40 px-4 sm:px-6 lg:px-8 pt-4">
			<motion.div
				initial={false}
				animate={{ scaleX, scaleY }}
				transition={{ type: 'spring', stiffness: 260, damping: 24 }}
				style={{ transformOrigin: 'center top' }}
			>
				<ThemedGlassSurface
					variant="light"
					elevation={2}
					className={cn(
						'relative px-4 transition-all duration-500',
						shrink ? 'py-2 rounded-xl' : 'py-3 rounded-2xl',
						visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
					)}
					style={{ borderRadius: radius }}
					onMouseMove={(e) => {
						const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
						setPointer({ x: e.clientX - r.left, y: e.clientY - r.top })
						setPointerActive(true)
					}}
					onMouseLeave={() => setPointerActive(false)}
				>
					{/* Scroll progress (top border) */}
					<motion.div
						className="absolute left-0 top-0 h-[2px] rounded-t-2xl"
						style={{ background: 'linear-gradient(90deg, rgb(var(--color-primary-500) / 0.7), rgb(var(--color-secondary-500) / 0.7))' }}
						initial={{ width: 0 }}
						animate={{ width: `${Math.max(2, Math.round(progress * 100))}%` }}
						transition={{ type: 'tween', duration: 0.15 }}
					/>

					{/* Liquid wave overlay */}
					<motion.div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ borderRadius: radius }}>
						<motion.div
							className="absolute -inset-x-1/2 top-0 h-full"
							style={{
								background: 'linear-gradient(90deg, rgba(168,85,247,0.10), rgba(6,182,212,0.10), rgba(168,85,247,0.10))',
								filter: 'blur(18px)'
							}}
							animate={{ x: waveShift }}
							transition={{ type: 'spring', stiffness: 120, damping: 24 }}
						/>
					</motion.div>

					{/* Pointer light halo */}
					<motion.div
						className="pointer-events-none absolute inset-0"
						style={{ borderRadius: radius }}
						animate={{ opacity: pointerActive ? 1 : 0 }}
						transition={{ duration: 0.25 }}
					>
						<div
							className="absolute"
							style={{
								left: 0,
								top: 0,
								right: 0,
								bottom: 0,
								background: `radial-gradient(${Math.max(80, pointerRadius)}px circle at ${pointer.x}px ${pointer.y}px, rgb(var(--color-neutral-0) / 0.12), transparent 60%)`
							}}
						/>
					</motion.div>

					{/* Three-column grid: left logo, centered nav (xl), right actions + mobile menu */}
					<div className={cn('w-full grid items-center', 'grid-cols-2 xl:grid-cols-3', shrink ? 'gap-2' : 'gap-4')}>
						<div className="flex items-center gap-3">
							<div className="text-sm font-bold tracking-tight whitespace-nowrap"><span className="text-primary">AI</span>Ledgr</div>
						</div>
						<nav className={cn('hidden xl:flex items-center justify-center text-sm', shrink ? 'gap-3' : 'gap-5')}>
							<motion.button whileHover={{ y: -1, scale: 1.05 }} whileTap={{ scale: 0.98 }} className={cn(shrink ? 'px-2.5 py-1' : 'px-3 py-1.5', 'rounded-lg hover:bg-white/10 text-secondary-contrast whitespace-nowrap')} onClick={(e) => { e.stopPropagation(); setMenu(m => m === 'business' ? null : 'business') }}>For Business ▾</motion.button>
							<motion.button whileHover={{ y: -1, scale: 1.05 }} whileTap={{ scale: 0.98 }} className={cn(shrink ? 'px-2.5 py-1' : 'px-3 py-1.5', 'rounded-lg hover:bg-white/10 text-secondary-contrast whitespace-nowrap')} onClick={(e) => { e.stopPropagation(); setMenu(m => m === 'accountants' ? null : 'accountants') }}>Accountants ▾</motion.button>
							<motion.button whileHover={{ y: -1, scale: 1.05 }} whileTap={{ scale: 0.98 }} className={cn(shrink ? 'px-2.5 py-1' : 'px-3 py-1.5', 'rounded-lg hover:bg-white/10 text-secondary-contrast whitespace-nowrap')} onClick={() => { setMenu(null); const el = document.querySelector('#pricing'); el && el.scrollIntoView({ behavior: 'smooth' }) }}>Pricing</motion.button>
							<motion.button whileHover={{ y: -1, scale: 1.05 }} whileTap={{ scale: 0.98 }} className={cn(shrink ? 'px-2.5 py-1' : 'px-3 py-1.5', 'rounded-lg hover:bg-white/10 text-secondary-contrast whitespace-nowrap')} onClick={(e) => { e.stopPropagation(); setMenu(m => m === 'learn' ? null : 'learn') }}>Learn & Support ▾</motion.button>
						</nav>
						<div className={cn('flex items-center justify-end', shrink ? 'gap-2' : 'gap-3')}>
							<button className={cn('hidden sm:inline-flex rounded-lg text-sm bg-white/10 border border-white/10 hover:bg-white/15 transition-colors', shrink ? 'px-3 py-1.5' : 'px-4 py-2')} onClick={onSignIn}>Sign In</button>
							<button className={cn('rounded-lg text-sm bg-primary/20 text-primary border border-primary/30 hover:bg-primary/25 glow-cta transition-all', shrink ? 'px-3.5 py-1.5' : 'px-4 py-2')} onClick={onGetStarted}>Get Started</button>
							{/* Mobile/Tablet menu toggle (md–lg and below) */}
							<button className="xl:hidden px-3 py-2 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 ml-1" onClick={(e) => { e.stopPropagation(); setMobileOpen(v => !v) }} aria-label="Open menu">
								<span className="relative inline-flex items-center justify-center w-5 h-4">
									<span className="absolute inline-block w-1.5 h-1.5 rounded-full bg-primary" style={{ top: 2, left: 2 }} />
									<span className="absolute inline-block w-1.5 h-1.5 rounded-full bg-primary/70" style={{ top: 2, right: 2 }} />
									<span className="absolute inline-block w-1.5 h-1.5 rounded-full bg-primary/50" style={{ bottom: 2, left: '50%', transform: 'translateX(-50%)' }} />
								</span>
							</button>
						</div>
					</div>
				</ThemedGlassSurface>
			</motion.div>
			{/* Mobile/Tablet overlay menu */}
			<AnimatePresence>
				{mobileOpen && (
					<>
						<motion.div className="fixed inset-0 z-30" initial={{ opacity: 0 }} animate={{ opacity: 0.12 }} exit={{ opacity: 0 }} style={{ background: 'black' }} onClick={() => setMobileOpen(false)} />
						<motion.div className="fixed top-16 left-4 right-4 z-40 xl:hidden" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
							<ThemedGlassSurface variant="light" elevation={2} className="p-3">
								<nav className="flex flex-col text-sm">
									<button className="px-3 py-2 rounded-lg text-left hover:bg-white/10" onClick={() => { setMobileOpen(false); setMenu(null); const el = document.querySelector('#how-it-helps'); el && el.scrollIntoView({ behavior: 'smooth' }) }}>For Business</button>
									<button className="px-3 py-2 rounded-lg text-left hover:bg-white/10" onClick={() => { setMobileOpen(false); setMenu(null); const el = document.querySelector('#how-it-helps'); el && el.scrollIntoView({ behavior: 'smooth' }) }}>Accountants</button>
									<button className="px-3 py-2 rounded-lg text-left hover:bg-white/10" onClick={() => { setMobileOpen(false); const el = document.querySelector('#pricing'); el && el.scrollIntoView({ behavior: 'smooth' }) }}>Pricing</button>
									<button className="px-3 py-2 rounded-lg text-left hover:bg-white/10" onClick={() => { setMobileOpen(false); const el = document.querySelector('#resources') || document.querySelector('#faq'); el && el.scrollIntoView({ behavior: 'smooth' }) }}>Learn & Support</button>
									<div className="mt-2 pt-2 border-t border-white/10">
										<button className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 mb-2" onClick={() => { setMobileOpen(false); onSignIn?.() }}>Sign In</button>
										<button className="w-full px-3 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/25" onClick={() => { setMobileOpen(false); onGetStarted?.() }}>Get Started</button>
									</div>
								</nav>
							</ThemedGlassSurface>
						</motion.div>
					</>
				)}
			</AnimatePresence>
		</div>
	)
}


