import { Types } from 'mongoose'

export const BookValidators = {
  hasAtLeastOneAuthor(authors: unknown): boolean {
    return Array.isArray(authors) && authors.length > 0
  },

  isValidPageCount(pages: unknown): boolean {
    return typeof pages === 'number' && Number.isInteger(pages) && pages >= 1
  },

  isValidBookCode(code: unknown): boolean {
    return typeof code === 'string' && code.trim().length >= 2
  },

  isValidShelf(shelf: unknown): boolean {
    return typeof shelf === 'string' && shelf.trim().length > 0
  },

  authorsValidator: {
    validator: (authors: (Types.ObjectId | string)[]) =>
      BookValidators.hasAtLeastOneAuthor(authors),
    message: 'Book must have at least one author',
  },

  pageCountValidator: {
    validator: (pages: number) => BookValidators.isValidPageCount(pages),
    message: 'Number of pages must be a positive integer greater than or equal to 1',
  },

  bookCodeValidator: {
    validator: (code: string) => BookValidators.isValidBookCode(code),
    message: 'Book code must be at least 2 characters long',
  },

  isValidLanguage(language: unknown): boolean {
    return typeof language === 'string' && language.trim().length >= 2
  },

  languageValidator: {
    validator: (language: string) => BookValidators.isValidLanguage(language),
    message: 'Language must be at least 2 characters long',
  },
}
