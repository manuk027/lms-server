import { Router } from 'express'
import { AdminController } from '../controllers/admin.controller'
import { requireAdminAuth } from '../middlewares/adminAuth.middleware'
import { adminLoginThrottle } from '../middlewares/throttle.middleware'

export const adminRouter = Router()

// Public admin authentication endpoints
adminRouter.post('/auth/login', adminLoginThrottle, AdminController.login)
adminRouter.post('/auth/logout', AdminController.logout)

// Protected admin endpoints
adminRouter.get('/auth/me', requireAdminAuth, AdminController.getMe)
adminRouter.get('/dashboard/stats', requireAdminAuth, AdminController.getDashboardStats)
