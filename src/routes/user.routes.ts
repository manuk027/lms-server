import { Router } from 'express'
import { UserController } from '../controllers/user.controller'
import { requireAuth } from '../middlewares/auth.middleware'

export const userRouter = Router()

// Protected user routes
userRouter.get('/dashboard', requireAuth, UserController.getDashboard)
userRouter.get('/books', requireAuth, UserController.getBooks)
userRouter.get('/my-books', requireAuth, UserController.getMyBooks)
userRouter.get('/history', requireAuth, UserController.getMyBooks)
userRouter.patch('/loans/:loanId/status', requireAuth, UserController.updateReadingStatus)
userRouter.patch('/reviews/:loanId', requireAuth, UserController.updateReview)
userRouter.put('/profile', requireAuth, UserController.updateProfile)
userRouter.patch('/profile', requireAuth, UserController.updateProfile)
userRouter.post('/borrow', requireAuth, UserController.borrowBook)
userRouter.post('/extend', requireAuth, UserController.extendLoan)
userRouter.post('/return', requireAuth, UserController.returnBook)
