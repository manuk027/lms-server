/**
 * Metadata Normalization Service
 * Canonical taxonomy and normalization utilities for genres, languages, subjects, and book formats.
 */

export interface NormalizedMetadata {
  category: string
  language: string
  subjects: string[]
  format: string
  raw?: Record<string, unknown>
}

// Canonical category taxonomy mapping
const CATEGORY_MAP: Record<string, string> = {
  // Computer Science & Technology
  'computer science': 'Computer Science',
  'computers': 'Computer Science',
  'computing': 'Computer Science',
  'programming': 'Computer Science',
  'software engineering': 'Computer Science',
  'software': 'Computer Science',
  'web development': 'Computer Science',
  'technology': 'Technology',
  'information technology': 'Technology',
  'data science': 'Technology',
  'artificial intelligence': 'Technology',

  // Entrepreneurship & Business
  'entrepreneurship': 'Entrepreneurship',
  'business': 'Business & Economics',
  'economics': 'Business & Economics',
  'finance': 'Business & Economics',
  'management': 'Business & Economics',
  'marketing': 'Business & Economics',

  // Literature & Fiction
  'general literature': 'General Literature',
  'literature': 'General Literature',
  'fiction': 'Fiction',
  'classic': 'Classics',
  'classics': 'Classics',
  'novel': 'Fiction',
  'novels': 'Fiction',
  'mystery': 'Mystery & Thriller',
  'thriller': 'Mystery & Thriller',
  'science fiction': 'Science Fiction & Fantasy',
  'fantasy': 'Science Fiction & Fantasy',
  'poetry': 'Poetry & Plays',

  // Philosophy & Psychology
  'philosophy & psychology': 'Philosophy & Psychology',
  'philosophy': 'Philosophy & Psychology',
  'psychology': 'Philosophy & Psychology',
  'mental work': 'Philosophy & Psychology',
  'mental health': 'Philosophy & Psychology',

  // Science & Mathematics
  'science': 'Science & Mathematics',
  'mathematics': 'Science & Mathematics',
  'math': 'Science & Mathematics',
  'physics': 'Science & Mathematics',
  'chemistry': 'Science & Mathematics',
  'biology': 'Science & Mathematics',

  // Social Sciences & History
  'history': 'History & Politics',
  'politics': 'History & Politics',
  'political science': 'History & Politics',
  'social science': 'Social Sciences',
  'social sciences': 'Social Sciences',
  'sociology': 'Social Sciences',

  // Self-Help & Personal Development
  'self-help': 'Self-Help',
  'self help': 'Self-Help',
  'personal development': 'Self-Help',
  'productivity': 'Self-Help',

  // Biography & Autobiography
  'biography': 'Biography & Memoir',
  'autobiography': 'Biography & Memoir',
  'memoir': 'Biography & Memoir',
}

// Canonical languages mapping (supporting ISO codes and natural names)
const LANGUAGE_MAP: Record<string, string> = {
  'en': 'English',
  'eng': 'English',
  'english': 'English',
  'ml': 'Malayalam',
  'mal': 'Malayalam',
  'malayalam': 'Malayalam',
  'hi': 'Hindi',
  'hin': 'Hindi',
  'hindi': 'Hindi',
  'ta': 'Tamil',
  'tam': 'Tamil',
  'tamil': 'Tamil',
  'te': 'Telugu',
  'tel': 'Telugu',
  'telugu': 'Telugu',
  'kn': 'Kannada',
  'kan': 'Kannada',
  'kannada': 'Kannada',
  'es': 'Spanish',
  'spa': 'Spanish',
  'spanish': 'Spanish',
  'fr': 'French',
  'fra': 'French',
  'french': 'French',
  'de': 'German',
  'deu': 'German',
  'german': 'German',
}

// Format mapping
const FORMAT_MAP: Record<string, string> = {
  'hardcover': 'Hardcover',
  'hardback': 'Hardcover',
  'paperback': 'Paperback',
  'softcover': 'Paperback',
  'ebook': 'E-Book',
  'e-book': 'E-Book',
  'audiobook': 'Audiobook',
}

export class MetadataNormalizer {
  /**
   * Normalize genre / category string to canonical library taxonomy
   */
  static normalizeGenre(raw?: string): string {
    if (!raw || typeof raw !== 'string') return 'General Literature'
    const cleaned = raw.toLowerCase().trim().replace(/[_-]/g, ' ').replace(/\s+/g, ' ')

    if (CATEGORY_MAP[cleaned]) {
      return CATEGORY_MAP[cleaned]
    }

    // Check exact match against canonical category values
    const canonicalValues = Array.from(new Set(Object.values(CATEGORY_MAP)))
    const exactCanonical = canonicalValues.find(
      (v) => v.toLowerCase() === cleaned
    )
    if (exactCanonical) {
      return exactCanonical
    }

    // Sort keys by descending length so specific terms ("social sciences", "computer science")
    // match before general terms ("science")
    const sortedEntries = Object.entries(CATEGORY_MAP).sort(
      ([a], [b]) => b.length - a.length
    )

    for (const [key, canonical] of sortedEntries) {
      const regex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (regex.test(cleaned)) {
        return canonical
      }
    }

    // Capitalize words if no match found
    return raw
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
  }

  /**
   * Normalize language to canonical language name
   */
  static normalizeLanguage(raw?: string): string {
    if (!raw || typeof raw !== 'string') return 'English'
    const cleaned = raw.toLowerCase().trim()

    if (LANGUAGE_MAP[cleaned]) {
      return LANGUAGE_MAP[cleaned]
    }

    return raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1).toLowerCase()
  }

  /**
   * Normalize subjects / keywords array
   */
  static normalizeSubjects(rawSubjects?: string | string[]): string[] {
    if (!rawSubjects) return []

    const list: string[] = Array.isArray(rawSubjects)
      ? rawSubjects
      : String(rawSubjects).split(/[,;|\n]/)

    const normalizedSet = new Set<string>()

    for (const item of list) {
      if (typeof item !== 'string') continue
      const cleaned = item
        .trim()
        .toLowerCase()
        .replace(/[_-]/g, ' ')
        .replace(/\s+/g, ' ')
      if (cleaned.length > 1 && cleaned.length < 50) {
        // Capitalize each word for neat canonical presentation
        const canonical = cleaned
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
        normalizedSet.add(canonical)
      }
    }

    return Array.from(normalizedSet)
  }

  /**
   * Normalize book format
   */
  static normalizeFormat(raw?: string): string {
    if (!raw || typeof raw !== 'string') return 'Hardcover'
    const cleaned = raw.toLowerCase().trim().replace(/[_-]/g, '')
    return FORMAT_MAP[cleaned] || 'Hardcover'
  }

  /**
   * Normalize full book metadata object
   */
  static normalize(metadata: {
    category?: string
    language?: string
    subjects?: string | string[]
    format?: string
  }): NormalizedMetadata {
    return {
      category: this.normalizeGenre(metadata.category),
      language: this.normalizeLanguage(metadata.language),
      subjects: this.normalizeSubjects(metadata.subjects),
      format: this.normalizeFormat(metadata.format),
    }
  }

  /**
   * Get all approved categories in taxonomy
   */
  static getAllApprovedCategories(): string[] {
    return Array.from(new Set(Object.values(CATEGORY_MAP)))
  }
}
