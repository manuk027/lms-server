import { Document, Model, Schema, Types, model } from 'mongoose'
import {
  ALLOWED_EXTENSION_STATUSES,
  ALLOWED_LOAN_STATUSES,
  ALLOWED_READING_STATUSES,
  HistoryValidators,
  ValidExtensionStatus,
  ValidLoanStatus,
  ValidReadingStatus,
} from '../validators'

export type LoanStatus = ValidLoanStatus
export type ExtensionStatus = ValidExtensionStatus
export type ReadingStatus = ValidReadingStatus

export interface IHistory extends Document {
  user: Types.ObjectId
  book: Types.ObjectId
  borrowedAt: Date
  dueDate?: Date
  returnedAt?: Date | null
  status: LoanStatus
  remarks?: string
  // Extension Request fields
  extensionStatus: ExtensionStatus
  extensionRequestedAt?: Date
  extensionApprovedAt?: Date
  extensionDays?: number
  extensionReason?: string
  // Return, Review & Reading Status fields
  readingStatus?: ReadingStatus
  rating?: number
  review?: string
  reviewedAt?: Date
  adminRemarks?: string
  createdAt: Date
  updatedAt: Date
}

const historySchema = new Schema<IHistory>(
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
    borrowedAt: {
      type: Date,
      default: Date.now,
      required: [true, 'Borrow date is required'],
      index: true,
    },
    dueDate: {
      type: Date,
      index: true,
    },
    returnedAt: {
      type: Date,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ALLOWED_LOAN_STATUSES,
        message: '{VALUE} is not a valid loan status',
      },
      default: 'borrow_pending',
      index: true,
      validate: HistoryValidators.statusValidator,
    },
    remarks: {
      type: String,
      trim: true,
    },
    // Loan Extension
    extensionStatus: {
      type: String,
      enum: {
        values: ALLOWED_EXTENSION_STATUSES,
        message: '{VALUE} is not a valid extension status',
      },
      default: 'none',
      index: true,
    },
    extensionRequestedAt: {
      type: Date,
    },
    extensionApprovedAt: {
      type: Date,
    },
    extensionDays: {
      type: Number,
      default: 7,
    },
    extensionReason: {
      type: String,
      trim: true,
    },
    // Reading status and review
    readingStatus: {
      type: String,
      enum: {
        values: ALLOWED_READING_STATUSES,
        message: '{VALUE} is not a valid reading status',
      },
      index: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      trim: true,
    },
    reviewedAt: {
      type: Date,
    },
    adminRemarks: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// Compound indexes
historySchema.index({ user: 1, borrowedAt: -1 })
historySchema.index({ book: 1, borrowedAt: -1 })
historySchema.index({ user: 1, status: 1 })
historySchema.index({ book: 1, status: 1 })
historySchema.index({ extensionStatus: 1, createdAt: -1 })

export const History: Model<IHistory> = model<IHistory>('History', historySchema)
