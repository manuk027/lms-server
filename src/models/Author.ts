import { Document, Model, Schema, model } from 'mongoose'
import { AuthorValidators } from '../validators'

export interface IAuthor extends Document {
  name: string
  age?: number
  category?: string
  gender?: string
  createdAt: Date
  updatedAt: Date
}

const authorSchema = new Schema<IAuthor>(
  {
    name: {
      type: String,
      required: [true, 'Author name is required'],
      trim: true,
      index: true,
      validate: AuthorValidators.nameValidator,
    },
    age: {
      type: Number,
      validate: AuthorValidators.ageValidator,
    },
    category: {
      type: String,
      trim: true,
      default: '',
    },
    gender: {
      type: String,
      trim: true,
      default: 'Not specified',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

export const Author: Model<IAuthor> = model<IAuthor>('Author', authorSchema)
