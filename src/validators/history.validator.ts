export const ALLOWED_LOAN_STATUSES = ['borrowed', 'returned', 'overdue'] as const
export type ValidLoanStatus = (typeof ALLOWED_LOAN_STATUSES)[number]

export const HistoryValidators = {
  isValidStatus(status: unknown): boolean {
    return (
      typeof status === 'string' &&
      ALLOWED_LOAN_STATUSES.includes(status as ValidLoanStatus)
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
