import { ModalPortal } from '../layout/ModalPortal'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'

export default function ThreeDUniverseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] modal-overlay flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="max-w-5xl w-[96%]">
          <ThemedGlassSurface variant="light" elevation={1} className="p-0 glass-modal liquid-glass" hover={false}>
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-lg font-semibold">3D Financial Universe</div>
              <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={onClose}>✕</button>
            </div>
            <div className="p-5">
              <div className="h-[520px] w-full rounded-2xl bg-gradient-to-br from-primary/10 to-transparent relative overflow-hidden">
                <div className="absolute inset-0 rounded-2xl universe-modal-overlay" />
                {/* Placeholder for real R3F scene later */}
              </div>
            </div>
          </ThemedGlassSurface>
        </div>
      </div>
    </ModalPortal>
  )
}


