import { Request, Response } from 'express'
import { AuthenticatedAdminRequest } from '../middlewares/adminAuth.middleware'
import { AdminService } from '../services/admin.service'

const ADMIN_SESSION_COOKIE = 'adminSessionToken'

export class AdminController {
  /**
   * Admin Login endpoint
   * POST /api/admin/auth/login
   */
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body

      const { admin, token } = await AdminService.login(username, password)

      // Set browser session cookie
      // Note: Omitting maxAge and expires makes it a SESSION COOKIE,
      // which automatically expires when the browser is closed.
      res.cookie(ADMIN_SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      })

      res.status(200).json({
        success: true,
        message: 'Admin authenticated successfully',
        admin,
        token, // Front-end saves this in sessionStorage (expires on browser close)
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Login failed'
      res.status(401).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Get current admin profile
   * GET /api/admin/auth/me
   */
  static async getMe(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    if (!req.admin) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    res.status(200).json({
      success: true,
      admin: req.admin,
    })
  }

  /**
   * Admin Logout endpoint
   * POST /api/admin/auth/logout
   */
  static async logout(_req: Request, res: Response): Promise<void> {
    res.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' })
    res.status(200).json({
      success: true,
      message: 'Admin logged out successfully',
    })
  }

  /**
   * Sample Dashboard statistics and metrics
   * GET /api/admin/dashboard/stats
   */
  static async getDashboardStats(
    _req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const stats = await AdminService.getDashboardStats()
      res.status(200).json({
        success: true,
        data: stats,
      })
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch dashboard metrics'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }
}
