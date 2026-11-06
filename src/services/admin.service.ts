
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Admin, IAdmin } from '../models/Admin'
import { Author } from '../models/Author'
import { Book } from '../models/Book'
import { History } from '../models/History'
import { Notification } from '../models/Notification'
import { Publisher } from '../models/Publisher'
import { Review } from '../models/Review'
import { User } from '../models/User'
import { AdminValidators } from '../validators/admin.validator'
import { BookValidators } from '../validators'
import { ShelfService } from './shelf.service'
import { RecommendationService } from './recommendation.service'
import { MetadataNormalizer } from './metadata.normalizer'

const BORROW_DAYS = parseInt(process.env.BORROW_DURATION_DAYS || '7', 10)
const EXTENSION_DAYS = parseInt(process.env.EXTENSION_DURATION_DAYS || '7', 10)


export interface AdminTokenPayload {
  sub: string;
  username: string;
  role: string;
  type: "admin";
}

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "fallback_admin_session_secret_key_123456789";

export class AdminService {
  /**
   * Automatically seed a default admin user if no admin exists in the database
   */
  static async ensureDefaultAdmin(): Promise<void> {
    try {
      const adminCount = await Admin.countDocuments();
      if (adminCount === 0) {
        const username = (process.env.DEFAULT_ADMIN_USERNAME || "admin").toLowerCase().trim();
        const rawPassword = process.env.DEFAULT_ADMIN_PASSWORD || "Admin@123";
        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        const defaultAdmin = new Admin({
          username,
          password: hashedPassword,
          fullName: "Library Superadmin",
          email: "admin@library.local",
          role: "superadmin",
        });

        await defaultAdmin.save();
        console.info(`[AdminService] Seeded default admin: "${username}" with configured password.`);
      }
    } catch (err) {
      console.error("[AdminService] Error checking/seeding default admin:", err);
    }
  }

  /**
   * Authenticate admin by username and password
   */
  static async login(usernameInput: unknown, passwordInput: unknown): Promise<{ admin: Omit<IAdmin, "password">; token: string }> {
    // 1. Validate inputs using decoupled AdminValidators (SOLID)
    const validation = AdminValidators.validateLoginInput({
      username: usernameInput,
      password: passwordInput,
    });

    if (!validation.isValid) {
      throw new Error("Invalid username or password");
    }

    const username = (usernameInput as string).toLowerCase().trim();
    const password = passwordInput as string;

    // 2. Lookup admin by username
    const admin = await Admin.findOne({ username });
    if (!admin) {
      throw new Error("Invalid username or password");
    }

    // 3. Verify bcrypt password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      throw new Error("Invalid username or password");
    }

    // 4. Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // 5. Generate admin session JWT
    // The session is tied to the browser session (expires when browser is closed via session cookie and sessionStorage)
    const payload: AdminTokenPayload = {
      sub: admin._id.toString(),
      username: admin.username,
      role: admin.role,
      type: "admin",
    };

    // Token has a 24-hour backup expiration if left open, but is destroyed when the browser is closed
    const token = jwt.sign(payload, ADMIN_JWT_SECRET, { expiresIn: "24h" });

    const safeAdmin = admin.toJSON() as unknown as Omit<IAdmin, "password">;
    return { admin: safeAdmin, token };
  }

  /**
   * Verify admin JWT token
   */
  static async verifyAdminToken(token: string): Promise<IAdmin> {
    const payload = jwt.verify(token, ADMIN_JWT_SECRET) as AdminTokenPayload;
    if (payload.type !== "admin") {
      throw new Error("Invalid admin token type");
    }

    const admin = await Admin.findById(payload.sub);
    if (!admin) {
      throw new Error("Admin account not found");
    }

    return admin;
  }

  /**
   * Get sample dashboard metrics and circulation stats
   */
  static async getDashboardStats() {
    await AdminService.checkAndUpdateExpiredFees();
    const [totalBooks, availableBooks, totalUsers, unpaidUsers, activeLoans, overdueLoans, recentActivity] = await Promise.all([
      Book.countDocuments(),
      Book.countDocuments({ available: true }),
      User.countDocuments(),
      User.countDocuments({ feesStatus: { $ne: 'paid' } }),
      History.countDocuments({ status: "borrowed" }),
      History.countDocuments({ status: "overdue" }),
      History.find().sort({ borrowedAt: -1 }).limit(6).populate("user", "fullName email").populate("book", "bookName bookCode shelf"),
    ]);

    return {
      metrics: {
        totalBooks,
        availableBooks,
        borrowedBooks: totalBooks - availableBooks,
        totalUsers,
        unpaidUsers,
        activeLoans,
        overdueLoans,
      },
      recentActivity,
    };
  }

  /**
   * Create and store a new book in the database
   */
  static async createBook(input: {
    name?: string;
    bookName?: string;
    authorName?: string;
    publication?: string;
    noOfPages?: number | string;
    noOfCopies?: number | string;
    language?: string;
    category?: string;
    imageUrl?: string;
    imageCaption?: string;
    shelf?: string;
    isAvailable?: boolean;
    available?: boolean;
    bookCode?: string;
    notes?: string;
    isbn?: string;
    subjects?: string[] | string;
    format?: string;
    description?: string;
    verified?: boolean;
    assignmentSource?: 'librarian' | 'recommendation';
    metadataSource?: 'google-books' | 'openlibrary' | 'manual' | 'gemini';
    historyId?: string;
    acceptedRecommendation?: boolean;
    feedbackReason?: string;
  }) {
    const rawName = input.name || input.bookName;
    if (!rawName || !rawName.trim()) {
      throw new Error("Book title/name is required.");
    }

    const rawAuthor = input.authorName;
    if (!rawAuthor || !rawAuthor.trim()) {
      throw new Error("Author name is required.");
    }

    const rawPublication = input.publication;
    if (!rawPublication || !rawPublication.trim()) {
      throw new Error("Publication name is required.");
    }

    const rawShelf = input.shelf;
    if (!rawShelf || !rawShelf.trim()) {
      throw new Error("Shelf location is required.");
    }

    const rawCategory = input.category || "General";
    const parsedPages = typeof input.noOfPages === "number" ? input.noOfPages : parseInt(String(input.noOfPages || "1"), 10);

    if (isNaN(parsedPages) || parsedPages < 1) {
      throw new Error("Number of pages must be at least 1.");
    }

    // 1. Find or create Publisher
    let publisher = await Publisher.findOne({ name: rawPublication.trim() });
    if (!publisher) {
      publisher = await Publisher.create({ name: rawPublication.trim() });
    }

    // 2. Find or create Author
    let author = await Author.findOne({ name: rawAuthor.trim() });
    if (!author) {
      author = await Author.create({
        name: rawAuthor.trim(),
        gender: "Not specified",
      });
    }

    // 3. Determine or generate unique Book Code
    let finalBookCode = (input.bookCode || "").trim().toUpperCase();
    if (!finalBookCode) {
      if (input.isbn && input.isbn.trim()) {
        finalBookCode = `ISBN-${input.isbn.trim().replace(/[^0-9X]/gi, "")}`;
      } else {
        const prefix = rawName
          .substring(0, 3)
          .toUpperCase()
          .replace(/[^A-Z]/g, "BK");
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        finalBookCode = `${prefix}-${randomSuffix}`;
      }
    }

    // Ensure uniqueness if collision occurs
    let existingBook = await Book.findOne({ bookCode: finalBookCode });
    if (existingBook) {
      finalBookCode = `${finalBookCode}-${Math.floor(100 + Math.random() * 900)}`;
    }

    // 4. Create and persist Book
    const isAvail = input.isAvailable !== undefined ? input.isAvailable : input.available !== undefined ? input.available : true;

    const parsedCopies = typeof input.noOfCopies === "number" ? input.noOfCopies : parseInt(String(input.noOfCopies || "1"), 10);
    if (isNaN(parsedCopies) || parsedCopies < 1) {
      throw new Error('Number of copies must be at least 1.')
    }

    const normCategory = MetadataNormalizer.normalizeGenre(rawCategory);
    const normLanguage = MetadataNormalizer.normalizeLanguage(input.language || 'English');
    const normFormat = MetadataNormalizer.normalizeFormat(input.format || 'Hardcover');
    const normSubjects = MetadataNormalizer.normalizeSubjects(input.subjects);

    const book = new Book({
      bookName: rawName.trim(),
      publisher: publisher._id,
      authors: [author._id],
      shelf: rawShelf.trim(),
      category: normCategory,
      bookCode: finalBookCode,
      noOfPages: parsedPages,
      noOfCopies: parsedCopies,
      available: isAvail,
      language: normLanguage,
      subjects: normSubjects,
      format: normFormat,
      description: (input.description || input.notes || '').trim(),
      imageUrl: (input.imageUrl || "").trim(),
      imageCaption: (input.imageCaption || "").trim(),
      isbn: (input.isbn || "").trim(),
      notes: (input.notes || "").trim(),
      verified: input.verified !== undefined ? Boolean(input.verified) : true,
      assignmentSource: input.assignmentSource || 'librarian',
      metadataSource: input.metadataSource || 'manual',
    });

    await book.save();

    // Dynamically adjust shelf physical occupancy
    await ShelfService.adjustOccupancy(book.shelf, 1);

    // Record feedback if recommendation was displayed
    if (input.historyId) {
      await RecommendationService.recordFeedback({
        historyId: input.historyId,
        selectedShelf: book.shelf,
        acceptedRecommendation: input.acceptedRecommendation !== undefined ? Boolean(input.acceptedRecommendation) : true,
        feedback: input.feedbackReason || '',
      });
    }

    // Populate references before returning
    await book.populate("publisher", "name");
    await book.populate("authors", "name category");

    return book;
  }

  /**
   * Get all books for inventory management
   */
  static async getBooks() {
    return Book.find().populate("publisher", "name").populate("authors", "name category").sort({ createdAt: -1 });
  }

  static async updateBook(
    bookId: string,
    input: {
      name?: string,
      bookName?: string;
      authorName?: string;
      publication?: string;
      noOfPages?: number | string;
    noOfCopies?: number | string;
      language?: string;
      category?: string;
      imageUrl?: string;
      imageCaption?: string;
      shelf?: string;
      isAvailable?: boolean;
      available?: boolean;
      bookCode?: string;
      notes?: string;
      isbn?: string;
      subjects?: string[] | string;
      format?: string;
      description?: string;
      verified?: boolean;
      assignmentSource?: 'librarian' | 'recommendation';
      metadataSource?: 'google-books' | 'openlibrary' | 'manual' | 'gemini';
    },
  ) {
    const book = await Book.findById(bookId);
    if (!book) {
      throw new Error("Book is not found");
    }

    const previousPublisherId = book.publisher;
    const previousAuthorIds = Array.isArray(book.authors) ? [...book.authors] : [];
    const previousShelf = book.shelf;

   // 1 - book name
    const rawName = input.name || input.bookName;
    if (rawName !== undefined) {
      if (!rawName.trim()) throw new Error("Book title/name cannot be empty.");
      book.bookName = rawName.trim();
    }
    // 2 - publisher
    if (input.publication !== undefined) {
      const rawPublication = input.publication.trim();
      if (!rawPublication) throw new Error("Publication name cannot be empty.");
      let publisher = await Publisher.findOne({ name: rawPublication });
      if (!publisher) {
        publisher = await Publisher.create({ name: rawPublication });
      }
      book.publisher = publisher._id as any;
    }
     // 3- author name
    if (input.authorName !== undefined) {
      const rawAuthor = input.authorName.trim();
      if (!rawAuthor) throw new Error("Author name cannot be empty.");
      let author = await Author.findOne({ name: rawAuthor });
      if (!author) {
        author = await Author.create({
          name: rawAuthor,
          gender: "Not specified",
        });
      }
      book.authors = [author._id as any];
    }
    // 4. Shelf location
    if (input.shelf !== undefined) {
      if (!input.shelf.trim()) throw new Error("Shelf location cannot be empty.");
      book.shelf = input.shelf.trim();
    }
    // 5. Category
    if (input.category !== undefined) {
      book.category = input.category.trim() || "General";
    }
    // 6. Number of Pages
    if (input.noOfPages !== undefined) {
      const parsedPages = typeof input.noOfPages === "number" ? input.noOfPages : parseInt(String(input.noOfPages || "1"), 10);
      if (isNaN(parsedPages) || parsedPages < 1) {
        throw new Error("Number of pages must be at least 1.");
      }
      book.noOfPages = parsedPages;
    }
    // 6b. Number of Copies
    if (input.noOfCopies !== undefined) {
      const parsedCopies = typeof input.noOfCopies === "number" ? input.noOfCopies : parseInt(String(input.noOfCopies || "1"), 10);
      if (isNaN(parsedCopies) || parsedCopies < 1) {
        throw new Error("Number of copies must be at least 1.");
      }
      book.noOfCopies = parsedCopies;
    }
    // 7. Book Code 
    if (input.bookCode !== undefined) {
      const newCode = input.bookCode.trim().toUpperCase();
      if (!newCode) throw new Error("Book code cannot be empty.");
      const conflict = await Book.findOne({ bookCode: newCode, _id: { $ne: bookId } });
      if (conflict) {
        throw new Error(`Book code "${newCode}" is already in use by another book.`);
      }
      book.bookCode = newCode;
    }
    // 8. Availability status
    if (input.isAvailable !== undefined) {
      book.available = Boolean(input.isAvailable);
    } else if (input.available !== undefined) {
      book.available = Boolean(input.available);
    }
    // 9. Optional metadata
    if (input.language !== undefined) book.language = MetadataNormalizer.normalizeLanguage(input.language.trim());
    if (input.imageUrl !== undefined) book.imageUrl = input.imageUrl.trim();
    if (input.imageCaption !== undefined) book.imageCaption = input.imageCaption.trim();
    if (input.isbn !== undefined) book.isbn = input.isbn.trim();
    if (input.notes !== undefined) book.notes = input.notes.trim();
    if (input.subjects !== undefined) book.subjects = MetadataNormalizer.normalizeSubjects(input.subjects);
    if (input.format !== undefined) book.format = MetadataNormalizer.normalizeFormat(input.format);
    if (input.description !== undefined) book.description = input.description.trim();
    if (input.verified !== undefined) book.verified = Boolean(input.verified);
    if (input.assignmentSource !== undefined) book.assignmentSource = input.assignmentSource;
    if (input.metadataSource !== undefined) book.metadataSource = input.metadataSource;

    await book.save();

    // Adjust shelf occupancy if shelf was changed
    if (input.shelf !== undefined && previousShelf && previousShelf.toUpperCase() !== book.shelf.toUpperCase()) {
      await ShelfService.adjustOccupancy(previousShelf, -1);
      await ShelfService.adjustOccupancy(book.shelf, 1);
    }

    // Clean up old publisher if changed and no other book references it
    if (input.publication !== undefined && previousPublisherId && String(previousPublisherId) !== String(book.publisher)) {
      const remainingPubBooks = await Book.countDocuments({ publisher: previousPublisherId });
      if (remainingPubBooks === 0) {
        await Publisher.findByIdAndDelete(previousPublisherId);
      }
    }

    // Clean up old authors if changed and no other book references them
    if (input.authorName !== undefined && previousAuthorIds.length > 0) {
      for (const oldAuthorId of previousAuthorIds) {
        if (oldAuthorId && !book.authors.some((aId: any) => String(aId) === String(oldAuthorId))) {
          const remainingAuthorBooks = await Book.countDocuments({ authors: oldAuthorId });
          if (remainingAuthorBooks === 0) {
            await Author.findByIdAndDelete(oldAuthorId);
          }
        }
      }
    }

    // Keep authors and publishers in sync with books
    await AdminService.syncAuthorsAndPublishers();

    // Populate references before returning
    await book.populate("publisher", "name");
    await book.populate("authors", "name category");
    return book;
  }

  /**
   * Find a book in the library catalog by ISBN or accession code
   */
  static async getBookByIsbn(rawIsbn: string) {
    const trimmed = (rawIsbn || '').trim();
    if (!trimmed) return null;
    const cleanDigits = trimmed.replace(/[^0-9xX]/g, '');

    // 1. Direct query by exact isbn or bookCode
    let book = await Book.findOne({
      $or: [
        { isbn: trimmed },
        { bookCode: trimmed.toUpperCase() },
      ],
    })
      .populate('publisher', 'name')
      .populate('authors', 'name category');

    // 2. If not found and has at least 8 digits, query with hyphen-tolerant regex
    if (!book && cleanDigits.length >= 8) {
      const regexPattern = cleanDigits.split('').join('[- ]?');
      book = await Book.findOne({
        isbn: { $regex: regexPattern, $options: 'i' },
      })
        .populate('publisher', 'name')
        .populate('authors', 'name category');
    }

    return book;
  }

  /**
   * Admin issue / borrow a book to a registered library patron
   */
  static async borrowBook(bookId: string, userId: string, dueDate?: string | Date) {
    if (!bookId) throw new Error('Book ID is required');
    if (!userId) throw new Error('User ID is required');

    const book = await Book.findById(bookId);
    if (!book) throw new Error('Book not found in library database');

    const currentCopies = typeof book.noOfCopies === 'number' ? book.noOfCopies : (book.available ? 1 : 0);
    if (currentCopies < 1) {
      throw new Error(`Cannot borrow "${book.bookName}". No copies are currently available in inventory.`);
    }

    const user = await User.findById(userId);
    if (!user) throw new Error('Selected patron / user not found');
    if (user.status === 'rejected') {
      throw new Error(`Cannot issue book to user "${user.fullName}" whose account status is rejected.`);
    }

    // Check if user already holds an active loan of this book
    const existingLoan = await History.findOne({
      user: userId,
      book: bookId,
      status: { $in: ['borrowed', 'overdue'] },
    });
    if (existingLoan) {
      throw new Error(`Patron "${user.fullName}" is already holding an active copy of this book.`);
    }

    const now = new Date();
    const defaultDueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days standard

    const loan = await History.create({
      user: userId,
      book: bookId,
      borrowedAt: now,
      dueDate: dueDate ? new Date(dueDate) : defaultDueDate,
      status: 'borrowed',
      extensionStatus: 'none',
    });

    // Decrement copies and mark unavailable when qty reaches 0
    const updatedCopies = Math.max(0, currentCopies - 1);
    book.noOfCopies = updatedCopies;
    book.available = updatedCopies > 0;
    await book.save();

    await book.populate('publisher', 'name');
    await book.populate('authors', 'name category');
    await loan.populate('user', 'fullName email phoneNo');
    await loan.populate('book', 'bookName bookCode shelf isbn');

    return {
      loan,
      book,
    };
  }

  /**
   * Get active borrowers for a specific book
   */
  static async getBookBorrowers(bookId: string) {
    if (!bookId) throw new Error('Book ID is required');

    const loans = await History.find({
      book: bookId,
      status: { $in: ['borrowed', 'overdue', 'return_pending'] },
    })
      .populate('user', 'fullName email phoneNo avatar status')
      .sort({ borrowedAt: -1 });

    return loans;
  }

  /**
   * Admin process return of a book from a patron
   */
  static async returnBook(bookId: string, loanId?: string, userId?: string) {
    if (!bookId) throw new Error('Book ID is required');

    let query: any = {
      book: bookId,
      status: { $in: ['borrowed', 'overdue', 'return_pending'] },
    };

    if (loanId) {
      query._id = loanId;
    } else if (userId) {
      query.user = userId;
    }

    const loan = await History.findOne(query).populate('user', 'fullName email phoneNo');
    if (!loan) {
      throw new Error('No active borrow record found for this book and patron');
    }

    loan.status = 'returned';
    loan.returnedAt = new Date();
    await loan.save();

    const book = await Book.findById(bookId);
    if (!book) {
      throw new Error('Book not found in library database');
    }

    // Increment available copies by 1 and ensure available is true
    const currentCopies = typeof book.noOfCopies === 'number' ? book.noOfCopies : 0;
    book.noOfCopies = currentCopies + 1;
    book.available = true;
    await book.save();

    await book.populate('publisher', 'name');
    await book.populate('authors', 'name category');

    return {
      loan,
      book,
    };
  }

  /**
   * Helper to automatically update expired fees for users whose 365 days have elapsed.
   * Also ensures all users without feesStatus explicitly default to 'unpaid'.
   */
  static async checkAndUpdateExpiredFees() {
    const now = new Date();
    // 1. Mark unpaid for users whose 365 days from payment have passed
    await User.updateMany(
      {
        feesStatus: 'paid',
        $or: [
          { feesExpiresAt: { $ne: null, $lte: now } },
          { feesPaidAt: { $ne: null, $lte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) } },
        ],
      },
      {
        $set: {
          feesStatus: 'unpaid',
          feesExpiresAt: null,
        },
      }
    );

    // 2. Ensure existing users without feesStatus default to 'unpaid'
    await User.updateMany(
      { feesStatus: { $in: [null, undefined] } },
      { $set: { feesStatus: 'unpaid', feesExpiresAt: null, feesPaidAt: null } }
    );
  }

  /**
   * Get all registered library users / patrons
   */
  static async getUsers() {
    await AdminService.checkAndUpdateExpiredFees();
    return User.find().sort({ createdAt: -1 });
  }

  /**
   * Admin create a new library patron with name and phone number
   */
  static async createUser(input: { fullName: string; phoneNo: string; email?: string; feesStatus?: 'paid' | 'unpaid' }) {
    if (!input.fullName || input.fullName.trim().length < 2) {
      throw new Error('Full name is required and must be at least 2 characters.');
    }
    if (!input.phoneNo || !input.phoneNo.trim()) {
      throw new Error('Phone number is required.');
    }

    const cleanedPhone = input.phoneNo.trim();
    const existingByPhone = await User.findOne({ phoneNo: cleanedPhone });
    if (existingByPhone) {
      throw new Error(`A patron with phone number "${cleanedPhone}" already exists.`);
    }

    let email = input.email && input.email.trim() ? input.email.trim().toLowerCase() : undefined;
    if (email) {
      const existingByEmail = await User.findOne({ email });
      if (existingByEmail) {
        throw new Error(`A patron with email "${email}" already exists.`);
      }
    } else {
      const digits = cleanedPhone.replace(/\D/g, '');
      email = `patron.${digits || Date.now()}@library.local`;
    }

    const feesStatus = input.feesStatus === 'paid' ? 'paid' : 'unpaid';
    const now = new Date();
    const feesPaidAt = feesStatus === 'paid' ? now : null;
    const feesExpiresAt = feesStatus === 'paid' ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) : null;

    const user = new User({
      fullName: input.fullName.trim(),
      phoneNo: cleanedPhone,
      email,
      status: 'approved',
      feesStatus,
      feesPaidAt,
      feesExpiresAt,
    });

    await user.save();
    return user;
  }

  /**
   * Get user details and currently holding borrowed books
   */
  static async getUserDetails(userId: string) {
    if (!userId) throw new Error('User ID is required');
    await AdminService.checkAndUpdateExpiredFees();

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Find books currently holding (active loans: borrowed, overdue, return_pending)
    const activeLoans = await History.find({
      user: userId,
      status: { $in: ['borrowed', 'overdue', 'return_pending'] },
    })
      .populate({
        path: 'book',
        select: 'bookName bookCode shelf category imageUrl noOfPages isbn available noOfCopies',
        populate: [
          { path: 'publisher', select: 'name' },
          { path: 'authors', select: 'name' },
        ],
      })
      .sort({ borrowedAt: -1 });

    return {
      user,
      activeLoans,
    };
  }

  /**
   * Update patron details (name, phone, email, status)
   */
  static async updateUser(
    userId: string,
    input: { fullName?: string; phoneNo?: string; email?: string; status?: string; feesStatus?: 'paid' | 'unpaid' }
  ) {
    if (!userId) throw new Error('User ID is required');
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    if (input.fullName !== undefined) {
      if (!input.fullName.trim() || input.fullName.trim().length < 2) {
        throw new Error('Full name must be at least 2 characters long.');
      }
      user.fullName = input.fullName.trim();
    }

    if (input.phoneNo !== undefined) {
      const cleanedPhone = input.phoneNo.trim();
      if (cleanedPhone) {
        const existingByPhone = await User.findOne({ phoneNo: cleanedPhone, _id: { $ne: userId } });
        if (existingByPhone) {
          throw new Error(`Phone number "${cleanedPhone}" is already assigned to another user.`);
        }
        user.phoneNo = cleanedPhone;
      } else {
        user.phoneNo = undefined;
      }
    }

    if (input.email !== undefined) {
      const cleanedEmail = input.email.trim().toLowerCase();
      if (cleanedEmail) {
        const existingByEmail = await User.findOne({ email: cleanedEmail, _id: { $ne: userId } });
        if (existingByEmail) {
          throw new Error(`Email "${cleanedEmail}" is already assigned to another user.`);
        }
        user.email = cleanedEmail;
      }
    }

    if (input.status !== undefined) {
      const validStatuses = ['waiting', 'approved', 'rejected', 'blocked'];
      if (!validStatuses.includes(input.status)) {
        throw new Error('Invalid status.');
      }
      user.status = input.status === 'blocked' ? 'rejected' : (input.status as any);
    }

    if (input.feesStatus !== undefined) {
      if (!['paid', 'unpaid'].includes(input.feesStatus)) {
        throw new Error('Invalid fees status. Allowed values: paid, unpaid');
      }
      user.feesStatus = input.feesStatus;
      if (input.feesStatus === 'paid') {
        const now = new Date();
        user.feesPaidAt = now;
        // 365 days validity from payment date
        user.feesExpiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      } else {
        user.feesExpiresAt = null;
      }
    }

    await user.save();
    return user;
  }

  /**
   * Clear orphaned authors and publishers from the database.
   * Authors and publishers exist ONLY when at least one book (available or unavailable) references them.
   */
  static async syncAuthorsAndPublishers(): Promise<{ deletedAuthors: number; deletedPublishers: number }> {
    // 1. Get all distinct author IDs referenced by existing books (including unavailable books)
    const rawAuthorIds = await Book.distinct('authors');
    const referencedAuthorIds = rawAuthorIds.filter((id) => id != null);

    let authorDeleteResult;
    if (referencedAuthorIds.length === 0) {
      authorDeleteResult = await Author.deleteMany({});
    } else {
      authorDeleteResult = await Author.deleteMany({
        _id: { $nin: referencedAuthorIds },
      });
    }

    // 2. Get all distinct publisher IDs referenced by existing books (including unavailable books)
    const rawPublisherIds = await Book.distinct('publisher');
    const referencedPublisherIds = rawPublisherIds.filter((id) => id != null);

    let publisherDeleteResult;
    if (referencedPublisherIds.length === 0) {
      publisherDeleteResult = await Publisher.deleteMany({});
    } else {
      publisherDeleteResult = await Publisher.deleteMany({
        _id: { $nin: referencedPublisherIds },
      });
    }

    return {
      deletedAuthors: authorDeleteResult.deletedCount || 0,
      deletedPublishers: publisherDeleteResult.deletedCount || 0,
    };
  }

  /**
   * Get all publishers / publications that currently have books in the library catalog
   */
  static async getPublications() {
    await AdminService.syncAuthorsAndPublishers();
    return Publisher.find().sort({ createdAt: -1 });
  }

  /**
   * Get all registered book authors that currently have books in the library catalog
   */
  static async getAuthors() {
    await AdminService.syncAuthorsAndPublishers();
    return Author.find().sort({ createdAt: -1 });
  }

  static async deleteBook(bookId: string) {
    const book = await Book.findById(bookId);
    if (!book) {
      throw new Error("Book is not found");
    }

    const activeLoan = await History.findOne({
      book: bookId,
      status: { $in: ["borrowed", "overdue"] },
    });
    if (activeLoan) {
      throw new Error("This book can't be deleted because this book is borrowed by a user");
    }

    const previousPublisherId = book.publisher;
    const previousAuthorIds = Array.isArray(book.authors) ? [...book.authors] : [];
    const previousShelf = book.shelf;

    await Book.findByIdAndDelete(bookId);

    // Adjust shelf occupancy when book is deleted
    if (previousShelf) {
      await ShelfService.adjustOccupancy(previousShelf, -1);
    }

    // Delete publisher if no other books in the catalog use it
    if (previousPublisherId) {
      const remainingBooksWithPublisher = await Book.countDocuments({ publisher: previousPublisherId });
      if (remainingBooksWithPublisher === 0) {
        await Publisher.findByIdAndDelete(previousPublisherId);
      }
    }

    // Delete author(s) if no other books in the catalog use them
    for (const authorId of previousAuthorIds) {
      if (authorId) {
        const remainingBooksWithAuthor = await Book.countDocuments({ authors: authorId });
        if (remainingBooksWithAuthor === 0) {
          await Author.findByIdAndDelete(authorId);
        }
      }
    }

    // Final sync to clean up any edge case orphans
    await AdminService.syncAuthorsAndPublishers();

    return { success: true, message: "Book successfully deleted" };
  }

  /**
   * Get admin notifications
   */
  static async getNotifications() {
    const notifications = await Notification.find({ recipient: 'admin' })
      .populate('userId', 'fullName email phoneNo status')
      .sort({ createdAt: -1 })
      .limit(50);
    const unreadCount = await Notification.countDocuments({
      recipient: 'admin',
      read: false,
    });
    return { notifications, unreadCount };
  }

  /**
   * Mark a notification as read
   */
  static async markNotificationRead(notificationId: string) {
    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { read: true },
      { new: true }
    );
    if (!notification) {
      throw new Error('Notification not found');
    }
    const unreadCount = await Notification.countDocuments({
      recipient: 'admin',
      read: false,
    });
    return { notification, unreadCount };
  }

  /**
   * Mark all notifications as read
   */
  static async markAllNotificationsRead() {
    await Notification.updateMany({ recipient: 'admin', read: false }, { read: true });
    return { success: true, unreadCount: 0 };
  }

  /**
   * Clear all admin notifications
   */
  static async clearAllNotifications() {
    await Notification.deleteMany({ recipient: 'admin' });
    return { success: true, unreadCount: 0 };
  }

  /**
   * Get user requests with search, filter, and sorting
   */
  static async getUserRequests(params?: {
    status?: string;
    search?: string;
    sortBy?: string;
  }) {
    const filter: Record<string, any> = {};

    if (params?.status && params.status !== 'all') {
      filter.status = params.status;
    }

    if (params?.search && params.search.trim()) {
      const searchRegex = new RegExp(params.search.trim(), 'i');
      filter.$or = [
        { fullName: searchRegex },
        { email: searchRegex },
        { phoneNo: searchRegex },
      ];
    }

    let sort: Record<string, any> = { createdAt: -1 };
    if (params?.sortBy) {
      switch (params.sortBy) {
        case 'date-asc':
          sort = { createdAt: 1 };
          break;
        case 'name-asc':
          sort = { fullName: 1 };
          break;
        case 'name-desc':
          sort = { fullName: -1 };
          break;
        case 'email-asc':
          sort = { email: 1 };
          break;
        case 'email-desc':
          sort = { email: -1 };
          break;
        case 'date-desc':
        default:
          sort = { createdAt: -1 };
          break;
      }
    }

    const requests = await User.find(filter).sort(sort);
    const waitingCount = await User.countDocuments({ status: 'waiting' });
    const approvedCount = await User.countDocuments({ status: 'approved' });
    const rejectedCount = await User.countDocuments({ status: 'rejected' });
    const totalCount = await User.countDocuments();

    return {
      requests,
      counts: {
        waiting: waitingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: totalCount,
      },
    };
  }

  /**
   * Update user status (approve, reject, or set waiting)
   */
  static async updateUserStatus(userId: string, status: 'waiting' | 'approved' | 'rejected' | 'blocked') {
    const normalizedStatus = status === 'blocked' ? 'rejected' : status;
    if (!['waiting', 'approved', 'rejected'].includes(normalizedStatus)) {
      throw new Error('Invalid status. Allowed values: waiting, approved, rejected, blocked');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.status = normalizedStatus;
    await user.save();

    // If approved, mark any waiting notification for this user as read
    if (normalizedStatus === 'approved') {
      await Notification.updateMany({ userId: user._id, read: false }, { read: true });
    }

    return user;
  }

  /**
   * Get pending request counts for waiting list
   */
  static async getAdminRequestsCounts() {
    const usersWaiting = await User.countDocuments({ status: 'waiting' });

    return {
      users: usersWaiting,
      waiting: usersWaiting,
      borrow: 0,
      extension: 0,
      return: 0,
      totalPending: usersWaiting,
    };
  }

  /**
   * Get borrow requests with status filter, search, and sorting
   */
  static async getBorrowRequests(params?: {
    status?: string;
    search?: string;
    sortBy?: string;
  }) {
    const filter: Record<string, any> = {};

    if (params?.status && params.status !== 'all') {
      if (params.status === 'pending') {
        filter.status = 'borrow_pending';
      } else if (params.status === 'approved') {
        filter.status = { $in: ['borrowed', 'return_pending', 'returned'] };
      } else if (params.status === 'rejected') {
        filter.status = 'borrow_rejected';
      } else {
        filter.status = params.status;
      }
    } else {
      // By default all borrow-related records
      filter.status = { $in: ['borrow_pending', 'borrowed', 'borrow_rejected', 'return_pending', 'returned'] };
    }

    let sort: Record<string, any> = { createdAt: -1 };
    if (params?.sortBy === 'date-asc') {
      sort = { createdAt: 1 };
    }

    let query = History.find(filter)
      .populate('user', 'fullName email phoneNo avatar status')
      .populate({
        path: 'book',
        populate: [
          { path: 'publisher', select: 'name' },
          { path: 'authors', select: 'name category' },
        ],
      })
      .sort(sort);

    let requests = await query;

    // In-memory search across populated fields if search param is provided
    if (params?.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      requests = requests.filter((r: any) => {
        const u = r.user;
        const b = r.book;
        const userMatches =
          (u?.fullName && u.fullName.toLowerCase().includes(q)) ||
          (u?.email && u.email.toLowerCase().includes(q)) ||
          (u?.phoneNo && u.phoneNo.toLowerCase().includes(q));
        const bookMatches =
          (b?.bookName && b.bookName.toLowerCase().includes(q)) ||
          (b?.bookCode && b.bookCode.toLowerCase().includes(q)) ||
          (b?.category && b.category.toLowerCase().includes(q));
        return userMatches || bookMatches;
      });
    }

    const pendingCount = await History.countDocuments({ status: 'borrow_pending' });
    const approvedCount = await History.countDocuments({
      status: { $in: ['borrowed', 'return_pending', 'returned'] },
    });
    const rejectedCount = await History.countDocuments({ status: 'borrow_rejected' });

    return {
      requests,
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: pendingCount + approvedCount + rejectedCount,
      },
    };
  }

  /**
   * Approve or reject a user borrow request
   */
  static async updateBorrowRequestStatus(
    loanId: string,
    status: 'approved' | 'rejected',
    remarks?: string
  ) {
    const loan = await History.findById(loanId).populate('book').populate('user');
    if (!loan) {
      throw new Error('Borrow request not found');
    }

    if (loan.status !== 'borrow_pending') {
      throw new Error(`Cannot change status: request is already ${loan.status}`);
    }

    if (status === 'approved') {
      const book = await Book.findById(loan.book._id || loan.book);
      if (!book) {
        throw new Error('Book associated with request was not found');
      }

      if (book.available === false || (book.noOfCopies !== undefined && book.noOfCopies <= 0)) {
        throw new Error('Cannot approve: book is currently out of stock or unavailable');
      }

      // Deduct inventory
      if (book.noOfCopies !== undefined && book.noOfCopies > 0) {
        book.noOfCopies -= 1;
        if (book.noOfCopies === 0) {
          book.available = false;
        }
      } else {
        book.available = false;
      }
      await book.save();

      loan.status = 'borrowed';
      loan.borrowedAt = new Date();
      loan.dueDate = new Date(Date.now() + BORROW_DAYS * 86400000);
      loan.remarks = remarks ? remarks.trim() : '';
    } else {
      loan.status = 'borrow_rejected';
      loan.adminRemarks = remarks ? remarks.trim() : 'Request rejected by librarian';
    }

    await loan.save();

    // Mark related notifications as read
    try {
      await Notification.updateMany(
        { link: { $regex: 'tab=borrow' }, read: false, userId: loan.user?._id },
        { read: true }
      );
    } catch {}

    return loan;
  }

  /**
   * Get extension requests with filter, search, and sorting
   */
  static async getExtensionRequests(params?: {
    status?: string;
    search?: string;
    sortBy?: string;
  }) {
    const filter: Record<string, any> = {};

    if (params?.status && params.status !== 'all') {
      filter.extensionStatus = params.status;
    } else {
      filter.extensionStatus = { $in: ['pending', 'approved', 'rejected'] };
    }

    let sort: Record<string, any> = { extensionRequestedAt: -1, updatedAt: -1 };
    if (params?.sortBy === 'date-asc') {
      sort = { extensionRequestedAt: 1, updatedAt: 1 };
    }

    let requests = await History.find(filter)
      .populate('user', 'fullName email phoneNo avatar status')
      .populate({
        path: 'book',
        populate: [
          { path: 'publisher', select: 'name' },
          { path: 'authors', select: 'name category' },
        ],
      })
      .sort(sort);

    if (params?.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      requests = requests.filter((r: any) => {
        const u = r.user;
        const b = r.book;
        const userMatches =
          (u?.fullName && u.fullName.toLowerCase().includes(q)) ||
          (u?.email && u.email.toLowerCase().includes(q)) ||
          (u?.phoneNo && u.phoneNo.toLowerCase().includes(q));
        const bookMatches =
          (b?.bookName && b.bookName.toLowerCase().includes(q)) ||
          (b?.bookCode && b.bookCode.toLowerCase().includes(q)) ||
          (b?.category && b.category.toLowerCase().includes(q));
        return userMatches || bookMatches;
      });
    }

    const pendingCount = await History.countDocuments({ extensionStatus: 'pending' });
    const approvedCount = await History.countDocuments({ extensionStatus: 'approved' });
    const rejectedCount = await History.countDocuments({ extensionStatus: 'rejected' });

    return {
      requests,
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: pendingCount + approvedCount + rejectedCount,
      },
    };
  }

  /**
   * Approve or reject a loan extension request
   */
  static async updateExtensionRequestStatus(
    loanId: string,
    status: 'approved' | 'rejected',
    remarks?: string
  ) {
    const loan = await History.findById(loanId).populate('book').populate('user');
    if (!loan) {
      throw new Error('Extension request not found');
    }

    if (loan.extensionStatus !== 'pending') {
      throw new Error(`Cannot change status: extension is already ${loan.extensionStatus}`);
    }

    if (status === 'approved') {
      loan.extensionStatus = 'approved';
      loan.extensionApprovedAt = new Date();
      const extraDays = loan.extensionDays || EXTENSION_DAYS;
      const baseDueDate = loan.dueDate ? new Date(loan.dueDate).getTime() : Date.now();
      loan.dueDate = new Date(baseDueDate + extraDays * 86400000);
      loan.adminRemarks = remarks ? remarks.trim() : '';
    } else {
      loan.extensionStatus = 'rejected';
      loan.adminRemarks = remarks ? remarks.trim() : 'Extension request rejected';
    }

    await loan.save();

    try {
      await Notification.updateMany(
        { link: { $regex: 'tab=extension' }, read: false, userId: loan.user?._id },
        { read: true }
      );
    } catch {}

    return loan;
  }

  /**
   * Get return requests with filter, search, and sorting
   */
  static async getReturnRequests(params?: {
    status?: string;
    search?: string;
    sortBy?: string;
  }) {
    const filter: Record<string, any> = {};

    if (params?.status && params.status !== 'all') {
      if (params.status === 'pending') {
        filter.status = 'return_pending';
      } else if (params.status === 'approved') {
        filter.status = 'returned';
      } else {
        filter.status = params.status;
      }
    } else {
      filter.status = { $in: ['return_pending', 'returned'] };
    }

    let sort: Record<string, any> = { updatedAt: -1 };
    if (params?.sortBy === 'date-asc') {
      sort = { updatedAt: 1 };
    }

    let requests = await History.find(filter)
      .populate('user', 'fullName email phoneNo avatar status')
      .populate({
        path: 'book',
        populate: [
          { path: 'publisher', select: 'name' },
          { path: 'authors', select: 'name category' },
        ],
      })
      .sort(sort);

    if (params?.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      requests = requests.filter((r: any) => {
        const u = r.user;
        const b = r.book;
        const userMatches =
          (u?.fullName && u.fullName.toLowerCase().includes(q)) ||
          (u?.email && u.email.toLowerCase().includes(q)) ||
          (u?.phoneNo && u.phoneNo.toLowerCase().includes(q));
        const bookMatches =
          (b?.bookName && b.bookName.toLowerCase().includes(q)) ||
          (b?.bookCode && b.bookCode.toLowerCase().includes(q)) ||
          (b?.category && b.category.toLowerCase().includes(q));
        return userMatches || bookMatches;
      });
    }

    const pendingCount = await History.countDocuments({ status: 'return_pending' });
    const approvedCount = await History.countDocuments({ status: 'returned' });

    return {
      requests,
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: 0,
        total: pendingCount + approvedCount,
      },
    };
  }

  /**
   * Approve or reject a book return request
   */
  static async updateReturnRequestStatus(
    loanId: string,
    status: 'approved' | 'rejected',
    remarks?: string
  ) {
    const loan = await History.findById(loanId).populate('book').populate('user');
    if (!loan) {
      throw new Error('Return request not found');
    }

    if (loan.status !== 'return_pending') {
      throw new Error(`Cannot change status: return is already ${loan.status}`);
    }

    if (status === 'approved') {
      loan.status = 'returned';
      loan.returnedAt = new Date();
      loan.adminRemarks = remarks ? remarks.trim() : '';

      // Restore book inventory
      const book = await Book.findById(loan.book._id || loan.book);
      if (book) {
        book.noOfCopies = (book.noOfCopies || 0) + 1;
        book.available = true;
        await book.save();
      }

      // If user submitted rating/review, persist in Review collection and recompute average
      if (loan.rating) {
        try {
          const bookId = loan.book._id || loan.book;
          await Review.findOneAndUpdate(
            { user: loan.user._id || loan.user, book: bookId },
            {
              user: loan.user._id || loan.user,
              book: bookId,
              history: loan._id,
              rating: loan.rating,
              review: loan.review || '',
              readingStatus: loan.readingStatus || 'completed',
            },
            { upsert: true, new: true }
          );

          const stats = await Review.aggregate([
            { $match: { book: bookId } },
            {
              $group: {
                _id: '$book',
                averageRating: { $avg: '$rating' },
                ratingsCount: { $sum: 1 },
              },
            },
          ]);

          if (stats.length > 0) {
            const avg = Math.round(stats[0].averageRating * 10) / 10;
            await Book.findByIdAndUpdate(bookId, {
              averageRating: avg,
              ratingsCount: stats[0].ratingsCount,
            });
          }
        } catch (revErr) {
          console.warn('Could not sync review on return approval:', revErr);
        }
      }
    } else {
      // If rejected, book remains in borrowed state with admin remarks
      loan.status = 'borrowed';
      loan.adminRemarks = remarks ? remarks.trim() : 'Return unapproved by librarian';
    }

    await loan.save();

    try {
      await Notification.updateMany(
        { link: { $regex: 'tab=return' }, read: false, userId: loan.user?._id },
        { read: true }
      );
    } catch {}

    return loan;
  }
}
