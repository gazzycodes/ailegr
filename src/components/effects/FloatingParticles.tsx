import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../lib/utils'

interface Particle {
  id: string
  x: number
  y: number
  size: number
  color: string
  duration: number
  delay: number
}

interface FloatingParticlesProps {
  count?: number
  colors?: string[]
  className?: string
  enabled?: boolean
}

export function FloatingParticles({ 
  count = 20, 
  colors = ['primary', 'financial-revenue', 'financial-profit'],
  className,
  enabled = true
}: FloatingParticlesProps) {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    if (!enabled) {
      setParticles([])
      return
    }

    const generateParticles = (): Particle[] => {
      return Array.from({ length: count }, (_, i) => ({
        id: `particle-${i}`,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        duration: Math.random() * 20 + 10,
        delay: Math.random() * 5
      }))
    }

    setParticles(generateParticles())
  }, [count, colors, enabled])

  if (!enabled) return null

  return (
    <div className={cn("fixed inset-0 pointer-events-none overflow-hidden", className)}>
      <AnimatePresence>
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            className={cn(
              "absolute rounded-full opacity-20",
              `bg-${particle.color}`
            )}
            style={{
              width: particle.size,
              height: particle.size,
              left: `${particle.x}%`,
              top: `${particle.y}%`,
            }}
            initial={{ 
              opacity: 0, 
              scale: 0,
              y: 0
            }}
            animate={{ 
              opacity: [0, 0.3, 0],
              scale: [0, 1, 0],
              y: [-20, -100],
              x: [0, Math.random() * 40 - 20]
            }}
            transition={{
              duration: particle.duration,
              delay: particle.delay,
              repeat: Infinity,
              ease: "easeOut"
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

// Enhanced particle system for specific areas
export function FinancialParticles({ 
  isActive = false, 
  type = 'revenue' 
}: { 
  isActive?: boolean
  type?: 'revenue' | 'expense' | 'profit'
}) {
  const getParticleColor = () => {
    switch (type) {
      case 'revenue': return 'financial-revenue'
      case 'expense': return 'financial-expense'
      case 'profit': return 'financial-profit'
      default: return 'primary'
    }
  }

  if (!isActive) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          className={cn(
            "absolute w-1 h-1 rounded-full",
            `bg-${getParticleColor()}`
          )}
          style={{
            left: `${20 + Math.random() * 60}%`,
            top: `${20 + Math.random() * 60}%`,
          }}
          animate={{
            opacity: [0, 0.6, 0],
            scale: [0, 1.5, 0],
            y: [0, -30],
            x: [0, Math.random() * 20 - 10]
          }}
          transition={{
            duration: 2 + Math.random() * 2,
            delay: i * 0.2,
            repeat: Infinity,
            ease: "easeOut"
          }}
        />
      ))}
    </div>
  )
}
