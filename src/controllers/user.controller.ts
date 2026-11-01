import { Response } from 'express'
import { AuthenticatedRequest } from '../middlewares/auth.middleware'
import { User } from '../models/User'
import { UserService } from '../services/user.service'

export class UserController {
  /**
   * GET /api/user/dashboard
   */
  static async getDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.sub) {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }

      const user = await User.findById(req.user.sub)
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' })
        return
      }

      if (user.status === 'waiting') {
        res.status(200).json({
          success: true,
          data: {
            status: 'waiting',
            message: 'You are on waiting list, Request admin for approval',
            activeLoans: [],
            pendingBorrowLoans: [],
            totalBorrowedCount: 0,
            currentlyHoldingCount: 0,
            pendingBorrowCount: 0,
            returnedCount: 0,
          },
        })
        return
      }

      const data = await UserService.getUserDashboard(req.user.sub)
      res.status(200).json({
        success: true,
        data: {
          ...data,
          status: user.status || 'approved',
        },
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch user dashboard'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * GET /api/user/books (or public books)
   */
  static async getBooks(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (req.user?.sub) {
        const user = await User.findById(req.user.sub)
        if (user && user.status === 'waiting') {
          res.status(403).json({
            success: false,
            waiting: true,
            error: 'You are on waiting list, Request admin for approval',
          })
          return
        }
      }

      const books = await UserService.getBooks()
      res.status(200).json({
        success: true,
        books,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch books'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * POST /api/user/borrow
   * Places a borrow request (Requires Admin Approval)
   */
  static async borrowBook(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.sub) {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }

      const user = await User.findById(req.user.sub)
      if (user && user.status === 'waiting') {
        res.status(403).json({
          success: false,
          waiting: true,
          error: 'You are on waiting list, Request admin for approval',
        })
        return
      }

      const { bookId } = req.body
      const loan = await UserService.requestBorrow(req.user.sub, bookId)

      res.status(201).json({
        success: true,
        message: 'Borrow request submitted. Waiting for admin approval.',
        loan,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to submit borrow request'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * POST /api/user/extend
   * Requests a 7-day loan extension on the last day / due date (Requires Admin Approval)
   */
  static async extendLoan(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.sub) {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }

      const { loanId, reason } = req.body
      const loan = await UserService.requestExtension(req.user.sub, loanId, reason)

      res.status(200).json({
        success: true,
        message: 'Extension request submitted. Waiting for admin approval.',
        loan,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to submit extension request'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * POST /api/user/return
   * Places a return request with reading status and optional rating/review (Requires Admin Approval)
   */
  static async returnBook(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.sub) {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }

      const user = await User.findById(req.user.sub)
      if (user && user.status === 'waiting') {
        res.status(403).json({
          success: false,
          waiting: true,
          error: 'You are on waiting list, Request admin for approval',
        })
        return
      }

      const { loanId, bookId, readingStatus, rating, review } = req.body
      const idToReturn = loanId || bookId
      const loan = await UserService.requestReturn(req.user.sub, idToReturn, {
        readingStatus,
        rating,
        review,
      })

      res.status(200).json({
        success: true,
        message: 'Book return requested. Waiting for admin confirmation.',
        loan,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to submit return request'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * GET /api/user/my-books
   * Returns complete borrowing history for user profile -> "My Books"
   */
  static async getMyBooks(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.sub) {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }

      const { status, readingStatus } = req.query
      const books = await UserService.getMyBooks(req.user.sub, {
        status: status as string,
        readingStatus: readingStatus as string,
      })

      res.status(200).json({
        success: true,
        books,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch my books history'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * PATCH /api/user/reviews/:loanId
   * Updates reading status, star rating, and review for returned books
   */
  static async updateReview(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.sub) {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }

      const { loanId } = req.params
      const { readingStatus, rating, review } = req.body

      const loan = await UserService.updateReadingStatusAndReview(req.user.sub, String(loanId), {
        readingStatus,
        rating: Number(rating),
        review,
      })

      res.status(200).json({
        success: true,
        message: 'Review and reading status updated successfully',
        loan,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update review'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }
}
