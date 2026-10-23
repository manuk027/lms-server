import mongoose from 'mongoose'

export async function connectDatabase(uri: string) {
  mongoose.connection.on('connected', () => {
    console.info('Mongoose default connection is open')
  })

  mongoose.connection.on('error', (err) => {
    console.error('Mongoose connection error:', err)
  })

  mongoose.connection.on('disconnected', () => {
    console.warn('Mongoose connection disconnected')
  })

  const connection = await mongoose.connect(uri)
  console.info(
    `Connected to MongoDB: "${connection.connection.name}" on host ${connection.connection.host}`
  )
}

