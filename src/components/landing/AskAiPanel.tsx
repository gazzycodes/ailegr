import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'

export default function AskAiPanel() {
  return (
    <ThemedGlassSurface variant="light" elevation={1} className="p-4">
      <div className="text-center text-sm font-semibold mb-2">Ask AI anything</div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
        {[
          'Why is revenue down this month?',
          'Which expenses grew 20% QoQ?',
          'Post $1,200 Adobe for Mar 12'
        ].map((p) => (
          <span key={p} className="px-2.5 py-1.5 rounded-xl bg-white/8 border border-white/10">
            {p}
          </span>
        ))}
      </div>
    </ThemedGlassSurface>
  )
}


