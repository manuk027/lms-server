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
   * Search / Find book by ISBN in catalog
   * GET /api/admin/books/isbn/:isbn
   */
  static async getBookByIsbn(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const isbn = String(req.params.isbn || '')
      const book = await AdminService.getBookByIsbn(isbn)
      res.status(200).json({
        success: true,
        book,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to retrieve book by ISBN'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Admin issue / borrow a book to a patron
   * POST /api/admin/books/:id/borrow
   */
  static async borrowBook(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const bookId = String(req.params.id || '')
      const { userId, dueDate } = req.body
      const result = await AdminService.borrowBook(bookId, userId, dueDate)
      res.status(200).json({
        success: true,
        message: 'Book successfully issued to patron',
        loan: result.loan,
        book: result.book,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to issue book'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Get active borrowers for a book
   * GET /api/admin/books/:id/borrowers
   */
  static async getBookBorrowers(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const bookId = String(req.params.id || '')
      const borrowers = await AdminService.getBookBorrowers(bookId)
      res.status(200).json({
        success: true,
        borrowers,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to retrieve book borrowers'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Admin process book return
   * POST /api/admin/books/:id/return
   */
  static async returnBook(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const bookId = String(req.params.id || '')
      const { loanId, userId } = req.body || {}
      const result = await AdminService.returnBook(bookId, loanId, userId)
      res.status(200).json({
        success: true,
        message: 'Book returned successfully',
        loan: result.loan,
        book: result.book,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to return book'
      res.status(400).json({
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
   * Admin create user
   * POST /api/admin/users
   */
  static async createUser(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const { fullName, phoneNo, email } = req.body || {}
      const user = await AdminService.createUser({ fullName, phoneNo, email })
      res.status(201).json({
        success: true,
        message: 'Patron created successfully',
        user,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create user'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Get user details and currently holding books
   * GET /api/admin/users/:id/details
   */
  static async getUserDetails(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = String(req.params.id || '')
      const data = await AdminService.getUserDetails(userId)
      res.status(200).json({
        success: true,
        ...data,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to retrieve user details'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * Update user details
   * PUT /api/admin/users/:id
   */
  static async updateUser(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = String(req.params.id || '')
      const { fullName, phoneNo, email, status } = req.body || {}
      const user = await AdminService.updateUser(userId, { fullName, phoneNo, email, status })
      res.status(200).json({
        success: true,
        message: 'Patron updated successfully',
        user,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update user'
      res.status(400).json({
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
   * Sync authors and publishers with book catalog (removes orphaned ones)
   * POST /api/admin/sync-metadata
   */
  static async syncAuthorsAndPublishers(
    _req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const result = await AdminService.syncAuthorsAndPublishers()
      res.status(200).json({
        success: true,
        message: 'Authors and publishers synced with book catalog successfully',
        ...result,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to sync metadata'
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
   * Clear all admin notifications
   * DELETE /api/admin/notifications
   */
  static async clearAllNotifications(
    _req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const data = await AdminService.clearAllNotifications()
      res.status(200).json(data)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to clear notifications'
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

  /**
   * GET /api/admin/requests/counts
   */
  static async getRequestsCounts(
    _req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const counts = await AdminService.getAdminRequestsCounts()
      res.status(200).json({
        success: true,
        counts,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch request counts'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * GET /api/admin/requests/borrow
   */
  static async getBorrowRequests(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const { status, search, sortBy } = req.query
      const data = await AdminService.getBorrowRequests({
        status: status as string,
        search: search as string,
        sortBy: sortBy as string,
      })
      res.status(200).json({
        success: true,
        ...data,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch borrow requests'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * PATCH /api/admin/requests/borrow/:id
   */
  static async updateBorrowRequest(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const { id } = req.params
      const { status, remarks } = req.body

      if (!['approved', 'rejected'].includes(status)) {
        res.status(400).json({
          success: false,
          error: 'Status must be approved or rejected',
        })
        return
      }

      const loan = await AdminService.updateBorrowRequestStatus(id as string, status, remarks)
      res.status(200).json({
        success: true,
        message: `Borrow request ${status} successfully`,
        loan,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update borrow request'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * GET /api/admin/requests/extension
   */
  static async getExtensionRequests(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const { status, search, sortBy } = req.query
      const data = await AdminService.getExtensionRequests({
        status: status as string,
        search: search as string,
        sortBy: sortBy as string,
      })
      res.status(200).json({
        success: true,
        ...data,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch extension requests'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * PATCH /api/admin/requests/extension/:id
   */
  static async updateExtensionRequest(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const { id } = req.params
      const { status, remarks } = req.body

      if (!['approved', 'rejected'].includes(status)) {
        res.status(400).json({
          success: false,
          error: 'Status must be approved or rejected',
        })
        return
      }

      const loan = await AdminService.updateExtensionRequestStatus(id as string, status, remarks)
      res.status(200).json({
        success: true,
        message: `Extension request ${status} successfully`,
        loan,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update extension request'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * GET /api/admin/requests/return
   */
  static async getReturnRequests(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const { status, search, sortBy } = req.query
      const data = await AdminService.getReturnRequests({
        status: status as string,
        search: search as string,
        sortBy: sortBy as string,
      })
      res.status(200).json({
        success: true,
        ...data,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch return requests'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * PATCH /api/admin/requests/return/:id
   */
  static async updateReturnRequest(
    req: AuthenticatedAdminRequest,
    res: Response
  ): Promise<void> {
    try {
      const { id } = req.params
      const { status, remarks } = req.body

      if (!['approved', 'rejected'].includes(status)) {
        res.status(400).json({
          success: false,
          error: 'Status must be approved or rejected',
        })
        return
      }

      const loan = await AdminService.updateReturnRequestStatus(id as string, status, remarks)
      res.status(200).json({
        success: true,
        message: `Return request ${status} successfully`,
        loan,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update return request'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }
}
