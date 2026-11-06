import { Book, IRecommendationHistory, IShelf, RecommendationHistory } from '../models'
import { GeminiClassificationResult, GeminiService } from './gemini.service'
import { MetadataNormalizer } from './metadata.normalizer'
import { ShelfService } from './shelf.service'
import { similarityEngine } from './similarity.engine'

export interface ShelfRecommendation {
  shelfCode: string
  shelfName: string
  score: number
  confidence: 'high' | 'medium' | 'low'
  reasons: string[]
  matchedBooksCount: number
  currentOccupancy: number
  maxCapacity: number
  isCapacityFull: boolean
  location?: string
  method: 'similarity' | 'similarity+gemini' | 'policy'
}

export interface RecommendationResult {
  recommendations: ShelfRecommendation[]
  usedGemini: boolean
  geminiClassification?: {
    genre?: string
    subjects?: string[]
    explanation?: string
    confidence?: string
  }
  normalizedMetadata: {
    category: string
    language: string
    format: string
    subjects: string[]
  }
  topSimilarBooks: Array<{
    title: string
    category: string
    shelf: string
    score: number
    matchedFields: string[]
  }>
  historyId?: string
}

export class RecommendationService {
  /**
   * Recommend most suitable shelves for a book using hybrid similarity + Gemini fallback
   */
  static async recommendShelf(
    candidate: {
      name?: string
      bookName?: string
      authorName?: string
      authors?: string[] | string
      publisher?: string
      publication?: string
      category?: string
      language?: string
      subjects?: string[] | string
      format?: string
      description?: string
      notes?: string
      isbn?: string
      noOfPages?: number | string
      noOfCopies?: number | string
    },
    excludeBookId?: string
  ): Promise<RecommendationResult> {
    // 1. Ensure shelves are synchronized
    await ShelfService.syncShelves()

    const rawTitle = candidate.name || candidate.bookName || 'Untitled Book'
    let normCategory = MetadataNormalizer.normalizeGenre(candidate.category)
    let normLanguage = MetadataNormalizer.normalizeLanguage(candidate.language)
    let normFormat = MetadataNormalizer.normalizeFormat(candidate.format)
    let normSubjects = MetadataNormalizer.normalizeSubjects(candidate.subjects)

    // 2. Query verified reference books from library database
    const query: Record<string, unknown> = {
      verified: { $ne: false },
      shelf: { $exists: true, $ne: '' },
    }
    if (excludeBookId) {
      query._id = { $ne: excludeBookId }
    }

    const verifiedBooks = await Book.find(query)
      .select('bookName category language subjects format shelf description notes')
      .lean()

    // 3. Perform primary JavaScript-based content similarity matching
    let targetComparison = {
      title: rawTitle,
      bookName: rawTitle,
      category: normCategory,
      language: normLanguage,
      subjects: normSubjects,
      format: normFormat,
      description: candidate.description || candidate.notes || '',
    }

    let topMatches = similarityEngine.findTopMatches(targetComparison, verifiedBooks, 10)
    const topScore = topMatches.length > 0 ? topMatches[0].score : 0

    // 4. Determine if Gemini AI fallback is required:
    //    Trigger if top score < 45 (weak similarity evidence) OR metadata is incomplete/ambiguous
    let usedGemini = false
    let geminiResult: GeminiClassificationResult | null = null

    const isMetadataWeak =
      (!candidate.category || candidate.category === 'General') &&
      normSubjects.length === 0

    const isEvidenceInsufficient = topScore < 45

    if (isEvidenceInsufficient || isMetadataWeak) {
      try {
        geminiResult = await GeminiService.classifyBook({
          name: rawTitle,
          authorName: Array.isArray(candidate.authors)
            ? candidate.authors.join(', ')
            : candidate.authorName || (typeof candidate.authors === 'string' ? candidate.authors : ''),
          publisher: candidate.publisher || candidate.publication,
          category: candidate.category,
          language: candidate.language,
          description: candidate.description || candidate.notes,
          isbn: candidate.isbn,
        })

        if (geminiResult && geminiResult.usedGemini) {
          usedGemini = true
          // If candidate category was uninformative, adopt Gemini classification
          if (!candidate.category || candidate.category === 'General' || candidate.category === 'Unknown') {
            normCategory = geminiResult.category
          }
          // Enrich subjects with Gemini keywords
          if (geminiResult.subjects.length > 0) {
            normSubjects = Array.from(new Set([...normSubjects, ...geminiResult.subjects]))
          }

          // Re-run similarity matching with enriched AI metadata
          targetComparison = {
            ...targetComparison,
            category: normCategory,
            subjects: normSubjects,
          }
          topMatches = similarityEngine.findTopMatches(targetComparison, verifiedBooks, 10)
        }
      } catch (geminiErr) {
        console.warn('[RecommendationService] Gemini fallback error:', geminiErr)
      }
    }

    // 5. Aggregate similar books by shelf
    const shelfAggregations = similarityEngine.groupShelvesByScore(topMatches)
    const shelfScoreMap = new Map(shelfAggregations.map((a) => [a.shelfCode, a]))

    // 6. Retrieve all active shelves and evaluate capacity & policies
    const allShelves = await ShelfService.getAllShelves(true)
    const candidatesScored: ShelfRecommendation[] = []

    for (const shelf of allShelves) {
      const eligibility = ShelfService.validateShelfEligibility(shelf, {
        category: normCategory,
        language: normLanguage,
        format: normFormat,
        noOfCopies: Number(candidate.noOfCopies) || 1,
      })

      const isCapacityFull = shelf.currentOccupancy >= shelf.maxCapacity

      const aggregation = shelfScoreMap.get(shelf.shelfCode)
      let finalScore = 0
      const reasons: string[] = []
      let method: 'similarity' | 'similarity+gemini' | 'policy' = 'similarity'

      if (aggregation) {
        // Inherit similarity score from similar books
        finalScore = aggregation.score
        reasons.push(...aggregation.reasons)
        method = usedGemini ? 'similarity+gemini' : 'similarity'
      } else {
        // Calculate policy/thematic baseline score
        let policyScore = 15 // baseline
        if (shelf.allowedGenres && shelf.allowedGenres.length > 0) {
          const normAllowed = shelf.allowedGenres.map((g) => MetadataNormalizer.normalizeGenre(g))
          if (normAllowed.includes(normCategory)) {
            policyScore += 45
            reasons.push(`Shelf designated for category "${normCategory}"`)
          }
        } else {
          policyScore += 20
          reasons.push('General-purpose flexible shelf')
        }

        if (shelf.allowedLanguages && shelf.allowedLanguages.length > 0) {
          if (shelf.allowedLanguages.includes(normLanguage)) {
            policyScore += 20
            reasons.push(`Designated for language "${normLanguage}"`)
          }
        } else {
          // Unrestricted shelf accepts all languages
          policyScore += 15
        }

        finalScore = Math.min(85, policyScore)
        method = 'policy'
      }

      if (usedGemini && geminiResult?.explanation) {
        reasons.push(`AI Analysis: ${geminiResult.explanation}`)
      }

      // If shelf failed eligibility rules (other than capacity), penalize score heavily
      if (!eligibility.isEligible && !isCapacityFull) {
        finalScore = Math.max(5, finalScore - 40)
        if (eligibility.rejectionReason) {
          reasons.push(`Policy note: ${eligibility.rejectionReason}`)
        }
      }

      // If capacity is full, flag it
      if (isCapacityFull) {
        reasons.push(`⚠️ Shelf is currently at maximum capacity (${shelf.currentOccupancy}/${shelf.maxCapacity})`)
      }

      // Determine confidence level
      const confidence: 'high' | 'medium' | 'low' =
        finalScore >= 70 ? 'high' : finalScore >= 45 ? 'medium' : 'low'

      candidatesScored.push({
        shelfCode: shelf.shelfCode,
        shelfName: shelf.shelfName || `Shelf ${shelf.shelfCode}`,
        score: finalScore,
        confidence,
        reasons,
        matchedBooksCount: aggregation ? aggregation.matchedBooksCount : 0,
        currentOccupancy: shelf.currentOccupancy,
        maxCapacity: shelf.maxCapacity,
        isCapacityFull,
        location: shelf.location,
        method,
      })
    }

    // Sort: Available shelves first, then by score descending
    candidatesScored.sort((a, b) => {
      if (a.isCapacityFull !== b.isCapacityFull) {
        return a.isCapacityFull ? 1 : -1
      }
      return b.score - a.score
    })

    const topRecommendations = candidatesScored.slice(0, 4)

    // 7. Store recommendation in history for feedback tracking
    let historyRecord: IRecommendationHistory | null = null
    try {
      historyRecord = await RecommendationHistory.create({
        bookMetadata: {
          isbn: candidate.isbn || '',
          title: rawTitle,
          authors: Array.isArray(candidate.authors)
            ? candidate.authors
            : candidate.authorName
            ? [candidate.authorName]
            : [],
          publisher: candidate.publisher || candidate.publication || '',
          category: normCategory,
          language: normLanguage,
          subjects: normSubjects,
          format: normFormat,
          description: candidate.description || candidate.notes || '',
        },
        recommendations: topRecommendations.map((r) => ({
          shelfCode: r.shelfCode,
          shelfName: r.shelfName,
          location: r.location || '',
          score: r.score,
          reasons: r.reasons,
          matchedBooksCount: r.matchedBooksCount,
          method: r.method === 'similarity+gemini' ? 'similarity+gemini' : 'similarity',
        })),
        selectedShelf: topRecommendations[0]?.shelfCode || '',
        acceptedRecommendation: false,
        geminiUsed: usedGemini,
        geminiClassification: geminiResult
          ? {
              genre: geminiResult.category,
              subjects: geminiResult.subjects,
              explanation: geminiResult.explanation,
            }
          : undefined,
        timestamp: new Date(),
      })
    } catch (historyErr) {
      console.warn('[RecommendationService] Could not record recommendation history:', historyErr)
    }

    return {
      recommendations: topRecommendations,
      usedGemini,
      geminiClassification: geminiResult
        ? {
            genre: geminiResult.category,
            subjects: geminiResult.subjects,
            explanation: geminiResult.explanation,
            confidence: geminiResult.confidence,
          }
        : undefined,
      normalizedMetadata: {
        category: normCategory,
        language: normLanguage,
        format: normFormat,
        subjects: normSubjects,
      },
      topSimilarBooks: topMatches.slice(0, 5).map((m) => ({
        title: m.title,
        category: m.category,
        shelf: m.shelf,
        score: m.score,
        matchedFields: m.matchedFields,
      })),
      historyId: historyRecord ? String(historyRecord._id) : undefined,
    }
  }

  /**
   * Record librarian feedback / confirmation of selected shelf
   */
  static async recordFeedback(input: {
    historyId?: string
    selectedShelf: string
    acceptedRecommendation: boolean
    feedback?: string
  }): Promise<void> {
    if (!input.historyId) return
    try {
      await RecommendationHistory.findByIdAndUpdate(input.historyId, {
        selectedShelf: input.selectedShelf,
        acceptedRecommendation: input.acceptedRecommendation,
        feedback: input.feedback || '',
      })
    } catch (err) {
      console.warn('[RecommendationService] Failed to record feedback:', err)
    }
  }

  /**
   * Retrieve recommendation history records for admin analytics
   */
  static async getHistory(limit = 50) {
    return RecommendationHistory.find().sort({ timestamp: -1 }).limit(limit).lean()
  }
}
