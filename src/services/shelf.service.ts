import { Book, IShelf, Shelf } from '../models'
import { MetadataNormalizer } from './metadata.normalizer'

export interface ShelfEligibilityResult {
  isEligible: boolean
  reasons: string[]
  rejectionReason?: string
}

export class ShelfService {
  /**
   * Default starter shelves for standard library classification
   */
  private static DEFAULT_SHELVES: Array<Partial<IShelf>> = [
    {
      shelfCode: 'TEC-01',
      shelfName: 'Computer Science & Technology Tier 1',
      allowedGenres: ['Computer Science', 'Technology'],
      allowedLanguages: ['English'],
      allowedFormats: [],
      maxCapacity: 40,
      location: '2nd Floor, Aisle 3',
      notes: 'Main computing and software engineering rack',
    },
    {
      shelfCode: 'BUS-01',
      shelfName: 'Business, Economics & Entrepreneurship',
      allowedGenres: ['Entrepreneurship', 'Business & Economics'],
      allowedLanguages: [],
      allowedFormats: [],
      maxCapacity: 35,
      location: '1st Floor, Aisle 1',
      notes: 'Startup, management, and commerce titles',
    },
    {
      shelfCode: 'PHIL-01',
      shelfName: 'Philosophy, Psychology & Mental Work',
      allowedGenres: ['Philosophy & Psychology', 'Self-Help'],
      allowedLanguages: [],
      allowedFormats: [],
      maxCapacity: 30,
      location: '1st Floor, Aisle 2',
      notes: 'Mind, psychology, and cognitive development',
    },
    {
      shelfCode: 'LIT-01',
      shelfName: 'General Literature & Fiction',
      allowedGenres: ['General Literature', 'Fiction', 'Classics', 'Poetry & Plays'],
      allowedLanguages: [],
      allowedFormats: [],
      maxCapacity: 50,
      location: 'Ground Floor, Main Hall',
      notes: 'General fiction, novels, and classic literature',
    },
    {
      shelfCode: 'SCI-01',
      shelfName: 'Science, Mathematics & Natural Sciences',
      allowedGenres: ['Science & Mathematics', 'Applied Sciences & Medicine'],
      allowedLanguages: [],
      allowedFormats: [],
      maxCapacity: 35,
      location: '2nd Floor, Aisle 1',
      notes: 'Physics, chemistry, biology, and mathematics',
    },
    {
      shelfCode: 'HIST-01',
      shelfName: 'History, Politics & Social Sciences',
      allowedGenres: ['History & Politics', 'Social Sciences', 'Biography & Memoir'],
      allowedLanguages: [],
      allowedFormats: [],
      maxCapacity: 40,
      location: '2nd Floor, Aisle 2',
      notes: 'World history, political analysis, and biographies',
    },
  ]

  /**
   * Synchronize existing shelf strings from books collection and seed starter shelves if needed
   */
  static async syncShelves(): Promise<void> {
    try {
      // 1. Ensure default library shelves exist
      for (const def of this.DEFAULT_SHELVES) {
        if (!def.shelfCode) continue
        const existing = await Shelf.findOne({ shelfCode: def.shelfCode })
        if (!existing) {
          await Shelf.create({
            ...def,
            currentOccupancy: 0,
            isActive: true,
          })
        }
      }

      // 2. Scan all distinct shelves currently used by books in the library
      const distinctShelves = await Book.distinct('shelf')
      for (const rawShelf of distinctShelves) {
        if (!rawShelf || typeof rawShelf !== 'string' || !rawShelf.trim()) continue
        const code = rawShelf.trim().toUpperCase()

        const count = await Book.countDocuments({
          shelf: { $regex: new RegExp(`^${rawShelf.trim()}$`, 'i') },
        })

        const existingShelf = await Shelf.findOne({
          $or: [{ shelfCode: code }, { shelfCode: rawShelf.trim() }],
        })

        if (!existingShelf) {
          await Shelf.create({
            shelfCode: code,
            shelfName: `Shelf ${rawShelf.trim()}`,
            allowedGenres: [], // empty = unrestricted
            allowedLanguages: [], // empty = unrestricted
            allowedFormats: [], // empty = unrestricted
            maxCapacity: Math.max(50, count + 15),
            currentOccupancy: count,
            isActive: true,
            location: 'Main Floor Stacks',
          })
        } else {
          // Update live occupancy
          if (existingShelf.currentOccupancy !== count) {
            existingShelf.currentOccupancy = count
            await existingShelf.save()
          }
        }
      }
    } catch (err) {
      console.warn('Shelf synchronization warning:', err)
    }
  }

  /**
   * List all shelves with option to filter active only
   */
  static async getAllShelves(activeOnly = true): Promise<IShelf[]> {
    const filter = activeOnly ? { isActive: true } : {}
    return Shelf.find(filter).sort({ shelfCode: 1 })
  }

  /**
   * Retrieve single shelf by code
   */
  static async getShelfByCode(shelfCode: string): Promise<IShelf | null> {
    const code = (shelfCode || '').trim().toUpperCase()
    return Shelf.findOne({
      $or: [{ shelfCode: code }, { shelfCode: shelfCode.trim() }],
    })
  }

  /**
   * Validate whether a book is eligible to be placed on a specific shelf
   */
  static validateShelfEligibility(
    shelf: IShelf,
    book: {
      category?: string
      language?: string
      format?: string
      noOfCopies?: number
    }
  ): ShelfEligibilityResult {
    const reasons: string[] = []

    // 1. Active status check
    if (!shelf.isActive) {
      return {
        isEligible: false,
        reasons: [],
        rejectionReason: `Shelf ${shelf.shelfCode} is currently marked inactive.`,
      }
    }

    // 2. Physical capacity restriction
    const copiesToAdd = Math.max(1, book.noOfCopies || 1)
    const availableSlots = shelf.maxCapacity - shelf.currentOccupancy
    if (availableSlots < copiesToAdd) {
      return {
        isEligible: false,
        reasons: [],
        rejectionReason: `Shelf ${shelf.shelfCode} is full (capacity: ${shelf.maxCapacity}, occupied: ${shelf.currentOccupancy}).`,
      }
    }

    // 3. Genre / Category restriction
    const normalizedBookCategory = MetadataNormalizer.normalizeGenre(book.category)
    if (shelf.allowedGenres && shelf.allowedGenres.length > 0) {
      const normalizedAllowed = shelf.allowedGenres.map((g) =>
        MetadataNormalizer.normalizeGenre(g)
      )
      const matchesGenre = normalizedAllowed.includes(normalizedBookCategory)

      if (!matchesGenre) {
        return {
          isEligible: false,
          reasons: [],
          rejectionReason: `Shelf ${shelf.shelfCode} does not accept genre "${normalizedBookCategory}".`,
        }
      }
      reasons.push(`Permitted genre: ${normalizedBookCategory}`)
    } else {
      reasons.push(`Accepts all categories (unrestricted)`)
    }

    // 4. Language restriction
    const normalizedBookLang = MetadataNormalizer.normalizeLanguage(book.language)
    if (shelf.allowedLanguages && shelf.allowedLanguages.length > 0) {
      const normalizedAllowedLang = shelf.allowedLanguages.map((l) =>
        MetadataNormalizer.normalizeLanguage(l)
      )
      const matchesLang = normalizedAllowedLang.includes(normalizedBookLang)

      if (!matchesLang) {
        return {
          isEligible: false,
          reasons: [],
          rejectionReason: `Shelf ${shelf.shelfCode} only allows [${shelf.allowedLanguages.join(', ')}], book language is ${normalizedBookLang}.`,
        }
      }
      reasons.push(`Permitted language: ${normalizedBookLang}`)
    }

    // 5. Format restriction
    const normalizedFormat = MetadataNormalizer.normalizeFormat(book.format)
    if (shelf.allowedFormats && shelf.allowedFormats.length > 0) {
      const normalizedAllowedFormats = shelf.allowedFormats.map((f) =>
        MetadataNormalizer.normalizeFormat(f)
      )
      const matchesFormat = normalizedAllowedFormats.includes(normalizedFormat)

      if (!matchesFormat) {
        return {
          isEligible: false,
          reasons: [],
          rejectionReason: `Shelf ${shelf.shelfCode} does not accept format ${normalizedFormat}.`,
        }
      }
      reasons.push(`Permitted format: ${normalizedFormat}`)
    }

    return {
      isEligible: true,
      reasons,
    }
  }

  /**
   * Atomically adjust shelf occupancy
   */
  static async adjustOccupancy(shelfCode: string, delta: number): Promise<IShelf | null> {
    const code = shelfCode.trim().toUpperCase()
    return Shelf.findOneAndUpdate(
      { $or: [{ shelfCode: code }, { shelfCode: shelfCode.trim() }] },
      { $inc: { currentOccupancy: delta } },
      { new: true }
    )
  }

  /**
   * Create a new shelf
   */
  static async createShelf(data: Partial<IShelf>): Promise<IShelf> {
    if (!data.shelfCode || !data.shelfCode.trim()) {
      throw new Error('Shelf code is required.')
    }
    const code = data.shelfCode.trim().toUpperCase()
    const existing = await Shelf.findOne({ shelfCode: code })
    if (existing) {
      throw new Error(`Shelf with code "${code}" already exists.`)
    }
    return Shelf.create({
      ...data,
      shelfCode: code,
      shelfName: data.shelfName || `Shelf ${code}`,
      maxCapacity: data.maxCapacity || 50,
      currentOccupancy: data.currentOccupancy || 0,
      isActive: data.isActive !== undefined ? data.isActive : true,
    })
  }

  /**
   * Update an existing shelf
   */
  static async updateShelf(shelfCode: string, updates: Partial<IShelf>): Promise<IShelf | null> {
    const code = shelfCode.trim().toUpperCase()
    return Shelf.findOneAndUpdate(
      { $or: [{ shelfCode: code }, { shelfCode: shelfCode.trim() }] },
      { $set: updates },
      { new: true }
    )
  }
}
