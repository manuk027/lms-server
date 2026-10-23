import cors from 'cors'
import express from 'express'

export function createApp() {
  const app = express()
  const allowedOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'

  app.use(cors({ origin: allowedOrigin }))
  app.use(express.json())

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'library-management-api' })
  })

  return app
}
