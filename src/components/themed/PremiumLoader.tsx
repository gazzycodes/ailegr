import { motion } from 'framer-motion'
import { ThemedGlassSurface } from './ThemedGlassSurface'
import { cn } from '../../lib/utils'

interface PremiumLoaderProps {
  title: string
  subtitle?: string
  className?: string
}

export default function PremiumLoader({ title, subtitle, className }: PremiumLoaderProps) {
  return (
    <div className={cn('h-full w-full flex items-center justify-center px-4', className)}>
      <ThemedGlassSurface
        variant="heavy"
        elevation={3}
        className={cn('relative w-full max-w-md text-center px-6 py-6 sm:px-8 sm:py-8 overflow-hidden')}
      >
        {/* Ambient token-driven orbs */}
        <div className="pointer-events-none absolute -top-10 -right-12 w-40 h-40 rounded-full opacity-25" style={{ background: 'radial-gradient(circle, rgb(var(--color-primary-500) / 0.25), transparent 60%)' }} />
        <div className="pointer-events-none absolute -bottom-12 -left-16 w-48 h-48 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, rgb(var(--color-secondary-500) / 0.20), transparent 60%)' }} />

        {/* Animated ring loader */}
        <div className="relative mx-auto mb-5 w-16 h-16 sm:w-20 sm:h-20">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
          <motion.div
            className="absolute inset-2 rounded-full"
            style={{ background: 'radial-gradient(circle at 30% 30%, rgb(var(--color-primary-500) / 0.25), transparent 55%)' }}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: [0.6, 0.25, 0.6] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        {/* Text */}
        <div className="text-lg font-semibold text-gradient-primary mb-1">
          {title}
        </div>
        {subtitle && (
          <div className="text-sm text-muted-contrast mb-4" role="status" aria-live="polite">
            {subtitle}
          </div>
        )}

        {/* Progress shimmer bar */}
        <div className="mt-1 h-1.5 w-full rounded-full bg-surface overflow-hidden">
          <motion.div
            className="h-full w-1/2 bg-gradient-to-r from-primary/30 via-primary/60 to-primary/30"
            initial={{ x: '-100%' }}
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </ThemedGlassSurface>
    </div>
  )
}


