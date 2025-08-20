// Universal AI rate limiter: 15/min and 200/day (configurable via env)
// Neutral vendor handling; exposes helpers to set response headers and check quotas

let minuteLimit = parseInt(process.env.AI_PER_MINUTE || '15', 10)
let dailyLimit = parseInt(process.env.AI_PER_DAY || '200', 10)

let minuteWindowStart = Math.floor(Date.now() / 60000) * 60000
let minuteCount = 0

let dayKey = new Date().toISOString().slice(0, 10)
let dayCount = 0

function resetIfNeeded() {
  const now = Date.now()
  if (now >= minuteWindowStart + 60000) {
    minuteWindowStart = Math.floor(now / 60000) * 60000
    minuteCount = 0
  }
  const currentDayKey = new Date().toISOString().slice(0, 10)
  if (currentDayKey !== dayKey) {
    dayKey = currentDayKey
    dayCount = 0
  }
}

function secondsUntilMinuteReset() {
  const now = Date.now()
  return Math.max(0, Math.ceil((minuteWindowStart + 60000 - now) / 1000))
}

function secondsUntilDayReset() {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return Math.max(0, Math.ceil((next.getTime() - now.getTime()) / 1000))
}

export const aiLimiter = {
  limits() {
    return { perMinute: minuteLimit, perDay: dailyLimit }
  },
  checkAndConsume(units = 1) {
    resetIfNeeded()
    if (minuteCount + units > minuteLimit) {
      return {
        allowed: false,
        code: 'RATE_LIMITED_MINUTE',
        retryAfterSeconds: secondsUntilMinuteReset(),
        remainingMinute: Math.max(0, minuteLimit - minuteCount),
        remainingDay: Math.max(0, dailyLimit - dayCount)
      }
    }
    if (dayCount + units > dailyLimit) {
      return {
        allowed: false,
        code: 'RATE_LIMITED_DAY',
        retryAfterSeconds: secondsUntilDayReset(),
        remainingMinute: Math.max(0, minuteLimit - minuteCount),
        remainingDay: Math.max(0, dailyLimit - dayCount)
      }
    }
    minuteCount += units
    dayCount += units
    return {
      allowed: true,
      remainingMinute: Math.max(0, minuteLimit - minuteCount),
      remainingDay: Math.max(0, dailyLimit - dayCount)
    }
  },
  headers() {
    return {
      'X-AI-RateLimit-Limit-Minute': String(minuteLimit),
      'X-AI-RateLimit-Remaining-Minute': String(Math.max(0, minuteLimit - minuteCount)),
      'X-AI-RateLimit-Reset-Minute': String(secondsUntilMinuteReset()),
      'X-AI-RateLimit-Limit-Day': String(dailyLimit),
      'X-AI-RateLimit-Remaining-Day': String(Math.max(0, dailyLimit - dayCount)),
      'X-AI-RateLimit-Reset-Day': String(secondsUntilDayReset())
    }
  },
  attachHeaders(res) {
    try {
      const hdr = this.headers()
      Object.entries(hdr).forEach(([k, v]) => res.set(k, v))
    } catch {}
  },
  status() {
    resetIfNeeded()
    return {
      minute: {
        used: minuteCount,
        limit: minuteLimit,
        remaining: Math.max(0, minuteLimit - minuteCount),
        resetSeconds: secondsUntilMinuteReset()
      },
      day: {
        used: dayCount,
        limit: dailyLimit,
        remaining: Math.max(0, dailyLimit - dayCount),
        resetSeconds: secondsUntilDayReset(),
        dayKey
      }
    }
  }
}


