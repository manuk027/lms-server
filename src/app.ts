import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import mongoose from 'mongoose'
import { authRouter } from './routes/auth.routes'

export function createApp() {
  const app = express()
  const allowedOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'

  app.use(
    cors({
      origin: allowedOrigin,
      credentials: true,
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

  return app
}
