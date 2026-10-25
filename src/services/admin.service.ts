import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Admin, IAdmin } from '../models/Admin'
import { Author } from '../models/Author'
import { Book } from '../models/Book'
import { History } from '../models/History'
import { Publisher } from '../models/Publisher'
import { User } from '../models/User'
import { AdminValidators } from '../validators/admin.validator'
import { BookValidators } from '../validators'

export interface AdminTokenPayload {
  sub: string
  username: string
  role: string
  type: 'admin'
}

const ADMIN_JWT_SECRET =
  process.env.ADMIN_JWT_SECRET || 'fallback_admin_session_secret_key_123456789'

export class AdminService {
  /**
   * Automatically seed a default admin user if no admin exists in the database
   */
  static async ensureDefaultAdmin(): Promise<void> {
    try {
      const adminCount = await Admin.countDocuments()
      if (adminCount === 0) {
        const username = (process.env.DEFAULT_ADMIN_USERNAME || 'admin').toLowerCase().trim()
        const rawPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123'
        const hashedPassword = await bcrypt.hash(rawPassword, 10)

        const defaultAdmin = new Admin({
          username,
          password: hashedPassword,
          fullName: 'Library Superadmin',
          email: 'admin@library.local',
          role: 'superadmin',
        })

        await defaultAdmin.save()
        console.info(
          `[AdminService] Seeded default admin: "${username}" with configured password.`
        )
      }
    } catch (err) {
      console.error('[AdminService] Error checking/seeding default admin:', err)
    }
  }

  /**
   * Authenticate admin by username and password
   */
  static async login(
    usernameInput: unknown,
    passwordInput: unknown
  ): Promise<{ admin: Omit<IAdmin, 'password'>; token: string }> {
    // 1. Validate inputs using decoupled AdminValidators (SOLID)
    const validation = AdminValidators.validateLoginInput({
      username: usernameInput,
      password: passwordInput,
    })

    if (!validation.isValid) {
      throw new Error('Invalid username or password')
    }

    const username = (usernameInput as string).toLowerCase().trim()
    const password = passwordInput as string

    // 2. Lookup admin by username
    const admin = await Admin.findOne({ username })
    if (!admin) {
      throw new Error('Invalid username or password')
    }

    // 3. Verify bcrypt password
    const isPasswordValid = await bcrypt.compare(password, admin.password)
    if (!isPasswordValid) {
      throw new Error('Invalid username or password')
    }

    // 4. Update last login
    admin.lastLogin = new Date()
    await admin.save()

    // 5. Generate admin session JWT
    // The session is tied to the browser session (expires when browser is closed via session cookie and sessionStorage)
    const payload: AdminTokenPayload = {
      sub: admin._id.toString(),
      username: admin.username,
      role: admin.role,
      type: 'admin',
    }

    // Token has a 24-hour backup expiration if left open, but is destroyed when the browser is closed
    const token = jwt.sign(payload, ADMIN_JWT_SECRET, { expiresIn: '24h' })

    const safeAdmin = (admin.toJSON() as unknown) as Omit<IAdmin, 'password'>
    return { admin: safeAdmin, token }
  }

  /**
   * Verify admin JWT token
   */
  static async verifyAdminToken(token: string): Promise<IAdmin> {
    const payload = jwt.verify(token, ADMIN_JWT_SECRET) as AdminTokenPayload
    if (payload.type !== 'admin') {
      throw new Error('Invalid admin token type')
    }

    const admin = await Admin.findById(payload.sub)
    if (!admin) {
      throw new Error('Admin account not found')
    }

    return admin
  }

  /**
   * Get sample dashboard metrics and circulation stats
   */
  static async getDashboardStats() {
    const [
      totalBooks,
      availableBooks,
      totalUsers,
      activeLoans,
      overdueLoans,
      recentActivity,
    ] = await Promise.all([
      Book.countDocuments(),
      Book.countDocuments({ available: true }),
      User.countDocuments(),
      History.countDocuments({ status: 'borrowed' }),
      History.countDocuments({ status: 'overdue' }),
      History.find()
        .sort({ borrowedAt: -1 })
        .limit(6)
        .populate('user', 'fullName email')
        .populate('book', 'bookName bookCode shelf'),
    ])

    return {
      metrics: {
        totalBooks,
        availableBooks,
        borrowedBooks: totalBooks - availableBooks,
        totalUsers,
        activeLoans,
        overdueLoans,
      },
      recentActivity,
    }
  }

  /**
   * Create and store a new book in the database
   */
  static async createBook(input: {
    name?: string
    bookName?: string
    authorName?: string
    publication?: string
    noOfPages?: number | string
    noOfCopies?: number |string
    language?: string
    category?: string
    imageUrl?: string
    imageCaption?: string
    shelf?: string
    isAvailable?: boolean
    available?: boolean
    bookCode?: string
    notes?: string
    isbn?: string
  }) {
    const rawName = input.name || input.bookName
    if (!rawName || !rawName.trim()) {
      throw new Error('Book title/name is required.')
    }

    const rawAuthor = input.authorName
    if (!rawAuthor || !rawAuthor.trim()) {
      throw new Error('Author name is required.')
    }

    const rawPublication = input.publication
    if (!rawPublication || !rawPublication.trim()) {
      throw new Error('Publication name is required.')
    }

    const rawShelf = input.shelf
    if (!rawShelf || !rawShelf.trim()) {
      throw new Error('Shelf location is required.')
    }

    const rawCategory = input.category || 'General'
    const parsedPages = typeof input.noOfPages === 'number'
      ? input.noOfPages
      : parseInt(String(input.noOfPages || '1'), 10)

    if (isNaN(parsedPages) || parsedPages < 1) {
      throw new Error('Number of pages must be at least 1.')
    }

    // 1. Find or create Publisher
    let publisher = await Publisher.findOne({ name: rawPublication.trim() })
    if (!publisher) {
      publisher = await Publisher.create({ name: rawPublication.trim() })
    }

    // 2. Find or create Author
    let author = await Author.findOne({ name: rawAuthor.trim() })
    if (!author) {
      author = await Author.create({
        name: rawAuthor.trim(),
        category: rawCategory.trim(),
        gender: 'Not specified',
      })
    }

    // 3. Determine or generate unique Book Code
    let finalBookCode = (input.bookCode || '').trim().toUpperCase()
    if (!finalBookCode) {
      if (input.isbn && input.isbn.trim()) {
        finalBookCode = `ISBN-${input.isbn.trim().replace(/[^0-9X]/gi, '')}`
      } else {
        const prefix = rawName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'BK')
        const randomSuffix = Math.floor(1000 + Math.random() * 9000)
        finalBookCode = `${prefix}-${randomSuffix}`
      }
    }

    // Ensure uniqueness if collision occurs
    let existingBook = await Book.findOne({ bookCode: finalBookCode })
    if (existingBook) {
      finalBookCode = `${finalBookCode}-${Math.floor(100 + Math.random() * 900)}`
    }

    // 4. Create and persist Book
    const isAvail = input.isAvailable !== undefined ? input.isAvailable : input.available !== undefined ? input.available : true
    const parsedCopies = typeof input.noOfCopies === 'number'
      ? input.noOfCopies
      : Number(input.noOfCopies)

      if (isNaN(parsedCopies) || parsedPages < 1) {
      throw new Error('Number of copies must be at least 1.')
    }

   
    const book = new Book({
      bookName: rawName.trim(),
      publisher: publisher._id,
      authors: [author._id],
      shelf: rawShelf.trim(),
      category: rawCategory.trim(),
      bookCode: finalBookCode,
      noOfPages: parsedPages,
      noOfCopies : input.noOfCopies,
      available: isAvail,
      language: (input.language || 'English').trim(),
      imageUrl: (input.imageUrl || '').trim(),
      imageCaption: (input.imageCaption || '').trim(),
      isbn: (input.isbn || '').trim(),
      notes: (input.notes || '').trim(),
    })

    await book.save()

    // Populate references before returning
    await book.populate('publisher', 'name')
    await book.populate('authors', 'name category')

    return book
  }

  /**
   * Get all books for inventory management
   */
  static async getBooks() {
    return Book.find()
      .populate('publisher', 'name')
      .populate('authors', 'name category')
      .sort({ createdAt: -1 })
  }

  /**
   * Get all registered library users / patrons
   */
  static async getUsers() {
    return User.find().sort({ createdAt: -1 })
  }

  /**
   * Get all publishers / publications
   */
  static async getPublications() {
    return Publisher.find().sort({ createdAt: -1 })
  }

  /**
   * Get all registered book authors
   */
  static async getAuthors() {
    return Author.find().sort({ createdAt: -1 })
  }
}
