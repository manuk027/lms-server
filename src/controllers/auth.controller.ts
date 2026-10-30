import { Request, Response } from 'express'
import {
  REFRESH_COOKIE_NAME,
  getRefreshTokenCookieOptions,
} from '../config/jwt'
import { AuthenticatedRequest } from '../middlewares/auth.middleware'
import { Book } from '../models/Book'
import { AuthService } from '../services/auth.service'

export class AuthController {
  /**
   * Handle Google registration and login
   * POST /api/auth/google
   */
  static async googleAuth(req: Request, res: Response): Promise<void> {
    try {
      const { idToken, fullName, phoneNo } = req.body

      if (!idToken) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: idToken',
        })
        return
      }

      const result = await AuthService.authenticateWithGoogle(idToken, {
        fullName,
        phoneNo,
      })

      // Set HTTP-only refresh token cookie (lasts 7 days)
      res.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        getRefreshTokenCookieOptions()
      )

      res.status(200).json({
        success: true,
        message: 'Authenticated successfully with Google',
        user: result.user,
        accessToken: result.accessToken, // To be stored in localStorage by frontend
      })
    } catch (error: unknown) {
      console.error('Google authentication error:', error)
      const message = error instanceof Error ? error.message : 'Authentication failed'
      res.status(401).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Refresh access token using httpOnly refresh token cookie
   * POST /api/auth/refresh
   */
  static async refresh(req: Request, res: Response): Promise<void> {
    try {
      const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME]

      if (!rawRefreshToken) {
        res.status(401).json({
          success: false,
          error: 'No refresh token provided in cookies',
        })
        return
      }

      const result = await AuthService.refreshSession(rawRefreshToken)

      // Renew the refresh token cookie
      res.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        getRefreshTokenCookieOptions()
      )

      res.status(200).json({
        success: true,
        user: result.user,
        accessToken: result.accessToken,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid or expired session'
      // Clear invalid cookie
      res.clearCookie(REFRESH_COOKIE_NAME, { path: '/' })
      res.status(401).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Logout user and clear HTTP-only refresh token cookie
   * POST /api/auth/logout
   */
  static async logout(_req: Request, res: Response): Promise<void> {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/' })
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    })
  }

  /**
   * Get current authenticated user details
   * GET /api/auth/me
   */
  static async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.sub) {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }

      const user = await AuthService.getUserProfile(req.user.sub)
      res.status(200).json({
        success: true,
        user,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'User not found'
      res.status(404).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Get public books list for preview & login backgrounds
   * GET /api/auth/books
   */
  static async getPublicBooks(_req: Request, res: Response): Promise<void> {
    try {
      const books = await Book.find()
        .populate('publisher', 'name')
        .populate('authors', 'name category')
        .sort({ createdAt: -1 })
        .limit(60)

      res.status(200).json({
        success: true,
        books,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to retrieve books'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }
}
