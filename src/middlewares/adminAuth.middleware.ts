import { NextFunction, Request, Response } from 'express'
import { IAdmin } from '../models/Admin'
import { AdminService } from '../services/admin.service'

export interface AuthenticatedAdminRequest extends Request {
  admin?: IAdmin
}

export async function requireAdminAuth(
  req: AuthenticatedAdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined

    // 1. Check Bearer token in Authorization header
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1]
    }

    // 2. Fallback to adminSessionToken cookie
    if (!token && req.cookies?.adminSessionToken) {
      token = req.cookies.adminSessionToken
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Admin authentication required',
      })
      return
    }

    const admin = await AdminService.verifyAdminToken(token)
    req.admin = admin
    next()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid admin session'
    res.status(401).json({
      success: false,
      error: 'Admin session expired or invalid',
      details: message,
    })
  }
}
