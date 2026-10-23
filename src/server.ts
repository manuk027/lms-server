import 'dotenv/config'
import { createApp } from './app'
import { connectDatabase } from './config/database'

const port = Number(process.env.PORT ?? 4000)
const app = createApp()

async function start() {
  const mongoUri = process.env.MONGODB_URI
  if (mongoUri) {
    await connectDatabase(mongoUri)
  } else {
    console.warn('MONGODB_URI is not set; starting without a database connection.')
  }

  app.listen(port, () => {
    console.info(`Library API listening on port ${port}`)
  })
}

start().catch((error: unknown) => {
  console.error('Failed to start API:', error)
  process.exitCode = 1
})
