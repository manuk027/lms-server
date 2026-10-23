export const PublisherValidators = {
  isValidName(name: unknown): boolean {
    return typeof name === 'string' && name.trim().length >= 2
  },

  nameValidator: {
    validator: (name: string) => PublisherValidators.isValidName(name),
    message: 'Publisher name must be at least 2 characters long',
  },
}
