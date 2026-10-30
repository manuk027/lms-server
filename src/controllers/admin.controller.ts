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

  /**
   * Create and store a new book
   * POST /api/admin/books
   */
  static async createBook(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const book = await AdminService.createBook(req.body)
       console.log('✅ [MongoDB] Saved book document:', {
        id: book._id,
        title: book.bookName,
        imageUrl: book.imageUrl,
        shelf: book.shelf,
        bookCode: book.bookCode
      })
      res.status(201).json({
        success: true,
        message: 'Book successfully stored in library database',
        book,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create book'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Get all books
   * GET /api/admin/books
   */
  static async getBooks(
    _req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const books = await AdminService.getBooks()
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

  /**
   * Get all registered users / patrons
   * GET /api/admin/users
   */
  static async getUsers(
    _req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const users = await AdminService.getUsers()
      res.status(200).json({
        success: true,
        users,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to retrieve users'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Get all publications
   * GET /api/admin/publications
   */
  static async getPublications(
    _req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const publications = await AdminService.getPublications()
      res.status(200).json({
        success: true,
        publications,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to retrieve publications'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Get all authors
   * GET /api/admin/authors
   */
  static async getAuthors(
    _req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const authors = await AdminService.getAuthors()
      res.status(200).json({
        success: true,
        authors,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to retrieve authors'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Update an existing book
   * PUT /api/admin/books/:id
   */
  static async updateBook(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const { id } = req.params
      const book = await AdminService.updateBook(id as string, req.body)
      res.status(200).json({
        success: true,
        message: 'Book updated successfully',
        book,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update book'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Delete a book
   * DELETE /api/admin/books/:id
   */
  static async deleteBook(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const { id } = req.params
      const result = await AdminService.deleteBook(id as string)
      res.status(200).json({
        success: true,
        message: result.message,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete book'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Get admin notifications
   * GET /api/admin/notifications
   */
  static async getNotifications(
    _req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const data = await AdminService.getNotifications()
      res.status(200).json({
        success: true,
        ...data,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to retrieve notifications'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Mark single notification as read
   * PATCH /api/admin/notifications/:id/read
   */
  static async markNotificationRead(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const { id } = req.params
      const data = await AdminService.markNotificationRead(id as string)
      res.status(200).json({
        success: true,
        ...data,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update notification'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Mark all notifications as read
   * PATCH /api/admin/notifications/mark-all-read
   */
  static async markAllNotificationsRead(
    _req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const data = await AdminService.markAllNotificationsRead()
      res.status(200).json(data)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to mark all notifications read'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Get user registration requests with search, filter, and sorting
   * GET /api/admin/requests
   */
  static async getUserRequests(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const { status, search, sortBy } = req.query
      const data = await AdminService.getUserRequests({
        status: status as string,
        search: search as string,
        sortBy: sortBy as string,
      })
      res.status(200).json({
        success: true,
        ...data,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to retrieve requests'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Update user status (approve, reject, or set waiting)
   * PATCH /api/admin/users/:id/status
   */
  static async updateUserStatus(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const { id } = req.params
      const { status } = req.body

      if (!status) {
        res.status(400).json({
          success: false,
          error: 'Status is required (waiting, approved, or rejected)',
        })
        return
      }

      const user = await AdminService.updateUserStatus(id as string, status)
      res.status(200).json({
        success: true,
        message: `User status successfully updated to ${status}`,
        user,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update user status'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }
}
