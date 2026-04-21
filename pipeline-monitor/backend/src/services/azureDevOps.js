import axios from 'axios'
import dotenv from 'dotenv'
import { redis } from '../plugins/redis.js'
import { pool } from '../plugins/db.js'

dotenv.config()

const baseURL = process.env.AZURE_ORG_URL
const pat = process.env.AZURE_PAT
const token = Buffer.from(`:${pat}`).toString('base64')

const client = axios.create({
    headers: {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json'
    }
})

async function fetchWithCache(cacheKey, ttlInSeconds, fetchFn) {
    if (redis.isOpen) {
        const cached = await redis.get(cacheKey)
        if (cached) return JSON.parse(cached)
    }
    const data = await fetchFn()
    if (redis.isOpen && data) {
        await redis.setEx(cacheKey, ttlInSeconds, JSON.stringify(data))
    }
    return data
}

export async function getProjects() {
    return fetchWithCache('ado:projects', 3600, async () => {
        const res = await client.get(`${baseURL}/_apis/projects?api-version=7.0`)
        return res.data.value
    })
}

export async function getPipelines(project) {
    return fetchWithCache(`ado:pipelines:${project}`, 3600, async () => {
        const res = await client.get(`${baseURL}/${project}/_apis/pipelines?api-version=7.0`)
        return res.data.value
    })
}

export async function getPipelineRuns(project, pipelineId) {
    const cacheKey = `ado:runs:${project}:${pipelineId}`

    if (redis.isOpen) {
        const cached = await redis.get(cacheKey)
        if (cached) {
            const runs = JSON.parse(cached)
            if (runs && runs.length > 0) {
                saveRunsToDB(project, pipelineId, runs).catch(err => console.error('[DB] Save Error (cache):', err))
            }
            return runs
        }
    }

    const res = await client.get(`${baseURL}/${project}/_apis/pipelines/${pipelineId}/runs?api-version=7.0`)
    const runs = res.data.value

    if (runs && runs.length > 0) {
        if (redis.isOpen) {
            await redis.setEx(cacheKey, 15, JSON.stringify(runs))
        }
        saveRunsToDB(project, pipelineId, runs).catch(err => console.error('[DB] Save Error:', err))
    }

    return runs
}

async function saveRunsToDB(project, pipelineId, runs) {
    for (const run of runs) {
        await pool.query(`
            INSERT INTO pipeline_runs (id, project, pipeline_id, name, state, result, created_date, finished_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id) DO UPDATE SET
                state = EXCLUDED.state,
                result = EXCLUDED.result,
                finished_date = EXCLUDED.finished_date,
                updated_at = CURRENT_TIMESTAMP
        `, [
            run.id,
            project,
            pipelineId,
            run.name,
            run.state || null,
            run.result || null,
            run.createdDate ? new Date(run.createdDate) : null,
            run.finishedDate ? new Date(run.finishedDate) : null
        ])
    }
}

export async function getBuildTimeline(project, buildId, isCompleted = false) {
    const ttl = isCompleted ? 3600 : 15
    const cacheKey = `ado:timeline:${project}:${buildId}`
    if (redis.isOpen) {
        const cached = await redis.get(cacheKey)
        if (cached) return JSON.parse(cached)
    }
    try {
        const res = await client.get(`${baseURL}/${project}/_apis/build/builds/${buildId}/timeline?api-version=7.0`)
        const data = res.data.records || []
        if (redis.isOpen) await redis.setEx(cacheKey, ttl, JSON.stringify(data))
        return data
    } catch (e) {
        // 404 = build เก่า cache นาน
        if (redis.isOpen) await redis.setEx(cacheKey, 3600, JSON.stringify([]))
        return []
    }
}

export async function getBuildDetail(project, buildId) {
    return fetchWithCache(`ado:detail:${project}:${buildId}`, 3600, async () => {
        try {
            const res = await client.get(`${baseURL}/${project}/_apis/build/builds/${buildId}?api-version=7.0`)
            return res.data
        } catch (e) {
            return {}
        }
    })
}