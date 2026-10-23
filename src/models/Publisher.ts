import { Document, Model, Schema, model } from 'mongoose'
import { PublisherValidators } from '../validators'

export interface IPublisher extends Document {
  name: string
  createdAt: Date
  updatedAt: Date
}

const publisherSchema = new Schema<IPublisher>(
  {
    name: {
      type: String,
      required: [true, 'Publisher name is required'],
      unique: true,
      trim: true,
      validate: PublisherValidators.nameValidator,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

export const Publisher: Model<IPublisher> = model<IPublisher>('Publisher', publisherSchema)
