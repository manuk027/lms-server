import { Document, Model, Schema, Types, model } from 'mongoose'

export interface INotification extends Document {
  title: string
  message: string
  type: 'user_registration' | 'system' | 'general'
  recipient: string
  read: boolean
  link?: string
  userId?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const notificationSchema = new Schema<INotification>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['user_registration', 'system', 'general'],
      default: 'user_registration',
    },
    recipient: {
      type: String,
      default: 'admin',
      index: true,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    link: {
      type: String,
      default: '/admin/requests',
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      sparse: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

export const Notification: Model<INotification> = model<INotification>(
  'Notification',
  notificationSchema
)

