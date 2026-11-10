import { Document, Model, Schema, model } from 'mongoose'
import { UserValidators } from '../validators'

export interface IUser extends Document {
  fullName: string
  phoneNo?: string
  email?: string
  googleId?: string
  avatar?: string
  status: 'waiting' | 'approved' | 'rejected'
  feesStatus: 'paid' | 'unpaid'
  feesPaidAt?: Date | null
  feesExpiresAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<IUser>(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      validate: UserValidators.fullNameValidator,
    },
    phoneNo: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      validate: UserValidators.phoneValidator,
    },
    email: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      validate: UserValidators.emailValidator,
    },
    googleId: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
    },
    avatar: {
      type: String,
      trim: true,
      required: false,
    },
    status: {
      type: String,
      enum: ['waiting', 'approved', 'rejected'],
      default: 'waiting',
      index: true,
    },
    feesStatus: {
      type: String,
      enum: ['paid', 'unpaid'],
      default: 'unpaid',
      index: true,
    },
    feesPaidAt: {
      type: Date,
      default: null,
    },
    feesExpiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

export const User: Model<IUser> = model<IUser>('User', userSchema)
