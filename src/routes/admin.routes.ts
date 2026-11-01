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

// Inventory & Book Management endpoints
adminRouter.post('/books', requireAdminAuth, AdminController.createBook)
adminRouter.get('/books', requireAdminAuth, AdminController.getBooks)

// Management endpoints
adminRouter.get('/users', requireAdminAuth, AdminController.getUsers)
adminRouter.patch('/users/:id/status', requireAdminAuth, AdminController.updateUserStatus)

// Requests endpoints (Waiting list, Borrow requests, Extension requests, Return requests)
adminRouter.get('/requests', requireAdminAuth, AdminController.getUserRequests)
adminRouter.get('/requests/counts', requireAdminAuth, AdminController.getRequestsCounts)
adminRouter.get('/requests/borrow', requireAdminAuth, AdminController.getBorrowRequests)
adminRouter.patch('/requests/borrow/:id', requireAdminAuth, AdminController.updateBorrowRequest)
adminRouter.get('/requests/extension', requireAdminAuth, AdminController.getExtensionRequests)
adminRouter.patch('/requests/extension/:id', requireAdminAuth, AdminController.updateExtensionRequest)
adminRouter.get('/requests/return', requireAdminAuth, AdminController.getReturnRequests)
adminRouter.patch('/requests/return/:id', requireAdminAuth, AdminController.updateReturnRequest)
adminRouter.get('/publications', requireAdminAuth, AdminController.getPublications)
adminRouter.get('/authors', requireAdminAuth, AdminController.getAuthors)
adminRouter.put('/books/:id', requireAdminAuth, AdminController.updateBook)      
adminRouter.delete('/books/:id', requireAdminAuth, AdminController.deleteBook)

// Notification endpoints
adminRouter.get('/notifications', requireAdminAuth, AdminController.getNotifications)
adminRouter.patch('/notifications/:id/read', requireAdminAuth, AdminController.markNotificationRead)
adminRouter.patch('/notifications/mark-all-read', requireAdminAuth, AdminController.markAllNotificationsRead) 
