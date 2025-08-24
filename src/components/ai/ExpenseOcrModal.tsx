import { useState } from 'react'
import { motion } from 'framer-motion'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { ModalPortal } from '../layout/ModalPortal'
import ExpensesService from '../../services/expensesService'

interface ExpenseOcrModalProps {
	open: boolean
	onClose: () => void
}

export default function ExpenseOcrModal({ open, onClose }: ExpenseOcrModalProps) {
	const [file, setFile] = useState<File | null>(null)
	const [vendor, setVendor] = useState('')
	const [vendorInvoiceNo, setVendorInvoiceNo] = useState('')
	const [amount, setAmount] = useState('')
	const [date, setDate] = useState('')
	const [dueDays, setDueDays] = useState('')
	const [preview, setPreview] = useState<any | null>(null)
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [attachedReceiptUrl, setAttachedReceiptUrl] = useState<string | null>(null)
	const [dupState, setDupState] = useState<{ checked: boolean; duplicate: boolean; info?: any } | null>(null)
	const [checkingDup, setCheckingDup] = useState(false)

	if (!open) return null

	const handleUpload = async () => {
		try {
			setError(null)
			if (!file) return
			const res = await ExpensesService.uploadOcr(file)
			// naive extraction helpers
			const text = (res.text || '').toLowerCase()
			if (!vendor) setVendor((text.match(/from\s*:?\s*([a-z\s]+)/i)?.[1] || '').trim())
			if (!amount) setAmount((text.match(/\$?([0-9]+(?:\.[0-9]{2})?)/)?.[1] || '').trim())
		} catch (e: any) {
			setError(e?.message || 'Upload failed')
		}
	}

	const handlePreview = async () => {
		try {
			setError(null)
			const amt = parseFloat(amount)
			if (!vendor.trim() || isNaN(amt) || !date) { const msg = 'Please fill Vendor, Amount, Date'; setError(msg); try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch {}; return }
			const res = await ExpensesService.previewExpense({ vendorName: vendor.trim(), amount: amt, amountPaid: amt, date, paymentStatus: 'paid' })
			setPreview(res)
		} catch (e: any) {
			setError(e?.message || 'Preview failed')
		}
	}

	const checkDuplicate = async () => {
		try {
			setError(null)
			setDupState(null)
			if (!vendor.trim() || !vendorInvoiceNo.trim()) return
			setCheckingDup(true)
			const res = await ExpensesService.checkDuplicate(vendor.trim(), vendorInvoiceNo.trim())
			setDupState({ checked: true, duplicate: !!res?.duplicate, info: res?.expense })
		} catch (e: any) {
			// ignore
		} finally {
			setCheckingDup(false)
		}
	}

	const handlePost = async () => {
		try {
			setSubmitting(true)
			setError(null)
			const amt = parseFloat(amount)
			// Block submission if duplicate detected
			if (vendorInvoiceNo.trim()) {
				try {
					const res = await ExpensesService.checkDuplicate(vendor.trim(), vendorInvoiceNo.trim())
					if (res?.duplicate) {
						const msg = `Duplicate bill detected for ${vendor} with Vendor Invoice No. "${vendorInvoiceNo}"`
						setDupState({ checked: true, duplicate: true, info: res?.expense })
						setError(msg)
						try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch {}
						return
					}
				} catch {}
			}
			const res = await ExpensesService.postExpense({ vendorName: vendor.trim(), vendorInvoiceNo: vendorInvoiceNo.trim() || undefined, amount: amt, date, paymentStatus: 'paid', description: `Expense: ${vendor.trim()}`, dueDays: (dueDays === '' ? undefined : Math.max(0, Math.min(365, Number(dueDays) || 0))) })
			// Attach receipt if available and we have the expense id
			try {
				const expenseId = (res as any)?.expenseId || (res as any)?.expense?.id
				if (expenseId && file) {
					const attach = await ExpensesService.attachReceipt(expenseId, file)
					setAttachedReceiptUrl(attach?.expense?.receiptUrl || null)
				}
			} catch {}
			try { window.dispatchEvent(new CustomEvent('data:refresh')) } catch {}
			onClose()
		} catch (e: any) {
			const msg = e?.message || 'Post failed'
			setError(msg)
			try { window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } })) } catch {}
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<ModalPortal>
			<div className="fixed inset-0 z-[9999] modal-overlay flex items-end sm:items-center justify-center p-4" onClick={onClose}>
				<motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
					<ThemedGlassSurface variant="light" className="p-6 glass-modal liquid-glass" hover={false}>
						<div className="flex items-center justify-between mb-4">
							<div>
								<div className="text-lg font-semibold">Expense OCR</div>
								<div className="text-sm text-secondary-contrast">Upload → Preview → Post</div>
							</div>
							<button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={onClose}>Close</button>
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
							<label className="flex flex-col gap-1">
								<span className="text-secondary-contrast">Receipt</span>
								<input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
							</label>
							<div className="flex items-end gap-2">
								<button className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" onClick={handleUpload}>Extract Text</button>
							</div>
							<label className="flex flex-col gap-1">
								<span className="text-secondary-contrast">Vendor</span>
								<input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Adobe, Uber..." />
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-secondary-contrast">Vendor Invoice No. (optional)</span>
								<input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={vendorInvoiceNo} onChange={(e) => { setVendorInvoiceNo(e.target.value); setDupState(null) }} onBlur={checkDuplicate} placeholder="INV-12345" />
								{dupState?.duplicate && (
									<div className="text-xs text-red-400 mt-1">Duplicate detected. A bill with this number already exists.</div>
								)}
								{checkingDup && <div className="text-xs text-secondary-contrast mt-1">Checking duplicate...</div>}
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-secondary-contrast">Amount</span>
								<input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="59.99" />
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-secondary-contrast">Date</span>
								<input type="date" className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={date} onChange={(e) => setDate(e.target.value)} />
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-secondary-contrast">Due Terms (days)</span>
								<input type="number" min={0} max={365} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md" value={dueDays} onChange={(e) => setDueDays(e.target.value)} placeholder="e.g., 0, 14, 30" />
							</label>
							<div className="flex items-end gap-2">
								<button className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" onClick={handlePreview}>Preview</button>
							</div>
						</div>

						{preview && (
							<div className="mt-4 text-sm">
								<div className="font-semibold mb-2">Preview Entries</div>
								<ul className="space-y-1">
									{preview.entries?.map((e: any, i: number) => (
										<li key={i} className="flex justify-between"><span>{e.type.toUpperCase()} {e.accountCode} - {e.accountName}</span><span>${Number(e.amount).toLocaleString()}</span></li>
									))}
								</ul>
							</div>
						)}

						{attachedReceiptUrl && (
							<div className="mt-4 text-sm">
								<div className="font-semibold mb-1">Attached Receipt</div>
								<a href={attachedReceiptUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">{attachedReceiptUrl}</a>
							</div>
						)}

						{error && <div className="mt-3 text-sm text-red-400">{error}</div>}
						<div className="mt-4 flex justify-end gap-2">
							<button className="px-3 py-1.5 text-sm rounded-lg border transition backdrop-blur-glass bg-white/10 hover:bg-white/15 border-white/10 text-foreground" onClick={onClose}>Cancel</button>
							<button disabled={submitting} className="px-3 py-1.5 text-sm rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-60" onClick={handlePost}>{submitting ? 'Posting...' : 'Post Expense'}</button>
						</div>
					</ThemedGlassSurface>
				</motion.div>
			</div>
		</ModalPortal>
	)
}


