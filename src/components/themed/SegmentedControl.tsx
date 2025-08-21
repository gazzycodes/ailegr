import { cn } from '../../lib/utils'

export type SegmentOption<T extends string> = { value: T; label: string }

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
  size?: 'sm' | 'md'
}

export default function SegmentedControl<T extends string>({ options, value, onChange, className, size = 'sm' }: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border transition-all',
        'backdrop-blur-lg',
        'bg-surface/30 border-border/30',
        className
      )}
      role="tablist"
      aria-label="Segmented control"
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative rounded-lg font-semibold transition-all focus:outline-none focus:ring-focus',
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
              active
                ? 'bg-primary/20 text-primary border border-primary/30 shadow-md'
                : 'text-muted-contrast hover:text-primary-contrast hover:bg-surface/40'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}


