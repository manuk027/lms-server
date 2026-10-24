import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Admin, IAdmin } from '../models/Admin'
import { Book } from '../models/Book'
import { History } from '../models/History'
import { User } from '../models/User'
import { AdminValidators } from '../validators/admin.validator'

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
      const firstError = Object.values(validation.errors)[0]
      throw new Error(firstError || 'Invalid admin credentials')
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
}
