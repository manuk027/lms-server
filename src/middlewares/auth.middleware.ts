import { NextFunction, Request, Response } from 'express'
import { IAccessTokenPayload, TokenService } from '../services/token.service'

export interface AuthenticatedRequest extends Request {
  user?: IAccessTokenPayload
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Authorization token required. Format: Bearer <token>',
    })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const payload = TokenService.verifyAccessToken(token)
    req.user = payload
    next()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid or expired access token'
    res.status(401).json({
      success: false,
      error: 'Invalid or expired access token',
      details: message,
    })
  }
}
