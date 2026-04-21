import { createClient } from 'redis'
import dotenv from 'dotenv'

dotenv.config()

export const redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
})

redis.on('error', err => console.error('[Redis] Client Error:', err))
redis.on('connect', () => console.log('[Redis] Connected successfully'))

export async function initRedis() {
    if (!redis.isOpen) {
        await redis.connect()
    }
}
