import { Document, Model, Schema, Types, model } from 'mongoose'
import { BookValidators } from '../validators'

export interface IBook extends Document {
  bookName: string
  publisher: Types.ObjectId
  authors: Types.ObjectId[]
  shelf: string
  category: string
  bookCode: string
  noOfPages: number
  available: boolean
  language: string
  createdAt: Date
  updatedAt: Date
}

const bookSchema = new Schema<IBook>(
  {
    bookName: {
      type: String,
      required: [true, 'Book name is required'],
      trim: true,
      index: true,
    },
    publisher: {
      type: Schema.Types.ObjectId,
      ref: 'Publisher',
      required: [true, 'Publisher reference is required'],
      index: true,
    },
    authors: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: 'Author',
          required: [true, 'Author reference is required'],
        },
      ],
      validate: BookValidators.authorsValidator,
    },
    shelf: {
      type: String,
      required: [true, 'Shelf location is required'],
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      index: true,
    },
    bookCode: {
      type: String,
      required: [true, 'Book code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
      validate: BookValidators.bookCodeValidator,
    },
    noOfPages: {
      type: Number,
      required: [true, 'Number of pages is required'],
      validate: BookValidators.pageCountValidator,
    },
    available: {
      type: Boolean,
      default: true,
      index: true,
    },
    language: {
      type: String,
      required: [true, 'Language is required'],
      default: 'English',
      trim: true,
      index: true,
      validate: BookValidators.languageValidator,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

export const Book: Model<IBook> = model<IBook>('Book', bookSchema)

