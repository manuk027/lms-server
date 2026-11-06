import { Document, Model, Schema, model } from 'mongoose'

export interface IShelf extends Document {
  shelfCode: string
  shelfName: string
  allowedGenres: string[]
  allowedLanguages: string[]
  allowedFormats: string[]
  maxCapacity: number
  currentOccupancy: number
  isActive: boolean
  location: string
  notes?: string
  createdAt: Date
  updatedAt: Date
}

const shelfSchema = new Schema<IShelf>(
  {
    shelfCode: {
      type: String,
      required: [true, 'Shelf code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    shelfName: {
      type: String,
      required: [true, 'Shelf name is required'],
      trim: true,
    },
    allowedGenres: {
      type: [String],
      default: [],
    },
    allowedLanguages: {
      type: [String],
      default: [],
    },
    allowedFormats: {
      type: [String],
      default: [],
    },
    maxCapacity: {
      type: Number,
      required: [true, 'Maximum capacity is required'],
      default: 50,
      min: [1, 'Capacity must be at least 1'],
    },
    currentOccupancy: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    location: {
      type: String,
      default: 'Main Floor',
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

export const Shelf: Model<IShelf> = model<IShelf>('Shelf', shelfSchema)

