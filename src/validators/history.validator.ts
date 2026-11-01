export const ALLOWED_LOAN_STATUSES = [
  'borrow_pending',
  'borrowed',
  'borrow_rejected',
  'return_pending',
  'returned',
  'overdue',
] as const

export type ValidLoanStatus = (typeof ALLOWED_LOAN_STATUSES)[number]

export const ALLOWED_EXTENSION_STATUSES = [
  'none',
  'pending',
  'approved',
  'rejected',
] as const

export type ValidExtensionStatus = (typeof ALLOWED_EXTENSION_STATUSES)[number]

export const ALLOWED_READING_STATUSES = [
  'completed',
  'partially_read',
  'not_read',
] as const

export type ValidReadingStatus = (typeof ALLOWED_READING_STATUSES)[number]

export const HistoryValidators = {
  isValidStatus(status: unknown): boolean {
    return (
      typeof status === 'string' &&
      ALLOWED_LOAN_STATUSES.includes(status as ValidLoanStatus)
    )
  },

  isValidExtensionStatus(status: unknown): boolean {
    return (
      typeof status === 'string' &&
      ALLOWED_EXTENSION_STATUSES.includes(status as ValidExtensionStatus)
    )
  },

  isValidReadingStatus(status: unknown): boolean {
    return (
      typeof status === 'string' &&
      ALLOWED_READING_STATUSES.includes(status as ValidReadingStatus)
    )
  },

  isValidReturnDate(returnedAt: Date | null | undefined, borrowedAt?: Date): boolean {
    if (!returnedAt) return true
    if (!borrowedAt) return true
    return new Date(returnedAt).getTime() >= new Date(borrowedAt).getTime()
  },

  statusValidator: {
    validator: (status: string) => HistoryValidators.isValidStatus(status),
    message: `Status must be one of: ${ALLOWED_LOAN_STATUSES.join(', ')}`,
  },
}
