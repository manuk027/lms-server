import { Document, Model, Schema, model } from 'mongoose'
import { AdminValidators } from '../validators'

export interface IAdmin extends Document {
  username: string
  password: string
  fullName: string
  email?: string
  role: 'admin' | 'superadmin'
  lastLogin?: Date
  createdAt: Date
  updatedAt: Date
}

const adminSchema = new Schema<IAdmin>(
  {
    username: {
      type: String,
      required: [true, 'Admin username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: AdminValidators.usernameValidator,
    },
    password: {
      type: String,
      required: [true, 'Admin password is required'],
    },
    fullName: {
      type: String,
      default: 'System Administrator',
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: '',
    },
    role: {
      type: String,
      enum: ['admin', 'superadmin'],
      default: 'admin',
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.password
        return ret
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.password
        return ret
      },
    },
  }
)

export const Admin: Model<IAdmin> = model<IAdmin>('Admin', adminSchema)
