import { Document, Model, Schema, model } from 'mongoose'

export interface IRecommendationHistory extends Document {
  bookMetadata: {
    isbn?: string
    title: string
    authors?: string[]
    publisher?: string
    category?: string
    language?: string
    subjects?: string[]
    format?: string
    description?: string
  }
  recommendations: Array<{
    shelfCode: string
    shelfName: string
    location?: string
    score: number
    reasons: string[]
    matchedBooksCount: number
    method: 'similarity' | 'similarity+gemini' | 'manual-review'
  }>
  selectedShelf: string
  acceptedRecommendation: boolean
  geminiUsed: boolean
  geminiClassification?: {
    genre?: string
    subjects?: string[]
    needsReview?: boolean
    explanation?: string
  }
  feedback?: string
  timestamp: Date
  createdAt: Date
  updatedAt: Date
}

const recommendationHistorySchema = new Schema<IRecommendationHistory>(
  {
    bookMetadata: {
      isbn: { type: String, default: '' },
      title: { type: String, required: true },
      authors: { type: [String], default: [] },
      publisher: { type: String, default: '' },
      category: { type: String, default: '' },
      language: { type: String, default: '' },
      subjects: { type: [String], default: [] },
      format: { type: String, default: '' },
      description: { type: String, default: '' },
    },
    recommendations: [
      {
        shelfCode: { type: String, required: true },
        shelfName: { type: String, default: '' },
        location: { type: String, default: '' },
        score: { type: Number, required: true },
        reasons: { type: [String], default: [] },
        matchedBooksCount: { type: Number, default: 0 },
        method: {
          type: String,
          enum: ['similarity', 'similarity+gemini', 'manual-review'],
          default: 'similarity',
        },
      },
    ],
    selectedShelf: {
      type: String,
      default: '',
      trim: true,
    },
    acceptedRecommendation: {
      type: Boolean,
      default: false,
    },
    geminiUsed: {
      type: Boolean,
      default: false,
    },
    geminiClassification: {
      genre: { type: String },
      subjects: { type: [String] },
      needsReview: { type: Boolean },
      explanation: { type: String },
    },
    feedback: {
      type: String,
      trim: true,
      default: '',
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

export const RecommendationHistory: Model<IRecommendationHistory> =
  model<IRecommendationHistory>('RecommendationHistory', recommendationHistorySchema)
