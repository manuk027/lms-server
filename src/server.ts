import 'dotenv/config'
import mongoose from 'mongoose'
import { createApp } from './app'
import { connectDatabase } from './config/database'
import { AdminService } from './services/admin.service'


const port = Number(process.env.PORT ?? 4000)
const app = createApp()

async function start() {
  const mongoUri = process.env.MONGODB_URI
  if (mongoUri) {
    await connectDatabase(mongoUri)
    await AdminService.ensureDefaultAdmin()
    await AdminService.syncAuthorsAndPublishers()
    await AdminService.checkAndUpdateExpiredFees()
  } else {
    console.warn('MONGODB_URI is not set; starting without a database connection.')
  }

  const server = app.listen(port, '0.0.0.0', () => {
    console.info(`Library API listening on port ${port}`)
  })

  const shutdown = async (signal: string) => {
    console.info(`Received ${signal}. Shutting down gracefully...`)
    server.close(async () => {
      await mongoose.disconnect()
      console.info('MongoDB disconnected and server closed.')
      process.exit(0)
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

start().catch((error: unknown) => {
  console.error('Failed to start API:', error)
  process.exitCode = 1
})

