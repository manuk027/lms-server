import { Router } from 'express'
import { AuthController } from '../controllers/auth.controller'
import { requireAuth } from '../middlewares/auth.middleware'

export const authRouter = Router()

// Public authentication endpoints
authRouter.post('/google', AuthController.googleAuth)
authRouter.post('/refresh', AuthController.refresh)
authRouter.post('/logout', AuthController.logout)
authRouter.get('/books', AuthController.getPublicBooks)

// Protected user profile endpoint
authRouter.get('/me', requireAuth, AuthController.getMe)
