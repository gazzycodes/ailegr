import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import FinancialDataService from '../../services/financialDataService'
import { useAuth } from '../../theme/AuthProvider'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { BarChart3, Sparkles, Globe, ShieldCheck, Star, RefreshCw, Upload, Wand2, FileText, Calendar, DollarSign } from 'lucide-react'
import LandingTopNav from './LandingTopNav'
import { cn } from '../../lib/utils'
import LandingScreens from './LandingScreens'
import PricingGrid from './PricingGrid'
import ToolsTemplates from './ToolsTemplates'
import LandingFooter from './LandingFooter'
import { uploadOcr, previewExpense } from '../../services/expensesService'
import { suggestCategory } from '../../services/aiCategoriesService'

interface LandingProps {
	onGetStarted?: () => void
	onSignIn?: () => void
}

function SpinningGlobe() {
	return (
		<div className="relative mx-auto h-40 w-40 sm:h-48 sm:w-48 lg:h-56 lg:w-56">
			<svg viewBox="0 0 100 100" className="absolute inset-0">
				<defs>
					<radialGradient id="glow" cx="50%" cy="50%" r="50%">
						<stop offset="0%" stopColor={`rgb(var(--color-secondary-500))`} stopOpacity="0.35" />
						<stop offset="100%" stopColor={`rgb(var(--color-primary-500))`} stopOpacity="0.05" />
					</radialGradient>
				</defs>
				<circle cx="50" cy="50" r="48" fill="url(#glow)" />
				<motion.g animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: 'linear' }} originX={50} originY={50}>
					{Array.from({ length: 10 }).map((_, i) => (
						<circle key={i} cx={50 + Math.sin((i / 10) * Math.PI * 2) * 28} cy={50} r="0.8" fill={`rgb(var(--color-primary-500))`} />
					))}
				</motion.g>
				{/* latitude lines */}
				<motion.g animate={{ rotate: -360 }} transition={{ duration: 28, repeat: Infinity, ease: 'linear' }} originX={50} originY={50}>
					{[14, 24, 32].map((ry, idx) => (
						<ellipse key={idx} cx="50" cy="50" rx="34" ry={ry} fill="none" stroke={`rgb(var(--color-primary-500))`} strokeOpacity="0.15" strokeWidth="0.5" />
					))}
				</motion.g>
			</svg>
			<div className="absolute inset-0 rounded-full border border-white/20" />
			<div className="absolute inset-0 animate-spin-slow rounded-full" style={{ boxShadow: 'inset 0 0 20px rgba(0,0,0,0.12)' }} />
		</div>
	)
}

export default function Landing({ onGetStarted, onSignIn }: LandingProps) {
	return (
		<div className="min-h-screen w-full relative">
			{/* Background aurora overlay temporarily removed per design request */}

			<LandingTopNav onGetStarted={onGetStarted} onSignIn={onSignIn} />
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 sm:pt-32 pb-12 sm:pb-16">
				{/* Hero */}
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
					className="text-center"
				>
					<h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-financial-profit bg-clip-text text-transparent">
						AILedgr — AI‑First Accounting That Feels From The Future
					</h1>
					<p className="mt-4 text-base sm:text-lg text-secondary-contrast max-w-3xl mx-auto">
						Automated bookkeeping, instant posting, and live insights — so you don’t have to.
					</p>
					<div className="mt-6 flex items-center justify-center gap-3">
						<button onClick={onGetStarted} className={cn('px-5 py-2.5 rounded-xl text-sm font-semibold focus:ring-focus glow-cta', 'bg-primary/20 text-primary border border-primary/30 hover:bg-primary/25 transition-all')}>Get Started</button>
						<button onClick={onSignIn} className={cn('px-5 py-2.5 rounded-xl text-sm font-semibold focus:ring-focus', 'bg-white/10 border border-white/10 hover:bg-white/15 backdrop-blur-md transition-all')}>Sign In</button>
					</div>
					<div className="mt-8 flex items-center justify-center">
						<SpinningGlobe />
					</div>
					{/* AI Command Bar demo */}
					<motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} className="mt-6 max-w-2xl mx-auto">
						<CommandBarDemo />
					</motion.div>
					{/* Live chips: summary + AI usage */}
					<motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.4 }} className="mt-4">
						<LiveChips />
					</motion.div>
					<div className="mt-8">
						<LandingScreens />
					</div>
				</motion.div>

				{/* Value props */}
				<motion.div
					initial={{ opacity: 0, y: 14 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, amount: 0.2 }}
					transition={{ duration: 0.5 }}
					className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4"
				>
					<ThemedGlassSurface elevation={2} variant="medium" className="p-5">
						<div className="flex items-center gap-2 mb-2"><BarChart3 className="w-4 h-4 text-primary" /><div className="text-sm font-semibold">Command Center</div></div>
						<p className="text-sm text-secondary-contrast">Real‑time KPIs with token‑driven sparklines and conic gauges.</p>
					</ThemedGlassSurface>
					<ThemedGlassSurface elevation={2} variant="medium" className="p-5">
						<div className="flex items-center gap-2 mb-2"><Sparkles className="w-4 h-4 text-primary" /><div className="text-sm font-semibold">Liquid Glass UI</div></div>
						<p className="text-sm text-secondary-contrast">Elevation tiers and glow effects — zero hardcoded values.</p>
					</ThemedGlassSurface>
					<ThemedGlassSurface elevation={2} variant="medium" className="p-5">
						<div className="flex items-center gap-2 mb-2"><Globe className="w-4 h-4 text-primary" /><div className="text-sm font-semibold">3D Financial Universe</div></div>
						<p className="text-sm text-secondary-contrast">Explore assets, liabilities, and flows in an immersive canvas.</p>
					</ThemedGlassSurface>
				</motion.div>

				{/* How it works */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, amount: 0.2 }}
					transition={{ duration: 0.55 }}
					className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4" id="how-it-helps"
				>
					{[
						{ h: '1 · Capture', p: 'Upload invoices and receipts (PDF, images, CSV). Built‑in OCR extracts key fields.' },
						{ h: '2 · Classify', p: 'AI suggests categories; our resolver maps to the right accounts with safeguards.' },
						{ h: '3 · Post', p: 'Idempotent, balanced entries posted in one click. Previews ensure confidence.' }
					].map((f, i) => (
						<ThemedGlassSurface key={i} elevation={1} variant="light" className="p-4">
							<div className="text-sm font-semibold mb-1">{f.h}</div>
							<p className="text-sm text-secondary-contrast">{f.p}</p>
						</ThemedGlassSurface>
					))}
				</motion.div>

				{/* Removed 3D Universe highlight section per feedback */}

				{/* Product sections removed per feedback */}

				{/* Trust row removed per feedback */}

				{/* Prompt strip removed per feedback */}

				{/* AI micro‑demos */}
				<motion.div
					initial={{ opacity: 0, y: 24 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, amount: 0.2 }}
					transition={{ duration: 0.6 }}
					className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
				>
					<OcrMini />
					<CategorySuggestMini />
					<AnomalyMini />
					<NlPostingMini onGetStarted={onGetStarted} />
				</motion.div>

				{/* Security band */}
				<motion.div
					initial={{ opacity: 0, y: 16 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, amount: 0.2 }}
					transition={{ duration: 0.5 }}
					className="mt-12"
				>
					<SecurityBand />
				</motion.div>

				{/* Testimonials */}
				<motion.div
					initial={{ opacity: 0, y: 16 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, amount: 0.2 }}
					transition={{ duration: 0.5 }}
					className="mt-10"
				>
					<TestimonialsStrip />
				</motion.div>

				{/* Pricing */}
				<div className="mt-12">
					<PricingGrid />
				</div>

				{/* Tools & Templates */}
				<div className="mt-12" id="resources">
					<ToolsTemplates />
				</div>

				{/* CTA band — asymmetric premium glass */}
				<ThemedGlassSurface elevation={2} variant="medium" className="mt-12 p-6 relative overflow-hidden">
					{/* Diagonal energy beam */}
					<motion.div
						className="pointer-events-none absolute -top-8 -left-[10%] w-[130%] h-24 -rotate-2"
						style={{ background: 'linear-gradient(90deg, rgb(var(--color-primary-500) / 0.10), rgb(var(--color-secondary-500) / 0.08), transparent 80%)' }}
						animate={{ x: [0, 18, 0] }}
						transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
					/>
					{/* Glow orb */}
					<div className="pointer-events-none absolute -bottom-24 -right-24 w-80 h-80 rounded-full blur-3xl" style={{ background: 'radial-gradient(closest-side, rgb(var(--color-primary-500) / 0.12), transparent)' }} />

					<div className="relative grid items-center gap-4 md:grid-cols-[1.6fr_1fr]">
						<div>
							<div className="text-xl sm:text-2xl font-semibold">Ready to experience AI‑First Accounting?</div>
							<div className="text-sm text-secondary-contrast">Start in minutes. No credit card required.</div>
						</div>
						<div className="justify-self-end">
							<div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 backdrop-blur-xl p-1.5">
								<button onClick={onGetStarted} className={cn('rounded-full text-sm font-semibold focus:ring-focus glow-cta transition-all', 'px-4 py-2 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/25')}>Get Started</button>
								<button onClick={onSignIn} className={cn('rounded-full text-sm font-semibold focus:ring-focus transition-all', 'px-4 py-2 bg-white/0 text-secondary-contrast hover:bg-white/10 border border-white/10')}>Sign In</button>
							</div>
						</div>
					</div>
				</ThemedGlassSurface>

				{/* FAQ */}
				<motion.div
					initial={{ opacity: 0, y: 24 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, amount: 0.2 }}
					transition={{ duration: 0.6 }}
					className="mt-12" id="faq"
				>
					<ThemedGlassSurface elevation={1} variant="light" className="p-6">
						<div className="text-lg font-semibold mb-4">Frequently asked questions</div>
						<div className="text-sm columns-1 md:columns-2 gap-4">
							{[
								{ q: 'What is AI‑First Accounting?', a: 'A modern system that automates bookkeeping tasks and augments decisions with real‑time insights.' },
								{ q: 'Is my data secure?', a: 'Transactions are validated via double‑entry rules; access is scoped and audited. Upcoming: SSO & role‑based controls.' },
								{ q: 'Do you support receipts and invoices?', a: 'Yes. Upload receipts (PDF/images) for OCR; create invoices and record revenue with overpayment handling.' },
								{ q: 'Can I switch later?', a: 'Yes. Import your chart of accounts and start posting immediately using setup helpers.' },
							].map((item, i) => (
								<div key={i} className="break-inside-avoid mb-4">
									<FaqItem question={item.q} answer={item.a} />
								</div>
							))}
						</div>
					</ThemedGlassSurface>
				</motion.div>
			</div>

			<LandingFooter />
		</div>
	)
}

function CommandBarDemo() {
	const samples = [
		"Why is revenue down this month?",
		"Show top 5 vendors by spend",
		"Post $1,200 Adobe subscription for Mar 12",
	]
	return (
		<div className="relative glass-modal glass-strong rounded-2xl border border-white/10 shadow-xl p-2 sm:p-3 overflow-hidden">
			<div className="absolute inset-0 sheen pointer-events-none" />
			<div className="flex items-center gap-2">
				<div className="px-2 py-1 rounded-lg bg-white/10 text-[10px] uppercase tracking-wide border border-white/10 flex items-center gap-1">
					<svg viewBox="0 0 20 20" className="w-3 h-3"><circle cx="10" cy="10" r="9" fill={`rgb(var(--color-primary-500) / 0.25)`} /></svg>
					<span>AI Command</span>
				</div>
				<div className="flex-1">
					<div className="text-left text-xs text-secondary-contrast">Type a command or pick a suggestion</div>
				</div>
				<button className="text-[10px] px-2 py-1 rounded-lg bg-primary/15 text-primary border border-primary/25 hover:bg-primary/20 transition-colors">Try</button>
			</div>
			<div className="mt-2 flex flex-wrap gap-2">
				{samples.map((s) => (
					<motion.button
						key={s}
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
						className="text-xs px-2.5 py-1.5 rounded-xl bg-white/8 border border-white/10 hover:bg-white/12 transition-colors backdrop-blur-sm"
					>
						{s}
					</motion.button>
				))}
			</div>
		</div>
	)
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
	const [open, setOpen] = useState(false)
	return (
		<div className="rounded-xl border border-white/10 bg-white/5 shadow-xl overflow-hidden">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="w-full flex items-center justify-between px-4 py-3 text-left font-medium"
				aria-expanded={open}
			>
				<span>{question}</span>
				<motion.span
					className="ml-4 inline-block text-secondary-contrast"
					animate={{ rotate: open ? 180 : 0 }}
					transition={{ duration: 0.2 }}
				>
					▾
				</motion.span>
			</button>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						key="content"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.25 }}
						className="px-4 pb-4 text-secondary-contrast"
					>
						{answer}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}

function HeroAIChip() {
	return (
		<motion.div
			className="glass-modal rounded-lg border border-white/10 px-3 py-2 text-xs shadow-xl max-w-[320px]"
			initial={{ y: -6, opacity: 0 }}
			animate={{ y: 0, opacity: 1 }}
			transition={{ duration: 0.35 }}
		>
			<div className="font-medium mb-0.5">AI</div>
			<div className="text-secondary-contrast leading-snug">
				Revenue dipped due to an 18% drop in ACME services. Suggest: follow‑up and offer 5% off for renewal.
			</div>
		</motion.div>
	)
}

function LiveChips() {
	const { session } = useAuth()
	const [metrics, setMetrics] = useState<{ revenue?: number; expenses?: number; profit?: number } | null>(null)
	const [ai, setAi] = useState<{ minute?: { remaining?: number; limit?: number; resetSeconds?: number }; day?: { remaining?: number; limit?: number } } | null>(null)
	const [serverOk, setServerOk] = useState<boolean | null>(null)
	useEffect(() => {
		;(async () => {
			// Do not call protected APIs on public landing when not logged in
			if (!session?.access_token) { setServerOk(false); return }
			try {
				const dash = await FinancialDataService.getDashboardData()
				setMetrics({
					revenue: dash?.metrics?.totalRevenue,
					expenses: dash?.metrics?.totalExpenses,
					profit: dash?.metrics?.netProfit
				})
				setServerOk(true)
			} catch {}
			try {
				const usage = await FinancialDataService.getAiUsage()
				setAi(usage?.status || null)
				setServerOk(true)
			} catch {
				if (serverOk === null) setServerOk(false)
			}
		})()
	}, [session?.access_token])
	return (
		<div className="flex flex-wrap items-center justify-center gap-2">
			<div className="glass-modal rounded-xl border border-white/10 px-3 py-1.5 text-xs shadow">
				<strong className="mr-1">Summary:</strong>
				<span className="text-secondary-contrast">Rev {(metrics?.revenue ?? 48400).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})}</span>
				<span className="mx-1">·</span>
				<span className="text-secondary-contrast">Exp {(metrics?.expenses ?? 31800).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})}</span>
				<span className="mx-1">·</span>
				<span className="text-secondary-contrast">Profit {(metrics?.profit ?? 16600).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})}</span>
			</div>
			<div className="glass-modal rounded-xl border border-white/10 px-3 py-1.5 text-xs shadow">
				<strong className="mr-1">AI</strong>
				<span className="text-secondary-contrast">{ai?.minute?.remaining ?? 15}/{ai?.minute?.limit ?? 15} min</span>
				<span className="mx-1">·</span>
				<span className="text-secondary-contrast">{ai?.day?.remaining ?? 200}/{ai?.day?.limit ?? 200} day</span>
			</div>
			{serverOk === false && (
				<div className="glass-modal rounded-xl border border-white/10 px-3 py-1.5 text-xs shadow text-amber-300">
					Server offline — showing sample data
				</div>
			)}
		</div>
	)
}

function PromptStrip() {
	const prompts = [
		'Why is revenue down this month?',
		'Show top 5 vendors by spend',
		'Post $500 AWS for Mar 10',
		'What categories grew 20% QoQ?',
	]
	return (
		<div className="glass-modal rounded-2xl border border-white/10 p-3 overflow-hidden">
			<div className="flex flex-wrap items-center gap-2 justify-center">
				{prompts.map((p) => (
					<motion.span key={p} whileHover={{ scale: 1.03 }} className="px-3 py-1.5 text-xs rounded-xl bg-white/8 border border-white/10">
						{p}
					</motion.span>
				))}
			</div>
		</div>
	)
}

function OcrMini() {
	const [extracting, setExtracting] = useState(false)
	const [text, setText] = useState<string>('')
	const [error, setError] = useState<string>('')
	const [extractedDate, setExtractedDate] = useState<string>('')
	const [extractedAmount, setExtractedAmount] = useState<string>('')

	const onFile = async (f?: File) => {
		if (!f) return
		setExtracting(true)
		setError('')
		setText('')
		try {
			const res = await uploadOcr(f)
			const raw = String(res?.text || '')
			const trimmed = raw.trim()
			setText(trimmed.slice(0, 300))
			// Extract date (ISO-like, MM/DD/YYYY, or Month DD, YYYY)
			const iso = trimmed.match(/\b\d{4}-\d{2}-\d{2}\b/)
			const mdY = trimmed.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/)
			const monthName = trimmed.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s*(\d{2,4}))?\b/)
			let dateVal = ''
			if (iso) dateVal = iso[0]
			else if (mdY) {
				let m = parseInt(mdY[1], 10)
				let d = parseInt(mdY[2], 10)
				let y = parseInt(mdY[3], 10); if (y < 100) y = 2000 + y
				if (m >= 1 && m <= 12 && d >= 1 && d <= 31) dateVal = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
			} else if (monthName) {
				const now = new Date()
				const d = new Date(`${monthName[1]} ${monthName[2]} ${monthName[3] || now.getFullYear()}`)
				if (!isNaN(d.getTime())) dateVal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
			}
			setExtractedDate(dateVal)
			// Extract amount like $1,234.56 or 1234.56
			const amt = trimmed.match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/)
			setExtractedAmount(amt ? amt[1].replace(/,/g,'') : '')
		} catch (e: any) {
			setError(e?.message || 'OCR failed')
		} finally { setExtracting(false) }
	}

	return (
		<ThemedGlassSurface elevation={1} variant="light" className="p-4">
			<div className="flex items-center justify-between mb-2">
				<div className="text-sm font-semibold flex items-center gap-2"><Upload className="w-4 h-4 text-primary" /> AI Extract</div>
				<label className={cn('text-xs px-2 py-1 rounded-lg border transition-colors cursor-pointer', 'bg-white/10 border-white/10 hover:bg-white/15')}>Choose
					<input type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.txt,.docx" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || undefined)} />
				</label>
			</div>
			<div className="text-xs text-secondary-contrast">Upload a receipt/invoice — a smart preview shows key fields.</div>
			<div className="mt-2 text-[11px] rounded-lg bg-white/5 border border-white/10 p-2 min-h-[56px]">
				{extracting ? 'Extracting…' : error ? <span className="text-red-400">{error}</span> : (
					<div className="grid grid-cols-1 gap-2">
						<div className="flex items-center gap-2 text-secondary-contrast"><FileText className="w-3 h-3" />
							<span className="truncate">{text ? text.slice(0, 90) : 'No file uploaded yet.'}</span>
						</div>
						{text && (
							<div className="flex flex-wrap gap-2">
								<span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 inline-flex items-center gap-1"><Calendar className="w-3 h-3" />
									<span>Date: {extractedDate || '—'}</span>
								</span>
								<span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 inline-flex items-center gap-1"><DollarSign className="w-3 h-3" />
									<span>Amount: {extractedAmount ? `$${Number(extractedAmount).toLocaleString()}` : '—'}</span>
								</span>
							</div>
						)}
					</div>
				)}
			</div>
		</ThemedGlassSurface>
	)
}

function CategorySuggestMini() {
	const [desc, setDesc] = useState('Adobe Creative Cloud annual subscription')
	const [loading, setLoading] = useState(false)
	const [result, setResult] = useState<any>(null)
	const [err, setErr] = useState<string>('')

	const run = async () => {
		setLoading(true); setErr(''); setResult(null)
		try {
			const out = await suggestCategory(desc, 'Adobe')
			setResult(out)
		} catch (e: any) {
			setErr(e?.message || 'Suggestion failed')
		} finally { setLoading(false) }
	}

	return (
		<ThemedGlassSurface elevation={1} variant="light" className="p-4">
			<div className="text-sm font-semibold mb-2">AI Category</div>
			<div className="text-xs text-secondary-contrast mb-2">Enter an expense description and get a suggested category.</div>
			<div className="flex items-center gap-2">
				<input value={desc} onChange={(e) => setDesc(e.target.value)} className="flex-1 text-xs px-2 py-1 rounded-lg bg-white/10 border border-white/10 focus:outline-none" />
				<button onClick={run} className="text-xs px-2 py-1 rounded-lg bg-primary/15 text-primary border border-primary/25 hover:bg-primary/20 transition-colors disabled:opacity-60" disabled={loading}>
					{loading ? 'Thinking…' : 'Suggest'}
				</button>
			</div>
			<div className="mt-2 text-[11px] rounded-lg bg-white/5 border border-white/10 p-2 min-h-[56px]">
				{err ? <span className="text-red-400">{err}</span> : result ? (
					<div>
						<div><strong>Name:</strong> {result?.category?.name || result?.suggestion?.name || '—'}</div>
						<div><strong>Account:</strong> {result?.category?.accountCode || result?.suggestion?.accountCode || '—'}</div>
						<div><strong>Confidence:</strong> {(result?.category?.confidence ?? result?.suggestion?.confidence ?? 0).toFixed(2)}</div>
					</div>
				) : 'No suggestion yet.'}
			</div>
		</ThemedGlassSurface>
	)
}

function AnomalyMini() {
	const { session } = useAuth()
	const [msg, setMsg] = useState<string>('Loading…')
	const [trend, setTrend] = useState<'up'|'down'|'flat'>('flat')
	const [delta, setDelta] = useState<number>(0)
	const [topDriver, setTopDriver] = useState<string>('')
	const [loading, setLoading] = useState<boolean>(false)

	const fetchInsight = async () => {
		try {
			setLoading(true)
			if (!session?.access_token) {
				setMsg('Revenue $20,137.88 — steady upward trend. Consider upselling top clients.')
				setTrend('up')
				setDelta(0.07)
				setTopDriver('Subscriptions')
				return
			}
			const data = await FinancialDataService.getDashboardData()
			const insights = Array.isArray(data?.aiInsights) ? data.aiInsights : []
			const first = insights[0] || { message: 'Revenue $20,137.88 — steady upward trend. Consider upselling top clients.', trend: 'up', delta: 0.08, driver: 'Top 3 customers' }
			setMsg(first.message)
			setTrend(first.trend === 'down' ? 'down' : first.trend === 'up' ? 'up' : 'flat')
			setDelta(Math.abs(Number(first.delta)) || 0.08)
			setTopDriver(first.driver || 'Enterprise renewals')
		} catch {
			setMsg('Revenue $20,137.88 — steady upward trend. Consider upselling top clients.')
			setTrend('up')
			setDelta(0.07)
			setTopDriver('Subscriptions')
		}
		finally { setLoading(false) }
	}

	useEffect(() => { fetchInsight() }, [session?.access_token])

	return (
		<ThemedGlassSurface elevation={1} variant="light" className="p-4">
			<div className="flex items-center justify-between mb-2">
				<div className="text-sm font-semibold">Anomaly Alert</div>
				<button onClick={fetchInsight} className="text-xs px-2 py-1 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 transition-colors disabled:opacity-60" disabled={loading}>
					<RefreshCw className="w-3 h-3 inline mr-1" /> Refresh
				</button>
			</div>
			<div className="text-xs text-secondary-contrast mb-2 min-h-[36px]">{msg}</div>
			<div className="grid grid-cols-3 gap-2 text-center">
				<div className="rounded-lg bg-white/6 border border-white/10 p-2">
					<div className="text-[10px] uppercase tracking-wide text-secondary-contrast">Trend</div>
					<div className={cn('text-sm font-semibold', trend==='up'?'text-financial-profit':trend==='down'?'text-financial-expense':'')}>{trend.toUpperCase()}</div>
				</div>
				<div className="rounded-lg bg-white/6 border border-white/10 p-2">
					<div className="text-[10px] uppercase tracking-wide text-secondary-contrast">Delta</div>
					<div className="text-sm font-semibold">{(delta*100).toFixed(1)}%</div>
				</div>
				<div className="rounded-lg bg-white/6 border border-white/10 p-2">
					<div className="text-[10px] uppercase tracking-wide text-secondary-contrast">Driver</div>
					<div className="text-sm font-semibold truncate">{topDriver}</div>
				</div>
			</div>
		</ThemedGlassSurface>
	)
}

function NlPostingMini({ onGetStarted }: { onGetStarted?: () => void }) {
	const [input, setInput] = useState('Post $500 AWS for Mar 10')
	const [loading, setLoading] = useState(false)
	const [preview, setPreview] = useState<any>(null)
	const [err, setErr] = useState<string>('')

	function parseCommand(text: string) {
		const amtMatch = text.match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/i)
		const amount = amtMatch ? parseFloat(amtMatch[1]) : NaN
		const vendorMatch = text.replace(/post|\$[\d\.]+|for|on|\bin\b/gi, ' ').trim().split(/\s+/).filter(Boolean)
		let vendor = vendorMatch.slice(0, 3).join(' ')
		const dateMatch = text.match(/\b([A-Za-z]{3,9}\s+\d{1,2}(?:,?\s*\d{2,4})?)\b/i)
		const now = new Date()
		let dateStr = now.toISOString().slice(0,10)
		if (dateMatch) {
			const d = new Date(dateMatch[1] + (dateMatch[1].match(/\d{4}/) ? '' : ` ${now.getFullYear()}`))
			if (!isNaN(d.getTime())) dateStr = d.toISOString().slice(0,10)
		}
		if (!vendor || vendor.toLowerCase() === 'post') vendor = 'Vendor'
		return { amount, vendorName: vendor, date: dateStr, description: text }
	}

	const runPreview = async () => {
		setLoading(true); setErr(''); setPreview(null)
		try {
			const parsed = parseCommand(input)
			if (!(parsed.amount > 0)) throw new Error('Could not parse amount')
			const res = await previewExpense({
				vendorName: parsed.vendorName,
				amount: parsed.amount.toFixed(2),
				date: parsed.date,
				description: parsed.description
			})
			setPreview(res)
		} catch (e: any) {
			// Show a beautiful sample preview if server unavailable, plus CTA
			setErr('')
			setPreview({
				dateUsed: new Date().toISOString().slice(0,10),
				policy: 'Sample — balanced entries',
				entries: [
					{ type: 'debit', accountCode: '6110', accountName: 'Software Subscriptions', amount: 500 },
					{ type: 'credit', accountCode: '1010', accountName: 'Cash', amount: 500 }
				]
			})
		} finally { setLoading(false) }
	}

	return (
		<ThemedGlassSurface elevation={1} variant="light" className="p-4">
			<div className="text-sm font-semibold mb-2">Natural‑Language Posting</div>
			<div className="text-xs text-secondary-contrast mb-2">Type a command and preview balanced entries (no data saved).</div>
			<div className="flex items-center gap-2">
				<input value={input} onChange={(e) => setInput(e.target.value)} className="flex-1 text-xs px-2 py-1 rounded-lg bg-white/10 border border-white/10 focus:outline-none" />
				<button onClick={runPreview} className="text-xs px-2 py-1 rounded-lg bg-primary/15 text-primary border border-primary/25 hover:bg-primary/20 transition-colors disabled:opacity-60" disabled={loading}>
					<Wand2 className="w-3 h-3 inline mr-1" /> {loading ? 'Previewing…' : 'Preview'}
				</button>
			</div>
			<div className="mt-2 text-[11px] rounded-lg bg-white/5 border border-white/10 p-2 min-h-[56px]">
				{err ? <span className="text-red-400">{err}</span> : preview ? (
					<div>
						<div className="mb-1"><strong>Date:</strong> {preview?.dateUsed || '—'} <span className="ml-2 text-secondary-contrast">{preview?.policy}</span></div>
						<div className="font-semibold mb-1">Entries</div>
						<ul className="space-y-1">
							{Array.isArray(preview?.entries) ? preview.entries.map((e: any, i: number) => (
								<li key={i} className="flex items-center justify-between">
									<span className={cn('rounded px-1', e.type === 'debit' ? 'text-financial-revenue' : 'text-financial-expense')}>{e.type.toUpperCase()}</span>
									<span className="text-secondary-contrast">{e.accountCode} — {e.accountName}</span>
									<span className="font-semibold">${Number(e.amount).toLocaleString()}</span>
								</li>
							)) : '—'}
						</ul>
					</div>
				) : (
					<div className="flex items-center justify-between">
						<span>No preview yet.</span>
						<button onClick={onGetStarted} className="text-xs px-2 py-1 rounded-lg bg-primary/15 text-primary border border-primary/25 hover:bg-primary/20 transition-colors">Create an account</button>
					</div>
				)}
			</div>
		</ThemedGlassSurface>
	)
}

function SecurityBand() {
	return (
		<ThemedGlassSurface elevation={2} variant="medium" className="p-5">
			<div className="flex items-center gap-2 mb-3"><ShieldCheck className="w-5 h-5 text-primary" /><div className="text-sm font-semibold">Security & Compliance</div></div>
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
				<div className="rounded-lg bg-white/6 border border-white/10 p-3">
					<div className="font-medium mb-1">Encryption</div>
					<div className="text-secondary-contrast">TLS in transit · scoped access · signed URLs</div>
				</div>
				<div className="rounded-lg bg-white/6 border border-white/10 p-3">
					<div className="font-medium mb-1">Posting Engine</div>
					<div className="text-secondary-contrast">Balanced double‑entry invariants · idempotency</div>
				</div>
				<div className="rounded-lg bg-white/6 border border-white/10 p-3">
					<div className="font-medium mb-1">Compliance</div>
					<div className="text-secondary-contrast">SOC2 in progress · regional data residency (soon)</div>
				</div>
			</div>
		</ThemedGlassSurface>
	)
}

function TestimonialsStrip() {
	const items = [
		{ name: 'Avery — CFO', quote: 'The only accounting UI my team actually enjoys using.' },
		{ name: 'Jordan — Founder', quote: 'Setup took minutes and the insights are instant.' },
		{ name: 'Casey — Controller', quote: 'Posting engine caught things our old system missed.' }
	]
	return (
		<ThemedGlassSurface elevation={1} variant="light" className="p-4">
			<div className="text-sm font-semibold mb-3 flex items-center gap-2"><Star className="w-4 h-4 text-primary" /> What leaders say</div>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
				{items.map((t, i) => (
					<div key={i} className="rounded-lg bg-white/6 border border-white/10 p-3">
						<div className="text-xs text-secondary-contrast mb-1">“{t.quote}”</div>
						<div className="text-[11px] font-medium">{t.name}</div>
					</div>
				))}
			</div>
		</ThemedGlassSurface>
	)
}


