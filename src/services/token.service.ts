import jwt, { SignOptions } from 'jsonwebtoken'
import { JWT_CONFIG } from '../config/jwt'
import { IUser } from '../models/User'

export interface IAccessTokenPayload {
  sub: string
  email: string
  fullName: string
}

export interface IRefreshTokenPayload {
  sub: string
}

export class TokenService {
  static generateTokens(user: IUser): { accessToken: string; refreshToken: string } {
    const userId = user._id.toString()

    const accessPayload: IAccessTokenPayload = {
      sub: userId,
      email: user.email,
      fullName: user.fullName,
    }

    const refreshPayload: IRefreshTokenPayload = {
      sub: userId,
    }

    const accessSignOptions: SignOptions = {
      expiresIn: JWT_CONFIG.accessExpiresIn as unknown as number,
    }

    const refreshSignOptions: SignOptions = {
      expiresIn: JWT_CONFIG.refreshExpiresIn as unknown as number,
    }

    const accessToken = jwt.sign(accessPayload, JWT_CONFIG.accessSecret, accessSignOptions)
    const refreshToken = jwt.sign(refreshPayload, JWT_CONFIG.refreshSecret, refreshSignOptions)

    return { accessToken, refreshToken }
  }

  static verifyAccessToken(token: string): IAccessTokenPayload {
    return jwt.verify(token, JWT_CONFIG.accessSecret) as IAccessTokenPayload
  }

  static verifyRefreshToken(token: string): IRefreshTokenPayload {
    return jwt.verify(token, JWT_CONFIG.refreshSecret) as IRefreshTokenPayload
  }
}
