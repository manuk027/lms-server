/**
 * Similarity Engine
 * JavaScript-based content similarity algorithm for comparing library books
 * using verified librarian records.
 */

import { MetadataNormalizer } from './metadata.normalizer'

export interface SimilarityWeights {
  genre: number
  language: number
  subjects: number
  format: number
  text: number
}

export const DEFAULT_SIMILARITY_WEIGHTS: SimilarityWeights = {
  genre: 35,
  language: 20,
  subjects: 30,
  format: 10,
  text: 5,
}

export interface BookComparisonData {
  title?: string
  bookName?: string
  category?: string
  language?: string
  subjects?: string[]
  format?: string
  description?: string
  notes?: string
}

export interface BookSimilarityScore {
  score: number // 0 to 100
  matchedFields: string[]
  unavailableFields: string[]
  details: {
    genre: { earned: number; max: number; matched: boolean }
    language: { earned: number; max: number; matched: boolean }
    subjects: { earned: number; max: number; jaccard: number }
    format: { earned: number; max: number; matched: boolean }
    text: { earned: number; max: number; similarity: number }
  }
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'to', 'for', 'with', 'at',
  'by', 'from', 'about', 'as', 'into', 'like', 'through', 'after', 'over',
  'between', 'out', 'against', 'during', 'without', 'before', 'under', 'around',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'book', 'edition', 'vol', 'volume', 'part'
])

export class SimilarityEngine {
  private weights: SimilarityWeights

  constructor(weights: SimilarityWeights = DEFAULT_SIMILARITY_WEIGHTS) {
    this.weights = { ...weights }
  }

  /**
   * Calculate Jaccard similarity for two sets of strings
   * J(A, B) = |A ∩ B| / |A ∪ B|
   */
  static calculateJaccard(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 0
    if (setA.size === 0 || setB.size === 0) return 0

    let intersectionCount = 0
    for (const item of setA) {
      if (setB.has(item)) {
        intersectionCount++
      }
    }

    const unionCount = setA.size + setB.size - intersectionCount
    return unionCount > 0 ? intersectionCount / unionCount : 0
  }

  /**
   * Tokenize and filter meaningful words from text
   */
  static tokenizeText(text?: string): Set<string> {
    if (!text || typeof text !== 'string') return new Set()
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t))

    return new Set(tokens)
  }

  /**
   * Compare candidate book against an existing verified book record
   */
  compare(target: BookComparisonData, reference: BookComparisonData): BookSimilarityScore {
    let earnedWeight = 0
    let totalAvailableWeight = 0
    const matchedFields: string[] = []
    const unavailableFields: string[] = []

    // 1. GENRE / CATEGORY (Weight: 35)
    let genreEarned = 0
    let genreMatched = false
    if (target.category && reference.category) {
      totalAvailableWeight += this.weights.genre
      const normTarget = MetadataNormalizer.normalizeGenre(target.category)
      const normRef = MetadataNormalizer.normalizeGenre(reference.category)

      if (normTarget.toLowerCase() === normRef.toLowerCase()) {
        genreEarned = this.weights.genre
        genreMatched = true
        matchedFields.push('genre')
      } else {
        // Partial category relation check (e.g., both contain Technology or Fiction)
        const targetTokens = SimilarityEngine.tokenizeText(normTarget)
        const refTokens = SimilarityEngine.tokenizeText(normRef)
        const overlap = SimilarityEngine.calculateJaccard(targetTokens, refTokens)
        if (overlap > 0) {
          genreEarned = this.weights.genre * overlap * 0.5
          matchedFields.push('related genre')
        }
      }
      earnedWeight += genreEarned
    } else {
      unavailableFields.push('genre')
    }

    // 2. LANGUAGE (Weight: 20)
    let langEarned = 0
    let langMatched = false
    if (target.language && reference.language) {
      totalAvailableWeight += this.weights.language
      const normTarget = MetadataNormalizer.normalizeLanguage(target.language)
      const normRef = MetadataNormalizer.normalizeLanguage(reference.language)

      if (normTarget.toLowerCase() === normRef.toLowerCase()) {
        langEarned = this.weights.language
        langMatched = true
        matchedFields.push('language')
      }
      earnedWeight += langEarned
    } else {
      unavailableFields.push('language')
    }

    // 3. SUBJECTS (Weight: 30) - Jaccard similarity
    let subjectEarned = 0
    let jaccardScore = 0
    const normTargetSubjects = MetadataNormalizer.normalizeSubjects(target.subjects)
    const normRefSubjects = MetadataNormalizer.normalizeSubjects(reference.subjects)

    if (normTargetSubjects.length > 0 && normRefSubjects.length > 0) {
      totalAvailableWeight += this.weights.subjects
      const setA = new Set(normTargetSubjects.map((s) => s.toLowerCase()))
      const setB = new Set(normRefSubjects.map((s) => s.toLowerCase()))
      jaccardScore = SimilarityEngine.calculateJaccard(setA, setB)

      subjectEarned = this.weights.subjects * jaccardScore
      earnedWeight += subjectEarned
      if (jaccardScore > 0.1) {
        matchedFields.push('subjects')
      }
    } else {
      // Missing subjects: omit from weight denominator so score is not penalized
      unavailableFields.push('subjects')
    }

    // 4. FORMAT (Weight: 10)
    let formatEarned = 0
    let formatMatched = false
    if (target.format && reference.format) {
      totalAvailableWeight += this.weights.format
      const normTarget = MetadataNormalizer.normalizeFormat(target.format)
      const normRef = MetadataNormalizer.normalizeFormat(reference.format)

      if (normTarget.toLowerCase() === normRef.toLowerCase()) {
        formatEarned = this.weights.format
        formatMatched = true
        matchedFields.push('format')
      }
      earnedWeight += formatEarned
    } else {
      unavailableFields.push('format')
    }

    // 5. TITLE / DESCRIPTION TEXT RELEVANCE (Weight: 5)
    let textEarned = 0
    let textSimilarity = 0
    const targetText = `${target.title || target.bookName || ''} ${target.description || target.notes || ''}`
    const refText = `${reference.title || reference.bookName || ''} ${reference.description || reference.notes || ''}`

    const targetTokens = SimilarityEngine.tokenizeText(targetText)
    const refTokens = SimilarityEngine.tokenizeText(refText)

    if (targetTokens.size > 0 && refTokens.size > 0) {
      totalAvailableWeight += this.weights.text
      textSimilarity = SimilarityEngine.calculateJaccard(targetTokens, refTokens)
      textEarned = this.weights.text * textSimilarity
      earnedWeight += textEarned
      if (textSimilarity > 0.15) {
        matchedFields.push('title/description relevance')
      }
    } else {
      unavailableFields.push('text')
    }

    // Calculate final normalized score (0 - 100)
    const finalScore =
      totalAvailableWeight > 0
        ? Math.round((earnedWeight / totalAvailableWeight) * 100)
        : 0

    return {
      score: Math.min(100, Math.max(0, finalScore)),
      matchedFields,
      unavailableFields,
      details: {
        genre: { earned: genreEarned, max: this.weights.genre, matched: genreMatched },
        language: { earned: langEarned, max: this.weights.language, matched: langMatched },
        subjects: { earned: subjectEarned, max: this.weights.subjects, jaccard: jaccardScore },
        format: { earned: formatEarned, max: this.weights.format, matched: formatMatched },
        text: { earned: textEarned, max: this.weights.text, similarity: textSimilarity },
      },
    }
  }

  /**
   * Find top matching books ranked by similarity score
   */
  findTopMatches(
    target: BookComparisonData,
    candidateBooks: Array<{
      _id?: unknown
      id?: string
      bookName?: string
      name?: string
      category?: string
      language?: string
      subjects?: string[]
      format?: string
      description?: string
      notes?: string
      shelf?: string
    }>,
    limit: number = 10
  ): Array<{
    bookId: string
    title: string
    category: string
    language: string
    shelf: string
    score: number
    matchedFields: string[]
    unavailableFields: string[]
  }> {
    const scored = candidateBooks
      .map((ref) => {
        const title = ref.bookName || ref.name || 'Untitled'
        const comparison = this.compare(target, {
          title,
          bookName: title,
          category: ref.category,
          language: ref.language,
          subjects: ref.subjects,
          format: ref.format,
          description: ref.description,
          notes: ref.notes,
        })

        return {
          bookId: String(ref._id || ref.id || ''),
          title,
          category: ref.category || 'General',
          language: ref.language || 'English',
          shelf: String(ref.shelf || '').trim(),
          score: comparison.score,
          matchedFields: comparison.matchedFields,
          unavailableFields: comparison.unavailableFields,
        }
      })
      .filter((b) => Boolean(b.shelf))
      .sort((a, b) => b.score - a.score)

    return scored.slice(0, limit)
  }

  /**
   * Aggregate similar books by shelf and compute shelf recommendation ranking
   */
  groupShelvesByScore(
    topMatches: Array<{
      title: string
      shelf: string
      score: number
      category: string
      matchedFields: string[]
    }>
  ): Array<{
    shelfCode: string
    score: number
    matchedBooksCount: number
    reasons: string[]
    topBooks: { title: string; score: number }[]
  }> {
    const shelfMap = new Map<
      string,
      {
        scores: number[]
        books: { title: string; score: number }[]
        categories: Set<string>
        commonFields: Set<string>
      }
    >()

    for (const match of topMatches) {
      if (!match.shelf) continue
      const shelf = match.shelf.toUpperCase().trim()
      if (!shelfMap.has(shelf)) {
        shelfMap.set(shelf, {
          scores: [],
          books: [],
          categories: new Set(),
          commonFields: new Set(),
        })
      }
      const entry = shelfMap.get(shelf)!
      entry.scores.push(match.score)
      entry.books.push({ title: match.title, score: match.score })
      if (match.category) entry.categories.add(match.category)
      for (const field of match.matchedFields) {
        entry.commonFields.add(field)
      }
    }

    const aggregated: Array<{
      shelfCode: string
      score: number
      matchedBooksCount: number
      reasons: string[]
      topBooks: { title: string; score: number }[]
    }> = []

    for (const [shelfCode, data] of shelfMap.entries()) {
      if (data.scores.length === 0) continue

      // Aggregation formula: primary match gets 70% weight, remaining average gets 30%
      const maxScore = Math.max(...data.scores)
      const avgScore = data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length
      const multiBookBonus = Math.min(10, (data.scores.length - 1) * 3) // up to +10 bonus for dense clusters
      const finalScore = Math.min(100, Math.round(maxScore * 0.75 + avgScore * 0.25 + multiBookBonus))

      // Build explainable reasons
      const reasons: string[] = []
      reasons.push(
        `Holds ${data.books.length} similar title${data.books.length > 1 ? 's' : ''} including "${data.books[0].title}" (${data.books[0].score}% match)`
      )

      if (data.categories.size > 0) {
        reasons.push(`Contains books in category: ${Array.from(data.categories).join(', ')}`)
      }

      if (data.commonFields.size > 0) {
        reasons.push(`Strong overlap in: ${Array.from(data.commonFields).join(', ')}`)
      }

      aggregated.push({
        shelfCode,
        score: finalScore,
        matchedBooksCount: data.books.length,
        reasons,
        topBooks: data.books.slice(0, 3),
      })
    }

    return aggregated.sort((a, b) => b.score - a.score)
  }
}

export const similarityEngine = new SimilarityEngine()
