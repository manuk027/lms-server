export interface AdminLoginInput {
  username?: unknown
  password?: unknown
}

export interface ValidationResult {
  isValid: boolean
  errors: {
    username?: string
    password?: string
  }
}

export const AdminValidators = {
  isValidUsername(username: unknown): boolean {
    return (
      typeof username === 'string' &&
      username.trim().length >= 3 &&
      username.trim().length <= 30 &&
      /^[a-zA-Z0-9_-]+$/.test(username.trim())
    )
  },

  isValidPassword(password: unknown): boolean {
    return typeof password === 'string' && password.length >= 6
  },

  usernameValidator: {
    validator: (username: string) => AdminValidators.isValidUsername(username),
    message:
      'Username must be between 3 and 30 characters, containing only letters, numbers, underscores, or hyphens',
  },

  passwordValidator: {
    validator: (password: string) => AdminValidators.isValidPassword(password),
    message: 'Password must be at least 6 characters long',
  },

  validateLoginInput(data: AdminLoginInput): ValidationResult {
    const errors: { username?: string; password?: string } = {}

    if (
      !data.username ||
      typeof data.username !== 'string' ||
      data.username.trim() === ''
    ) {
      errors.username = 'Username is required'
    } else if (!AdminValidators.isValidUsername(data.username)) {
      errors.username =
        'Username must be 3-30 characters with letters, numbers, underscores or hyphens only'
    }

    if (
      !data.password ||
      typeof data.password !== 'string' ||
      data.password === ''
    ) {
      errors.password = 'Password is required'
    } else if (!AdminValidators.isValidPassword(data.password)) {
      errors.password = 'Password must be at least 6 characters long'
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    }
  },
}
