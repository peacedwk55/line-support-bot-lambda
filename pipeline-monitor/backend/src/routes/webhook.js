import { addClient, removeClient, broadcastEvent } from '../plugins/sse.js'
import { pool } from '../plugins/db.js'
import { redis } from '../plugins/redis.js'

export default async function webhookRoutes(app) {

    // SSE Endpoint - Frontend เชื่อมต่อที่นี่เพื่อรับ event แบบ real-time
    app.get('/api/sse', (req, reply) => {
        reply.hijack()
        const raw = reply.raw

        raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
        })

        // ยืนยัน connection
        raw.write('event: connected\ndata: {"status":"ok"}\n\n')

        addClient(raw)

        req.raw.on('close', () => {
            removeClient(raw)
        })
    })

    // Webhook Endpoint - Azure DevOps จะยิง POST มาที่นี่เมื่อ Pipeline สถานะเปลี่ยน
    app.post('/api/webhook', async (req, reply) => {
        try {
            const { eventType, resource, resourceContainers } = req.body

            // Azure DevOps Build Complete Event
            if (eventType === 'build.complete') {
                const buildId = resource?.id
                const buildNumber = resource?.buildNumber
                const state = 'completed'
                const result = resource?.result           // succeeded / failed / canceled
                const pipelineId = resource?.definition?.id
                const pipelineName = resource?.definition?.name
                const project = resource?.project?.name || resourceContainers?.project?.id

                console.log(`[Webhook] build.complete: ${pipelineName} #${buildNumber} -> ${result}`)

                // อัปเดตสถานะใน DB
                if (buildId && project) {
                    await pool.query(`
                        INSERT INTO pipeline_runs (id, project, pipeline_id, name, state, result, created_date, finished_date)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (id) DO UPDATE SET
                            state = EXCLUDED.state,
                            result = EXCLUDED.result,
                            finished_date = EXCLUDED.finished_date,
                            updated_at = CURRENT_TIMESTAMP
                    `, [
                        buildId,
                        project,
                        pipelineId || null,
                        buildNumber || null,
                        state,
                        result || null,
                        resource?.startTime ? new Date(resource.startTime) : null,
                        resource?.finishTime ? new Date(resource.finishTime) : null,
                    ])
                }

                // ลบ Cache ของ runs โปรเจคนี้ เพื่อให้ดึงข้อมูลใหม่จาก Azure
                if (redis.isOpen && project && pipelineId) {
                    await redis.del(`ado:runs:${project}:${pipelineId}`)
                    console.log(`[Webhook] Cache invalidated for ${project}/${pipelineId}`)
                }

                // ส่ง event ไปยัง frontend ทุก client ที่เปิด Dashboard อยู่
                broadcastEvent('pipeline.update', {
                    buildId,
                    project,
                    pipelineId,
                    pipelineName,
                    result,
                    finishTime: resource?.finishTime,
                })
            }

            return { ok: true }
        } catch (err) {
            console.error('[Webhook] Error:', err)
            return reply.status(500).send({ error: err.message })
        }
    })
}
