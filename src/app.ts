import cors from 'cors'
import express from 'express'
import mongoose from 'mongoose'

export function createApp() {
  const app = express()
  const allowedOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'

  app.use(cors({ origin: allowedOrigin }))
  app.use(express.json())

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

  return app
}
