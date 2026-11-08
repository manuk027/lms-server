import { Book } from '../models/Book'
import { History, IHistory } from '../models/History'
import { Notification } from '../models/Notification'
import { Review } from '../models/Review'
import { User } from '../models/User'
import { ValidReadingStatus } from '../validators'

const BORROW_DAYS = parseInt(process.env.BORROW_DURATION_DAYS || '7', 10)
const EXTENSION_DAYS = parseInt(process.env.EXTENSION_DURATION_DAYS || '7', 10)

/**
 * Computes dynamic metrics for loan records (days left, is last day, overdue, extension eligibility)
 */
function enrichLoanWithMetrics(loanDoc: IHistory | any) {
  const loan = loanDoc.toObject ? loanDoc.toObject() : { ...loanDoc }
  const now = Date.now()

  let daysLeft: number | null = null
  let isLastDay = false
  let isOverdue = false
  let canExtend = false

  if (loan.dueDate && (loan.status === 'borrowed' || loan.status === 'return_pending')) {
    const dueTime = new Date(loan.dueDate).getTime()
    daysLeft = Math.ceil((dueTime - now) / (1000 * 60 * 60 * 24))
    isLastDay = daysLeft <= 1 && daysLeft >= 0
    isOverdue = daysLeft < 0
    // User can request extension when on last day or due/overdue, provided no pending or approved extension
    canExtend =
      daysLeft <= 1 &&
      loan.status === 'borrowed' &&
      loan.extensionStatus !== 'pending' &&
      loan.extensionStatus !== 'approved'
  }

  return {
    ...loan,
    daysLeft,
    isLastDay,
    isOverdue,
    canExtend,
    borrowDurationDays: BORROW_DAYS,
    extensionDurationDays: EXTENSION_DAYS,
  }
}

export class UserService {
  /**
   * Get dashboard metrics and books currently held or requested by user
   */
  static async getUserDashboard(userId: string) {
    // Active loans that user is currently holding or awaiting return approval
    const rawActiveLoans = await History.find({
      user: userId,
      status: { $in: ['borrowed', 'return_pending'] },
    })
      .populate({
        path: 'book',
        populate: [
          { path: 'publisher', select: 'name' },
          { path: 'authors', select: 'name category' },
        ],
      })
      .sort({ borrowedAt: -1 })

    // Pending borrow requests awaiting admin approval
    const rawPendingBorrowLoans = await History.find({
      user: userId,
      status: 'borrow_pending',
    })
      .populate({
        path: 'book',
        populate: [
          { path: 'publisher', select: 'name' },
          { path: 'authors', select: 'name category' },
        ],
      })
      .sort({ createdAt: -1 })

    const activeLoans = rawActiveLoans.map(enrichLoanWithMetrics)
    const pendingBorrowLoans = rawPendingBorrowLoans.map(enrichLoanWithMetrics)

    // Statistics
    const totalBorrowedCount = await History.countDocuments({
      user: userId,
      status: { $in: ['borrowed', 'return_pending', 'returned'] },
    })
    const currentlyHoldingCount = activeLoans.length
    const pendingBorrowCount = pendingBorrowLoans.length
    const returnedCount = await History.countDocuments({
      user: userId,
      status: 'returned',
    })

    return {
      activeLoans,
      pendingBorrowLoans,
      totalBorrowedCount,
      currentlyHoldingCount,
      pendingBorrowCount,
      returnedCount,
      policy: {
        borrowDays: BORROW_DAYS,
        extensionDays: EXTENSION_DAYS,
      },
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
   * User requests to borrow a book (Requires Admin Approval)
   */
  static async requestBorrow(userId: string, bookId: string) {
    if (!bookId) {
      throw new Error('Book ID is required')
    }

    const [user, book] = await Promise.all([
      User.findById(userId),
      Book.findById(bookId),
    ])

    if (!user) {
      throw new Error('User not found')
    }

    if (user.status === 'waiting') {
      throw new Error('You are on waiting list, Request admin for approval')
    }

    if (!book) {
      throw new Error('Book not found')
    }

    // Check if user already holds or has an active/pending request for this book
    const existingLoan = await History.findOne({
      user: userId,
      book: bookId,
      status: { $in: ['borrow_pending', 'borrowed', 'return_pending'] },
    })

    if (existingLoan) {
      if (existingLoan.status === 'borrow_pending') {
        throw new Error('You already have a pending borrow request for this book.')
      }
      throw new Error('You have already borrowed this book and are currently holding it.')
    }

    if (book.available === false || (book.noOfCopies !== undefined && book.noOfCopies <= 0)) {
      throw new Error('This book is currently unavailable in the library catalog.')
    }

    // Create loan in 'borrow_pending' state
    const loan = new History({
      user: userId,
      book: bookId,
      borrowedAt: new Date(),
      status: 'borrow_pending',
      extensionStatus: 'none',
    })

    await loan.save()

    // Notify Admin of new borrow request
    try {
      const userName = user.fullName || user.email || 'A user'
      await Notification.create({
        title: 'New Borrow Request',
        message: `${userName} requested to borrow "${book.bookName}"`,
        type: 'borrow_request',
        recipient: 'admin',
        link: '/admin/requests?tab=borrow',
        userId: user._id,
      })
    } catch (notifErr) {
      console.warn('Could not create admin notification for borrow request:', notifErr)
    }

    await loan.populate({
      path: 'book',
      populate: [
        { path: 'publisher', select: 'name' },
        { path: 'authors', select: 'name category' },
      ],
    })

    return enrichLoanWithMetrics(loan)
  }

  /**
   * User requests loan extension (Available when reaching the last day / after 7 days)
   */
  static async requestExtension(userId: string, loanId: string, reason?: string) {
    if (!loanId) {
      throw new Error('Loan ID is required')
    }

    const loan = await History.findOne({
      _id: loanId,
      user: userId,
      status: 'borrowed',
    }).populate('book')

    if (!loan) {
      throw new Error('Active loan not found in your account.')
    }

    if (loan.extensionStatus === 'pending') {
      throw new Error('An extension request is already pending admin approval.')
    }

    if (loan.extensionStatus === 'approved') {
      throw new Error('This loan has already been extended.')
    }

    // Check if on last day or due/overdue
    const now = Date.now()
    const dueTime = loan.dueDate ? new Date(loan.dueDate).getTime() : now
    const daysLeft = Math.ceil((dueTime - now) / (1000 * 60 * 60 * 24))

    if (daysLeft > 1) {
      throw new Error(
        `Extension can only be requested on the last day or when due. You have ${daysLeft} days remaining.`
      )
    }

    loan.extensionStatus = 'pending'
    loan.extensionRequestedAt = new Date()
    loan.extensionDays = EXTENSION_DAYS
    loan.extensionReason = reason ? reason.trim() : ''
    await loan.save()

    // Notify Admin
    try {
      const user = await User.findById(userId)
      const book = loan.book as any
      const bookTitle = book?.bookName || 'a book'
      const userName = user?.fullName || user?.email || 'A user'

      await Notification.create({
        title: 'Loan Extension Request',
        message: `${userName} requested a ${EXTENSION_DAYS}-day extension for "${bookTitle}"`,
        type: 'extension_request',
        recipient: 'admin',
        link: '/admin/requests?tab=extension',
        userId: user?._id,
      })
    } catch (notifErr) {
      console.warn('Could not create admin notification for extension request:', notifErr)
    }

    await loan.populate({
      path: 'book',
      populate: [
        { path: 'publisher', select: 'name' },
        { path: 'authors', select: 'name category' },
      ],
    })

    return enrichLoanWithMetrics(loan)
  }

  /**
   * User requests to return a book (Requires Admin Approval, captures reading status and rating/review)
   */
  static async requestReturn(
    userId: string,
    loanOrBookId: string,
    data?: {
      readingStatus?: ValidReadingStatus
      rating?: number
      review?: string
    }
  ) {
    if (!loanOrBookId) {
      throw new Error('Loan ID or Book ID is required')
    }

    let loan = await History.findOne({
      _id: loanOrBookId,
      user: userId,
      status: 'borrowed',
    }).populate('book')

    if (!loan) {
      loan = await History.findOne({
        book: loanOrBookId,
        user: userId,
        status: 'borrowed',
      }).populate('book')
    }

    if (!loan) {
      // Check if already in return_pending
      const pendingReturn = await History.findOne({
        _id: loanOrBookId,
        user: userId,
        status: 'return_pending',
      })
      if (pendingReturn) {
        throw new Error('A return request for this book is already pending admin approval.')
      }
      throw new Error('No active borrowed book found in your account to return.')
    }

    // Set status to return_pending
    loan.status = 'return_pending'

    if (data?.readingStatus) {
      loan.readingStatus = data.readingStatus
    } else {
      loan.readingStatus = 'completed'
    }

    if (data?.rating && data.rating >= 1 && data.rating <= 5) {
      loan.rating = data.rating
    }
    if (data?.review !== undefined) {
      loan.review = data.review.trim()
    }
    loan.reviewedAt = new Date()

    await loan.save()

    // Notify Admin of return request
    try {
      const user = await User.findById(userId)
      const book = loan.book as any
      const bookTitle = book?.bookName || 'a book'
      const userName = user?.fullName || user?.email || 'A user'

      await Notification.create({
        title: 'Book Return Request',
        message: `${userName} requested to return "${bookTitle}"`,
        type: 'return_request',
        recipient: 'admin',
        link: '/admin/requests?tab=return',
        userId: user?._id,
      })
    } catch (notifErr) {
      console.warn('Could not create admin notification for return request:', notifErr)
    }

    await loan.populate({
      path: 'book',
      populate: [
        { path: 'publisher', select: 'name' },
        { path: 'authors', select: 'name category' },
      ],
    })

    return enrichLoanWithMetrics(loan)
  }

  /**
   * Get all books borrowing history for user (profile -> "My Books")
   */
  static async getMyBooks(
    userId: string,
    filters?: {
      status?: string
      readingStatus?: string
    }
  ) {
    const query: Record<string, any> = { user: userId }

    if (filters?.status && filters.status !== 'all') {
      if (filters.status === 'holding') {
        query.status = { $in: ['borrowed', 'return_pending'] }
      } else if (filters.status === 'pending') {
        query.status = { $in: ['borrow_pending', 'return_pending'] }
      } else {
        query.status = filters.status
      }
    }

    if (filters?.readingStatus && filters.readingStatus !== 'all') {
      query.readingStatus = filters.readingStatus
    }

    const loans = await History.find(query)
      .populate({
        path: 'book',
        populate: [
          { path: 'publisher', select: 'name' },
          { path: 'authors', select: 'name category' },
        ],
      })
      .sort({ createdAt: -1 })

    return loans.map(enrichLoanWithMetrics)
  }

  /**
   * User adds or updates rating, review, and reading status on a returned book
   */
  static async updateReadingStatusAndReview(
    userId: string,
    loanId: string,
    data: {
      readingStatus: ValidReadingStatus
      rating: number
      review?: string
    }
  ) {
    if (!loanId) {
      throw new Error('Loan ID is required')
    }

    const loan = await History.findOne({
      _id: loanId,
      user: userId,
    }).populate('book')

    if (!loan) {
      throw new Error('Book history record not found')
    }

    if (loan.status !== 'returned' && loan.status !== 'return_pending') {
      throw new Error('Reading status and reviews can only be finalized on returned books.')
    }

    if (data.rating < 1 || data.rating > 5) {
      throw new Error('Rating must be between 1 and 5 stars.')
    }

    loan.readingStatus = data.readingStatus || 'completed'
    loan.rating = data.rating
    loan.review = data.review ? data.review.trim() : ''
    loan.reviewedAt = new Date()
    await loan.save()

    // Upsert Review document
    const bookId = loan.book._id || loan.book
    await Review.findOneAndUpdate(
      { user: userId, book: bookId },
      {
        user: userId,
        book: bookId,
        history: loan._id,
        rating: data.rating,
        review: data.review ? data.review.trim() : '',
        readingStatus: data.readingStatus || 'completed',
      },
      { upsert: true, new: true }
    )

    // Recalculate book average rating
    try {
      const stats = await Review.aggregate([
        { $match: { book: bookId } },
        {
          $group: {
            _id: '$book',
            averageRating: { $avg: '$rating' },
            ratingsCount: { $sum: 1 },
          },
        },
      ])

      if (stats.length > 0) {
        const avg = Math.round(stats[0].averageRating * 10) / 10
        await Book.findByIdAndUpdate(bookId, {
          averageRating: avg,
          ratingsCount: stats[0].ratingsCount,
        })
      }
    } catch (aggErr) {
      console.warn('Failed to recompute book average rating:', aggErr)
    }

    return enrichLoanWithMetrics(loan)
  }

  /**
   * User update profile (Full Name and Mobile Phone Number)
   */
  static async updateProfile(
    userId: string,
    data: { fullName?: string; phoneNo?: string }
  ) {
    const user = await User.findById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    if (data.fullName && data.fullName.trim().length >= 2) {
      user.fullName = data.fullName.trim()
    }

    if (data.phoneNo !== undefined) {
      const cleanedPhone = data.phoneNo.trim()
      if (cleanedPhone.length > 0) {
        // Validate uniqueness if changed
        const existing = await User.findOne({
          phoneNo: cleanedPhone,
          _id: { $ne: userId },
        })
        if (existing) {
          throw new Error(`Phone number "${cleanedPhone}" is already in use by another account.`)
        }
        user.phoneNo = cleanedPhone
      } else {
        user.phoneNo = ''
      }
    }

    await user.save()
    return user
  }

  /**
   * User update reading status on a loan (e.g. 'read' / 'completed' vs 'not_read')
   */
  static async updateReadingStatus(
    userId: string,
    loanId: string,
    readingStatus: string
  ) {
    if (!loanId) {
      throw new Error('Loan ID is required')
    }

    const loan = await History.findOne({
      _id: loanId,
      user: userId,
    }).populate({
      path: 'book',
      populate: [
        { path: 'publisher', select: 'name' },
        { path: 'authors', select: 'name category' },
      ],
    })

    if (!loan) {
      throw new Error('Book history record not found')
    }

    // Normalize: 'read' -> 'completed', 'not_read' -> 'not_read'
    const normalized =
      readingStatus === 'read' || readingStatus === 'completed'
        ? 'completed'
        : 'not_read'

    loan.readingStatus = normalized as any
    await loan.save()

    return enrichLoanWithMetrics(loan)
  }
}
