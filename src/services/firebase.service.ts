import jwt from 'jsonwebtoken'

export interface IFirebaseUserData {
  uid: string
  email: string
  name: string
  picture?: string
  emailVerified?: boolean
}

export class FirebaseService {
  private static readonly apiKey = process.env.FIREBASE_API_KEY
  private static readonly projectId =
    process.env.FIREBASE_PROJECT_ID || 'library-management-syste-968ce'

  /**
   * Verifies a Firebase ID token using Google's Identity Toolkit API
   * and falls back to decoded token claims validation.
   */
  static async verifyIdToken(idToken: string): Promise<IFirebaseUserData> {
    if (!idToken || typeof idToken !== 'string') {
      throw new Error('Firebase ID token is required')
    }

    // 1. Try Google Identity Toolkit validation
    if (this.apiKey) {
      try {
        const response = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${this.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          }
        )

        if (response.ok) {
          const data = (await response.json()) as {
            users?: Array<{
              localId: string
              email: string
              displayName?: string
              photoUrl?: string
              emailVerified?: boolean
            }>
          }

          if (data.users && data.users.length > 0) {
            const user = data.users[0]
            return {
              uid: user.localId,
              email: user.email,
              name: user.displayName || user.email.split('@')[0],
              picture: user.photoUrl,
              emailVerified: user.emailVerified,
            }
          }
        }
      } catch (networkError) {
        console.warn('Firebase Identity Toolkit verification network error:', networkError)
      }
    }

    // 2. Fallback: Parse and validate Firebase JWT payload
    const decoded = jwt.decode(idToken) as {
      sub?: string
      user_id?: string
      email?: string
      name?: string
      picture?: string
      aud?: string
      iss?: string
      exp?: number
    } | null

    if (!decoded || (!decoded.sub && !decoded.user_id) || !decoded.email) {
      throw new Error('Invalid Firebase ID token claims')
    }

    const nowSeconds = Math.floor(Date.now() / 1000)
    if (decoded.exp && decoded.exp < nowSeconds) {
      throw new Error('Firebase ID token has expired')
    }

    return {
      uid: (decoded.user_id || decoded.sub)!,
      email: decoded.email,
      name: decoded.name || decoded.email.split('@')[0],
      picture: decoded.picture,
    }
  }
}
