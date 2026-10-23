import { Document, Model, Schema, model } from 'mongoose'
import { UserValidators } from '../validators'

export interface IUser extends Document {
  fullName: string
  phoneNo?: string
  email: string
  googleId?: string
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
      required: [true, 'Email is required'],
      unique: true,
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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

export const User: Model<IUser> = model<IUser>('User', userSchema)
