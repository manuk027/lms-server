import { Document, Model, Schema, Types, model } from 'mongoose'
import { ALLOWED_LOAN_STATUSES, HistoryValidators, ValidLoanStatus, } from '../validators'

export type LoanStatus = ValidLoanStatus

export interface IHistory extends Document {
  user: Types.ObjectId
  book: Types.ObjectId
  borrowedAt: Date
  dueDate?: Date
  returnedAt?: Date | null
  status: LoanStatus
  remarks?: string
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
      default: 'borrowed',
      index: true,
      validate: HistoryValidators.statusValidator,
    },
    remarks: {
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

// Compound indexes for optimal querying of:
// 1. A user's complete borrowing history sorted by most recent
historySchema.index({ user: 1, borrowedAt: -1 })

// 2. A book's complete circulation history (who borrowed it and when) sorted by most recent
historySchema.index({ book: 1, borrowedAt: -1 })

// 3. Active unreturned books by user
historySchema.index({ user: 1, status: 1 })

// 4. Currently borrowed books
historySchema.index({ book: 1, status: 1 })

export const History: Model<IHistory> = model<IHistory>('History', historySchema)

