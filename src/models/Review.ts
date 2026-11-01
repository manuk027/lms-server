import { Document, Model, Schema, Types, model } from 'mongoose'
import { ALLOWED_READING_STATUSES, ValidReadingStatus } from '../validators'

export interface IReview extends Document {
  user: Types.ObjectId
  book: Types.ObjectId
  history?: Types.ObjectId
  rating: number
  review?: string
  readingStatus: ValidReadingStatus
  createdAt: Date
  updatedAt: Date
}

const reviewSchema = new Schema<IReview>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    book: {
      type: Schema.Types.ObjectId,
      ref: 'Book',
      required: [true, 'Book reference is required'],
      index: true,
    },
    history: {
      type: Schema.Types.ObjectId,
      ref: 'History',
      index: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating (1-5) is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
      index: true,
    },
    review: {
      type: String,
      trim: true,
      maxlength: [2000, 'Review cannot exceed 2000 characters'],
    },
    readingStatus: {
      type: String,
      enum: {
        values: ALLOWED_READING_STATUSES,
        message: '{VALUE} is not a valid reading status',
      },
      default: 'completed',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// Index reviews by book for fast aggregation of average ratings
reviewSchema.index({ book: 1, createdAt: -1 })
reviewSchema.index({ user: 1, book: 1 })

export const Review: Model<IReview> = model<IReview>('Review', reviewSchema)

