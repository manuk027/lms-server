import { MetadataNormalizer } from './metadata.normalizer'

export interface FetchedBookMetadata {
  isbn: string
  name: string
  authorName: string
  publication: string
  noOfPages: number | ''
  language: string
  category: string
  subjects: string[]
  coverImageUrl?: string
  publishYear?: string
  description?: string
  source: 'googlebooks' | 'openlibrary' | 'manual'
}

export class IsbnService {
  /**
   * Fetch rich book metadata from Google Books and OpenLibrary by ISBN
   */
  static async lookupIsbn(rawIsbn: string): Promise<FetchedBookMetadata> {
    const cleanIsbn = rawIsbn.replace(/[^0-9X]/gi, '').trim()
    if (!cleanIsbn) {
      throw new Error('Please provide a valid ISBN code.')
    }

    // 1. Try Google Books API first for rich description & categories
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 7000)
      const gbRes = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`,
        { signal: controller.signal }
      )
      clearTimeout(timeoutId)

      if (gbRes.ok) {
        const gbData = await gbRes.json()
        if (gbData.items && gbData.items.length > 0) {
          const vol = gbData.items[0].volumeInfo
          const rawCategories = Array.isArray(vol.categories) ? vol.categories : []
          const rawCategory = rawCategories[0] || 'General'
          const normalizedCategory = MetadataNormalizer.normalizeGenre(rawCategory)
          const normalizedSubjects = MetadataNormalizer.normalizeSubjects(rawCategories)

          const cover =
            vol.imageLinks?.thumbnail ||
            vol.imageLinks?.smallThumbnail ||
            `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`
          const secureCover = cover.replace(/^http:\/\//i, 'https://')

          return {
            isbn: cleanIsbn,
            name: vol.title || '',
            authorName: Array.isArray(vol.authors) ? vol.authors.join(', ') : 'Unknown Author',
            publication: vol.publisher || 'Unknown Publisher',
            noOfPages: typeof vol.pageCount === 'number' ? vol.pageCount : '',
            language: MetadataNormalizer.normalizeLanguage(vol.language || 'English'),
            category: normalizedCategory,
            subjects: normalizedSubjects,
            coverImageUrl: secureCover,
            publishYear: vol.publishedDate ? vol.publishedDate.substring(0, 4) : '',
            description: vol.description || '',
            source: 'googlebooks',
          }
        }
      }
    } catch (err) {
      console.warn('[IsbnService] Google Books lookup failed, attempting OpenLibrary...', err)
    }

    // 2. Fallback to Open Library
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 7000)
      const olRes = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`,
        {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        }
      )
      clearTimeout(timeoutId)

      if (olRes.ok) {
        const olData = await olRes.json()
        const bookData = olData[`ISBN:${cleanIsbn}`]
        if (bookData && bookData.title) {
          const authors = Array.isArray(bookData.authors)
            ? bookData.authors.map((a: { name: string }) => a.name).join(', ')
            : 'Unknown Author'
          const publication =
            Array.isArray(bookData.publishers) && bookData.publishers.length > 0
              ? bookData.publishers[0].name
              : 'Unknown Publisher'

          const rawSubjects = Array.isArray(bookData.subjects)
            ? bookData.subjects.map((s: { name: string }) => s.name)
            : []
          const rawCategory = rawSubjects[0] || 'General Literature'

          const cover =
            bookData.cover?.large ||
            bookData.cover?.medium ||
            bookData.cover?.small ||
            `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`

          return {
            isbn: cleanIsbn,
            name: bookData.title || '',
            authorName: authors,
            publication: publication,
            noOfPages: bookData.number_of_pages || '',
            language: 'English',
            category: MetadataNormalizer.normalizeGenre(rawCategory),
            subjects: MetadataNormalizer.normalizeSubjects(rawSubjects),
            coverImageUrl: cover,
            publishYear: bookData.publish_date || '',
            description: typeof bookData.notes === 'string' ? bookData.notes : '',
            source: 'openlibrary',
          }
        }
      }
    } catch (err) {
      console.warn('[IsbnService] Open Library lookup failed', err)
    }

    throw new Error(`No online catalog metadata found for ISBN ${rawIsbn}. Please enter details manually.`)
  }
}

