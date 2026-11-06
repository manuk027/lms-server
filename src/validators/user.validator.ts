export const EMAIL_REGEX = /^\S+@\S+\.\S+$/
export const PHONE_REGEX = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/

export const UserValidators = {
  isValidEmail(email?: string): boolean {
    if (!email || email.trim() === '') return true
    return typeof email === 'string' && EMAIL_REGEX.test(email.trim())
  },

  isValidPhone(phone?: string): boolean {
    if (!phone || phone.trim() === '') return true
    return PHONE_REGEX.test(phone.trim())
  },

  isValidFullName(name: string): boolean {
    return typeof name === 'string' && name.trim().length >= 2
  },

  emailValidator: {
    validator: (email?: string) => UserValidators.isValidEmail(email),
    message: 'Please provide a valid email address',
  },

  phoneValidator: {
    validator: (phone?: string) => UserValidators.isValidPhone(phone),
    message: 'Please provide a valid phone number',
  },

  fullNameValidator: {
    validator: (name: string) => UserValidators.isValidFullName(name),
    message: 'Full name must be at least 2 characters long',
  },
}
