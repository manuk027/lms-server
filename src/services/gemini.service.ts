import { GoogleGenAI } from '@google/genai'
import { MetadataNormalizer } from './metadata.normalizer'

export interface GeminiClassificationResult {
  category: string
  subjects: string[]
  confidence: 'high' | 'medium' | 'low'
  explanation: string
  usedGemini: boolean
  rawResponse?: string
}

export class GeminiService {
  private static aiClient: GoogleGenAI | null = null

  /**
   * Lazily initialize GoogleGenAI client with GEMINI_API_KEY from environment
   */
  private static getClient(): GoogleGenAI | null {
    if (!this.aiClient) {
      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) {
        console.warn('⚠️ [GeminiService] GEMINI_API_KEY not configured in environment')
        return null
      }
      this.aiClient = new GoogleGenAI({ apiKey })
    }
    return this.aiClient
  }

  /**
   * Classify book metadata using Google Gemini API as intelligent fallback
   */
  static async classifyBook(book: {
    name?: string
    bookName?: string
    authorName?: string
    publisher?: string
    publication?: string
    description?: string
    category?: string
    language?: string
    isbn?: string
  }): Promise<GeminiClassificationResult> {
    const title = book.name || book.bookName || 'Unknown Title'
    const author = book.authorName || 'Unknown Author'
    const description = book.description || ''
    const approvedCategories = MetadataNormalizer.getAllApprovedCategories()

    const fallbackResult: GeminiClassificationResult = {
      category: MetadataNormalizer.normalizeGenre(book.category || 'General Literature'),
      subjects: MetadataNormalizer.normalizeSubjects(description.slice(0, 50)),
      confidence: 'low',
      explanation: 'Default rule-based classification (Gemini fallback unavailable)',
      usedGemini: false,
    }

    const client = this.getClient()
    if (!client) {
      return fallbackResult
    }

    const prompt = `You are an expert librarian and library categorization assistant.
Analyze the following book and classify its primary category and subject keywords.

Book Details:
- Title: "${title}"
- Author(s): "${author}"
- Publisher: "${book.publisher || book.publication || 'Unknown'}"
- Current Category Hint: "${book.category || 'Unknown'}"
- Description/Summary: "${description.slice(0, 1000)}"

Instructions:
1. Select the single most fitting category from this strict approved list:
${approvedCategories.map((c) => `- "${c}"`).join('\n')}

2. Provide 3 to 6 normalized subject tags (lowercase, descriptive topic tags like "machine-learning", "world-war-2", "investing").
3. Determine your confidence ("high", "medium", or "low").
4. Provide a concise 1-2 sentence explanation of why this category and subjects fit this book.

Respond ONLY with a valid JSON object matching this schema:
{
  "category": "string from the approved list",
  "subjects": ["string"],
  "confidence": "high" | "medium" | "low",
  "explanation": "string"
}`

    // Models ordered by priority
    const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
    const modelsToTry = [primaryModel, 'gemini-3.5-flash-lite', 'gemini-3.8-flash']
    const uniqueModels = Array.from(new Set(modelsToTry))

    for (const model of uniqueModels) {
      try {
        const response = await client.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        })

        const text = response.text?.trim()
        if (!text) continue

        // Parse JSON output
        const parsed = JSON.parse(text)
        const normalizedCategory = MetadataNormalizer.normalizeGenre(parsed.category)
        const normalizedSubjects = MetadataNormalizer.normalizeSubjects(parsed.subjects || [])

        return {
          category: normalizedCategory,
          subjects: normalizedSubjects,
          confidence: (['high', 'medium', 'low'].includes(parsed.confidence)
            ? parsed.confidence
            : 'medium') as 'high' | 'medium' | 'low',
          explanation: parsed.explanation || `Classified as ${normalizedCategory} based on title and subject analysis.`,
          usedGemini: true,
          rawResponse: text,
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[GeminiService] Model ${model} request failed:`, msg)
        // Continue to next fallback model
      }
    }

    return fallbackResult
  }
}

