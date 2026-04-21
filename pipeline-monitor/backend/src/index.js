import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import dotenv from 'dotenv'
import pipelineRoutes from './routes/pipelines.js'
import webhookRoutes from './routes/webhook.js'
import { initRedis } from './plugins/redis.js'
import { initDB } from './plugins/db.js'
import { metricsPlugin } from './plugins/metrics.js'

dotenv.config()

const app = Fastify({ logger: true })

await app.register(cors, { origin: '*' })
await app.register(jwt, { secret: process.env.JWT_SECRET })
await app.register(metricsPlugin)
await app.register(pipelineRoutes)
await app.register(webhookRoutes)

app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
})

try {
    await initDB()
    await initRedis()
    await app.listen({ port: process.env.PORT || 3001, host: '0.0.0.0' })
} catch (err) {
    app.log.error(err)
    process.exit(1)
}