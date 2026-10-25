import { NextFunction, Request, Response } from 'express'

interface RequestRecord {
  lastRequestTime: number
  attemptsCount: number
  blockedUntil?: number
}

// In-memory store for rate limiting / throttling IP addresses
const ipStore = new Map<string, RequestRecord>()

// Clean up stale records every 10 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of ipStore.entries()) {
    if (now - record.lastRequestTime > 15 * 60 * 1000) {
      ipStore.delete(ip)
    }
  }
}, 10 * 60 * 1000)

export interface ThrottleOptions {
  windowMs?: number // Window in ms (e.g. 60000 = 1 min)
  maxAttempts?: number // Max attempts within window
  minIntervalMs?: number // Minimum interval between requests (e.g. 1500ms)
  blockDurationMs?: number // Cooldown duration if exceeded (e.g. 30000ms)
}

/**
 * Creates an Express middleware that throttles consecutive requests
 */
export function createThrottleMiddleware(options: ThrottleOptions = {}) {
  const {
    windowMs = 60 * 1000,
    maxAttempts = 5,
    minIntervalMs = 1500,
    blockDurationMs = 30 * 1000,
  } = options

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown-ip'

    const now = Date.now()
    const record = ipStore.get(clientIp) || {
      lastRequestTime: 0,
      attemptsCount: 0,
    }

    // 1. Check if IP is currently blocked
    if (record.blockedUntil && now < record.blockedUntil) {
      const waitSeconds = Math.ceil((record.blockedUntil - now) / 1000)
      res.status(429).json({
        success: false,
        error: 'Too many attempts. Please try again after 1 minute.',
        retryAfter: waitSeconds,
      })
      return
    }

    // 2. Check if consecutive requests are too fast (rapid firing / clicking)
    const timeSinceLast = now - record.lastRequestTime
    if (timeSinceLast < minIntervalMs) {
      res.status(429).json({
        success: false,
        error: 'Too many attempts. Please try again after 1 minute.',
        retryAfter: 60,
      })
      return
    }

    // 3. Check burst count within window
    if (timeSinceLast > windowMs) {
      // Reset window
      record.attemptsCount = 1
    } else {
      record.attemptsCount += 1
    }

    record.lastRequestTime = now

    if (record.attemptsCount >= maxAttempts) {
      record.blockedUntil = now + blockDurationMs
      ipStore.set(clientIp, record)
      res.status(429).json({
        success: false,
        error: 'Too many attempts. Please try again after 1 minute.',
        retryAfter: 60,
      })
      return
    }

    ipStore.set(clientIp, record)
    next()
  }
}

// Default export for admin login route
export const adminLoginThrottle = createThrottleMiddleware({
  minIntervalMs: 800,
  maxAttempts: 3, // Multiple attempts within 1 minute
  windowMs: 60 * 1000, // 1 minute window
  blockDurationMs: 60 * 1000, // 1 minute block
})
