import { Router } from 'express'
import { UserController } from '../controllers/user.controller'
import { requireAuth } from '../middlewares/auth.middleware'

export const userRouter = Router()

// Protected user routes
userRouter.get('/dashboard', requireAuth, UserController.getDashboard)
userRouter.get('/books', requireAuth, UserController.getBooks)
userRouter.get('/my-books', requireAuth, UserController.getMyBooks)
userRouter.patch('/reviews/:loanId', requireAuth, UserController.updateReview)
