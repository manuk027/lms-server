import { Book } from '../models/Book'
import { History } from '../models/History'

export class UserService {
  /**
   * Get dashboard metrics and books currently held by user
   */
  static async getUserDashboard(userId: string) {
    const activeLoans = await History.find({
      user: userId,
      status: 'borrowed',
      returnedAt: null,
    })
      .populate({
        path: 'book',
        populate: [
          { path: 'publisher', select: 'name' },
          { path: 'authors', select: 'name category' },
        ],
      })
      .sort({ borrowedAt: -1 })

    // Total count of borrowed books (all-time borrowed by this user)
    const totalBorrowedCount = await History.countDocuments({ user: userId })
    const currentlyHoldingCount = activeLoans.length
    const returnedCount = await History.countDocuments({
      user: userId,
      status: 'returned',
    })

    return {
      activeLoans,
      totalBorrowedCount,
      currentlyHoldingCount,
      returnedCount,
    }
  }

  /**
   * Get all books in catalog for user browsing
   */
  static async getBooks() {
    return Book.find()
      .populate('publisher', 'name')
      .populate('authors', 'name category')
      .sort({ createdAt: -1 })
  }

  /**
   * Borrow a book for user
   */
  static async borrowBook(userId: string, bookId: string) {
    if (!bookId) {
      throw new Error('Book ID is required')
    }

    const book = await Book.findById(bookId)
    if (!book) {
      throw new Error('Book not found')
    }

    // Check if user already holds an unreturned copy
    const existingLoan = await History.findOne({
      user: userId,
      book: bookId,
      status: 'borrowed',
      returnedAt: null,
    })

    if (existingLoan) {
      throw new Error('You have already borrowed this book and are currently holding it.')
    }

    if (book.available === false || (book.noOfCopies !== undefined && book.noOfCopies <= 0)) {
      throw new Error('This book is currently out of stock or unavailable.')
    }

    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 14) // 14-day loan

    const loan = new History({
      user: userId,
      book: bookId,
      borrowedAt: new Date(),
      dueDate,
      status: 'borrowed',
      returnedAt: null,
    })

    await loan.save()

    // Update book inventory
    if (book.noOfCopies !== undefined && book.noOfCopies > 0) {
      book.noOfCopies -= 1
      if (book.noOfCopies === 0) {
        book.available = false
      }
    } else {
      book.available = false
    }
    await book.save()

    await loan.populate({
      path: 'book',
      populate: [
        { path: 'publisher', select: 'name' },
        { path: 'authors', select: 'name category' },
      ],
    })

    return loan
  }

  /**
   * Return a borrowed book
   */
  static async returnBook(userId: string, loanOrBookId: string) {
    if (!loanOrBookId) {
      throw new Error('Loan ID or Book ID is required')
    }

    let loan = await History.findOne({
      _id: loanOrBookId,
      user: userId,
      status: 'borrowed',
      returnedAt: null,
    })

    if (!loan) {
      loan = await History.findOne({
        book: loanOrBookId,
        user: userId,
        status: 'borrowed',
        returnedAt: null,
      })
    }

    if (!loan) {
      throw new Error('No active loan found for this book in your account.')
    }

    loan.status = 'returned'
    loan.returnedAt = new Date()
    await loan.save()

    // Restore book availability
    const book = await Book.findById(loan.book)
    if (book) {
      book.noOfCopies = (book.noOfCopies || 0) + 1
      book.available = true
      await book.save()
    }

    return loan
  }
}

