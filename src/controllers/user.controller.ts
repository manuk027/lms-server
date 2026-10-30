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
            totalBorrowedCount: 0,
            currentlyHoldingCount: 0,
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
      const loan = await UserService.borrowBook(req.user.sub, bookId)

      res.status(201).json({
        success: true,
        message: 'Book borrowed successfully',
        loan,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to borrow book'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }

  /**
   * POST /api/user/return
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

      const { loanId, bookId } = req.body
      const idToReturn = loanId || bookId
      const loan = await UserService.returnBook(req.user.sub, idToReturn)

      res.status(200).json({
        success: true,
        message: 'Book returned successfully',
        loan,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to return book'
      res.status(400).json({
        success: false,
        error: message,
      })
    }
  }
}

