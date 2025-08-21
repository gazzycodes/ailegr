import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'

export default function ThreeDUniversePreview({ onOpen }: { onOpen?: () => void }) {
  return (
    <ThemedGlassSurface variant="medium" elevation={2} className="p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">3D Financial Universe</div>
        <button onClick={onOpen} className="px-3 py-1.5 text-xs rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/25 focus:ring-focus">Open</button>
      </div>
      <div className="h-28 rounded-xl bg-gradient-to-br from-primary/10 to-transparent relative overflow-hidden">
        <div className="absolute inset-0 rounded-2xl pointer-events-none universe-preview-overlay" />
      </div>
    </ThemedGlassSurface>
  )
}


