export const AuthorValidators = {
  isValidName(name: unknown): boolean {
    return typeof name === 'string' && name.trim().length >= 2
  },

  isValidAge(age: unknown): boolean {
    if (age === undefined || age === null) return true
    return typeof age === 'number' && Number.isInteger(age) && age >= 0
  },

  isValidCategory(category: unknown): boolean {
    return typeof category === 'string' && category.trim().length >= 2
  },

  nameValidator: {
    validator: (name: string) => AuthorValidators.isValidName(name),
    message: 'Author name must be at least 2 characters long',
  },

  ageValidator: {
    validator: (age?: number) => AuthorValidators.isValidAge(age),
    message: 'Age must be a non-negative integer',
  },
}
