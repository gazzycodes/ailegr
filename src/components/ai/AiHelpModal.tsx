import { motion, AnimatePresence } from 'framer-motion'
import { ModalPortal } from '../layout/ModalPortal'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'

interface AiHelpModalProps {
  open: boolean
  onClose: () => void
}

export default function AiHelpModal({ open, onClose }: AiHelpModalProps) {
  if (!open) return null
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[10000] pointer-events-none">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 modal-overlay"
          onClick={onClose}
        />
        <AnimatePresence>
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 270, damping: 26 }}
            className="pointer-events-auto fixed left-1/2 top-[10%] -translate-x-1/2 w-[92%] max-w-[720px] p-3"
          >
            <ThemedGlassSurface variant="light" className="p-0 overflow-hidden" hover={false}>
              <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">How AI Chat and Voice Work</div>
                  <div className="text-xs text-secondary-contrast">Natural language → smart ACTIONS, safely</div>
                </div>
                <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={onClose}>Close</button>
              </div>
              <div className="p-4 space-y-4 text-sm">
                <div className="text-secondary-contrast">
                  - Speak or type in plain English. The assistant replies and, when appropriate, appends a hidden ACTION directive that executes the task for you (e.g., create expense, record payment).
                </div>
                <div>
                  <div className="font-medium mb-1">What you can say</div>
                  <ul className="list-disc pl-5 space-y-1 text-secondary-contrast">
                    <li>Create a $29.99 Uber expense today for travel.</li>
                    <li>Invoice Acme for $1,250 due in 14 days.</li>
                    <li>Record a $50 payment for INV-1001 from yesterday.</li>
                    <li>Duplicate my last invoice for tomorrow.</li>
                    <li>What’s this month’s revenue and net profit?</li>
                  </ul>
                </div>
                <div>
                  <div className="font-medium mb-1">Safety</div>
                  <ul className="list-disc pl-5 space-y-1 text-secondary-contrast">
                    <li>Risky actions like voiding payments ask for confirmation.</li>
                    <li>All actions are scoped to your tenant and require authentication.</li>
                    <li>If details are missing (e.g., which invoice), the assistant will ask first.</li>
                  </ul>
                </div>
                <div>
                  <div className="font-medium mb-1">Tips</div>
                  <ul className="list-disc pl-5 space-y-1 text-secondary-contrast">
                    <li>Be specific: include names, amounts, and dates.</li>
                    <li>Voice and Chat share the same brain; anything you can type, you can say.</li>
                    <li>Open AI Document for OCR-based posting from receipts/invoices.</li>
                  </ul>
                </div>
              </div>
            </ThemedGlassSurface>
          </motion.div>
        </AnimatePresence>
      </div>
    </ModalPortal>
  )
}


