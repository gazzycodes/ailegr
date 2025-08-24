// Lightweight cadence helpers shared by UI components
// NOTE: We intentionally keep this logic in the UI as a preview only.
// The server independently computes next runs using the same option keys
// embedded in rule.payload.__options to avoid schema churn.

export type RecurringCadence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUAL'

export type RecurringOptions = {
  // Daily/Weekly: intervals
  intervalDays?: number
  intervalWeeks?: number
  // Weekly: explicit weekday 0-6 (Sun=0)
  weekday?: number | null
  // Monthly helpers
  dayOfMonth?: number | null
  endOfMonth?: boolean
  nthWeek?: number | null // 1..5 (5 = last if overflow)
  nthWeekday?: number | null // 0..6
}

function daysInMonth(year: number, month0: number) {
  return new Date(year, month0 + 1, 0).getDate()
}

export function computeNextRun(fromISO: string, cadence: RecurringCadence, opts: RecurringOptions = {}): string {
  const from = new Date(fromISO)
  if (isNaN(from.getTime())) return new Date().toISOString()
  const next = new Date(from)

  if (cadence === 'DAILY') {
    const d = Math.max(1, opts.intervalDays || 1)
    next.setDate(next.getDate() + d)
  } else if (cadence === 'WEEKLY') {
    const w = Math.max(1, opts.intervalWeeks || 1)
    if (opts.weekday == null || typeof opts.weekday !== 'number') {
      next.setDate(next.getDate() + 7 * w)
    } else {
      // move to next occurrence of weekday within interval window
      const currentDow = next.getDay()
      let delta = (opts.weekday - currentDow + 7) % 7
      if (delta === 0) delta = 7 * w
      next.setDate(next.getDate() + delta)
    }
  } else if (cadence === 'MONTHLY') {
    // Support: dayOfMonth, endOfMonth, nthWeek/nthWeekday
    const y = next.getFullYear()
    const m = next.getMonth() + 1
    const moveTo = (year: number, month1: number, day: number) => {
      const m0 = month1 - 1
      const dim = daysInMonth(year, m0)
      const d = Math.min(Math.max(1, day), dim)
      return new Date(year, m0, d)
    }
    const advanceOneMonth = (base: Date) => new Date(base.getFullYear(), base.getMonth() + 1, base.getDate())

    let candidate: Date
    const hasNth = typeof opts.nthWeek === 'number' && typeof opts.nthWeekday === 'number' && opts.nthWeek! >= 1
    if (opts.endOfMonth) {
      const when = new Date(y, m, 0) // end of current month
      candidate = advanceOneMonth(when)
    } else if (typeof opts.dayOfMonth === 'number' && opts.dayOfMonth! >= 1) {
      candidate = moveTo(y, m + 1, opts.dayOfMonth!)
    } else if (hasNth) {
      // next month nthWeek of nthWeekday
      const targetMonth0 = next.getMonth() + 1 // next month
      const firstDay = new Date(next.getFullYear(), targetMonth0, 1)
      const firstDow = firstDay.getDay()
      let day = 1 + ((opts.nthWeekday! - firstDow + 7) % 7) + (opts.nthWeek! - 1) * 7
      const dim = daysInMonth(firstDay.getFullYear(), targetMonth0)
      if (day > dim) day = dim // last occurrence fallback
      candidate = new Date(firstDay.getFullYear(), targetMonth0, day)
    } else {
      candidate = advanceOneMonth(next)
    }
    next.setTime(candidate.getTime())
  } else if (cadence === 'ANNUAL') {
    next.setFullYear(next.getFullYear() + 1)
  }

  // normalize to ISO (YYYY-MM-DD) start of day local
  const yyyy = next.getFullYear()
  const mm = String(next.getMonth() + 1).padStart(2, '0')
  const dd = String(next.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T00:00:00.000Z`
}

export function getNextOccurrences(startISO: string, cadence: RecurringCadence, opts: RecurringOptions = {}, count = 3): string[] {
  const out: string[] = []
  let current = startISO
  for (let i = 0; i < count; i++) {
    current = computeNextRun(current, cadence, opts)
    out.push(current.slice(0, 10))
  }
  return out
}


