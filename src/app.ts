import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import mongoose from 'mongoose'
import { AuthController } from './controllers/auth.controller'
import { adminRouter } from './routes/admin.routes'
import { authRouter } from './routes/auth.routes'
import { userRouter } from './routes/user.routes'

export function createApp() {
  const app = express()
  const rawOrigins = process.env.FRONTEND_ORIGIN
  const allowedOrigins = rawOrigins
    ? rawOrigins.split(',').map((o) => o.trim())
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000']

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. server-to-server, curl, Postman)
        if (!origin) return callback(null, true)

        // Exact match from allowed origins
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          return callback(null, true)
        }

        // Allow any Vercel deployment domain (*.vercel.app)
        if (/^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin)) {
          return callback(null, true)
        }

        callback(null, false)
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  )
  app.use(express.json())
  app.use(cookieParser())

  app.get('/api/health', (_request, response) => {
    const isDbConnected = mongoose.connection.readyState === 1
    response.json({
      status: 'ok',
      service: 'library-management-api',
      database: {
        connected: isDbConnected,
        name: isDbConnected ? mongoose.connection.name : null,
      },
      timestamp: new Date().toISOString(),
    })
  })

  // Authentication & user management routes
  app.use('/api/auth', authRouter)
  app.use('/api/user', userRouter)

  // Public books route for login background & preview
  app.get('/api/books', AuthController.getPublicBooks)

  // Admin routes
  app.use('/api/admin', adminRouter)

  return app
}
