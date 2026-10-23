import { CookieOptions } from 'express'

export const JWT_CONFIG = {
  accessSecret:
    process.env.JWT_ACCESS_SECRET || 'default_jwt_access_secret_change_in_production',
  refreshSecret:
    process.env.JWT_REFRESH_SECRET || 'default_jwt_refresh_secret_change_in_production',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
}

export const REFRESH_COOKIE_NAME = 'refreshToken'

export function getRefreshTokenCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    path: '/',
  }
}
