import { Router } from 'express'
import { UserController } from '../controllers/user.controller'
import { requireAuth } from '../middlewares/auth.middleware'

export const userRouter = Router()

// Protected user routes
userRouter.get('/dashboard', requireAuth, UserController.getDashboard)
userRouter.get('/books', requireAuth, UserController.getBooks)
userRouter.post('/borrow', requireAuth, UserController.borrowBook)
userRouter.post('/extend', requireAuth, UserController.extendLoan)
userRouter.post('/return', requireAuth, UserController.returnBook)
userRouter.get('/my-books', requireAuth, UserController.getMyBooks)
userRouter.patch('/reviews/:loanId', requireAuth, UserController.updateReview)
