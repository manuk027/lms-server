import { Notification } from '../models/Notification'
import { IUser, User } from '../models/User'
import { FirebaseService } from './firebase.service'
import { TokenService } from './token.service'

export interface IAuthResult {
  user: {
    id: string
    fullName: string
    email: string
    phoneNo?: string
    googleId?: string
    avatar?: string
    status: 'waiting' | 'approved' | 'rejected'
  }
  accessToken: string
  refreshToken: string
}

export class AuthService {
  /**
   * Registers or authenticates a user using a Firebase Google ID token
   */
  static async authenticateWithGoogle(
    idToken: string,
    clientData?: { fullName?: string; phoneNo?: string }
  ): Promise<IAuthResult> {
    const firebaseUser = await FirebaseService.verifyIdToken(idToken)

    let user: IUser | null = await User.findOne({
      $or: [{ googleId: firebaseUser.uid }, { email: firebaseUser.email.toLowerCase() }],
    })

    if (!user) {
      // Create new user (Registration) - set into waiting list by default
      user = new User({
        fullName: clientData?.fullName?.trim() || firebaseUser.name || 'Library User',
        email: firebaseUser.email.toLowerCase(),
        googleId: firebaseUser.uid,
        avatar: firebaseUser.picture,
        status: 'waiting',
        ...(clientData?.phoneNo ? { phoneNo: clientData.phoneNo.trim() } : {}),
      })
      await user.save()
      console.info(`Registered new user via Google Auth: ${user.email} (${user._id}) [Status: waiting]`)

      // Create admin notification
      try {
        await Notification.create({
          title: 'New User Registration Request',
          message: `${user.fullName} (${user.email}) registered and is waiting for approval.`,
          type: 'user_registration',
          recipient: 'admin',
          read: false,
          link: '/admin/requests',
          userId: user._id,
        })
      } catch (notifErr) {
        console.error('Failed to create admin notification for new user:', notifErr)
      }
    } else {
      // Existing user: ensure googleId is linked if it wasn't
      let hasUpdates = false

      if (!user.googleId) {
        user.googleId = firebaseUser.uid
        hasUpdates = true
      }

      // Update avatar if available and changed
      if (firebaseUser.picture && user.avatar !== firebaseUser.picture) {
        user.avatar = firebaseUser.picture
        hasUpdates = true
      }

      // Update full name if current name is generic or missing
      if (
        (!user.fullName || user.fullName === 'Library User' || user.fullName === 'Library Patron') &&
        firebaseUser.name
      ) {
        user.fullName = firebaseUser.name
        hasUpdates = true
      }

      if (hasUpdates) {
        await user.save()
      }
      console.info(`Authenticated existing user via Google Auth: ${user.email} (${user._id}) [Status: ${user.status}]`)
    }

    const { accessToken, refreshToken } = TokenService.generateTokens(user)

    return {
      user: {
        id: user._id.toString(),
        fullName: user.fullName,
        email: user.email || '',
        phoneNo: user.phoneNo,
        googleId: user.googleId,
        avatar: user.avatar || firebaseUser.picture,
        status: user.status || 'waiting',
      },
      accessToken,
      refreshToken,
    }
  }

  /**
   * Refreshes access token and refresh token using a valid refresh token
   */
  static async refreshSession(rawRefreshToken: string): Promise<IAuthResult> {
    if (!rawRefreshToken) {
      throw new Error('Refresh token is required')
    }

    const payload = TokenService.verifyRefreshToken(rawRefreshToken)
    const user = await User.findById(payload.sub)

    if (!user) {
      throw new Error('User not found')
    }

    const { accessToken, refreshToken } = TokenService.generateTokens(user)

    return {
      user: {
        id: user._id.toString(),
        fullName: user.fullName,
        email: user.email || '',
        phoneNo: user.phoneNo,
        googleId: user.googleId,
        avatar: user.avatar,
        status: user.status || 'waiting',
      },
      accessToken,
      refreshToken,
    }
  }

  /**
   * Get user profile by ID
   */
  static async getUserProfile(userId: string) {
    const user = await User.findById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    return {
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      phoneNo: user.phoneNo,
      googleId: user.googleId,
      avatar: user.avatar,
      status: user.status || 'waiting',
      createdAt: user.createdAt,
    }
  }
}
