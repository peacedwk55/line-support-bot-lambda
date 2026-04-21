import { getProjects, getPipelines, getPipelineRuns, getBuildTimeline, getBuildDetail } from '../services/azureDevOps.js'
import { pool } from '../plugins/db.js'

const allowedProjects = process.env.ALLOWED_PROJECTS
    ? process.env.ALLOWED_PROJECTS.split(',').map(p => p.trim())
    : null

export default async function pipelineRoutes(app) {

    app.get('/api/projects', async (req, reply) => {
        try {
            const projects = await getProjects()
            const filtered = allowedProjects
                ? projects.filter(p => allowedProjects.includes(p.name))
                : projects
            return filtered
        } catch (err) {
            reply.status(500).send({ error: err.message })
        }
    })

    app.get('/api/projects/:project/pipelines', async (req, reply) => {
        try {
            if (allowedProjects && !allowedProjects.includes(req.params.project)) {
                return reply.status(403).send({ error: 'Project not allowed' })
            }
            const pipelines = await getPipelines(req.params.project)
            return pipelines
        } catch (err) {
            reply.status(500).send({ error: err.message })
        }
    })

    app.get('/api/projects/:project/pipelines/:pipelineId/runs', async (req, reply) => {
        try {
            if (allowedProjects && !allowedProjects.includes(req.params.project)) {
                return reply.status(403).send({ error: 'Project not allowed' })
            }
            const runs = await getPipelineRuns(req.params.project, req.params.pipelineId)
            return runs
        } catch (err) {
            reply.status(500).send({ error: err.message })
        }
    })

    app.get('/api/projects/:project/builds/:buildId/timeline', async (req, reply) => {
        try {
            if (allowedProjects && !allowedProjects.includes(req.params.project)) {
                return reply.status(403).send({ error: 'Project not allowed' })
            }
            const timeline = await getBuildTimeline(req.params.project, req.params.buildId)
            return timeline
        } catch (err) {
            reply.status(500).send({ error: err.message })
        }
    })

    app.get('/api/projects/:project/builds/:buildId/detail', async (req, reply) => {
        try {
            if (allowedProjects && !allowedProjects.includes(req.params.project)) {
                return reply.status(403).send({ error: 'Project not allowed' })
            }
            const detail = await getBuildDetail(req.params.project, req.params.buildId)
            return { sourceBranch: detail.sourceBranch }
        } catch (err) {
            reply.status(500).send({ error: err.message })
        }
    })

    app.get('/api/projects/:project/dashboard', async (req, reply) => {
        try {
            if (allowedProjects && !allowedProjects.includes(req.params.project)) {
                return reply.status(403).send({ error: 'Project not allowed' })
            }
            const project = req.params.project
            const page = Math.max(1, parseInt(req.query.page ?? '1'))
            const pageSize = 10
            const offset = (page - 1) * pageSize

            // page 1: sync จาก Azure ก่อนเพื่อให้ข้อมูลล่าสุด (ignore error กรณี project ไม่มี pipeline)
            let pipelineMap = {}
            try {
                const pipelines = await getPipelines(project)
                pipelineMap = Object.fromEntries(pipelines.map(p => [p.id, p.name]))
                if (page === 1) {
                    await Promise.all(pipelines.map(p => getPipelineRuns(project, p.id)))
                }
            } catch (e) {
                // project อาจไม่มี pipeline ใน Azure — ดึงจาก DB อย่างเดียว
            }

            const { rows } = await pool.query(`
                SELECT id, pipeline_id, name, state, result, created_date, finished_date
                FROM pipeline_runs
                WHERE project = $1
                ORDER BY created_date DESC
                LIMIT $2 OFFSET $3
            `, [project, pageSize, offset])

            // pre-warm cache สำหรับ page ถัดไปใน background
            pool.query(
                'SELECT id, state FROM pipeline_runs WHERE project = $1 ORDER BY created_date DESC LIMIT $2 OFFSET $3',
                [project, pageSize, offset + pageSize]
            ).then(({ rows: nextRows }) => {
                nextRows.forEach(row => {
                    getBuildTimeline(project, row.id, row.state === 'completed').catch(() => {})
                    getBuildDetail(project, row.id).catch(() => {})
                })
            }).catch(() => {})

            const { rows: countRows } = await pool.query(
                'SELECT COUNT(*) as total FROM pipeline_runs WHERE project = $1',
                [project]
            )
            const total = parseInt(countRows[0].total)

            // fetch timeline + sourceBranch พร้อมกัน
            const runDetails = await Promise.all(
                rows.map(async (row) => {
                    const run = {
                        id: row.id,
                        name: row.name,
                        state: row.state,
                        result: row.result,
                        createdDate: row.created_date,
                        finishedDate: row.finished_date,
                        pipeline: { name: pipelineMap[row.pipeline_id] ?? `Pipeline ${row.pipeline_id}` }
                    }
                    try {
                        const isCompleted = run.state === 'completed'
                        const [timeline, detail] = await Promise.all([
                            getBuildTimeline(project, run.id, isCompleted),
                            getBuildDetail(project, run.id)
                        ])
                        return {
                            run,
                            stages: timeline
                                .filter(r => r.type === 'Stage')
                                .map(r => ({ name: r.name, result: r.result, identifier: r.identifier ?? '', order: r.order ?? 0 })),
                            sourceBranch: detail.sourceBranch ?? ''
                        }
                    } catch (e) {
                        return { run, stages: [], sourceBranch: '' }
                    }
                })
            )

            return { items: runDetails, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
        } catch (err) {
            reply.status(500).send({ error: err.message })
        }
    })

    app.get('/api/projects/:project/stats', async (req, reply) => {
        try {
            if (allowedProjects && !allowedProjects.includes(req.params.project)) {
                return reply.status(403).send({ error: 'Project not allowed' })
            }

            const { rows } = await pool.query(`
                SELECT 
                    COUNT(*) as total_runs,
                    SUM(CASE WHEN result = 'succeeded' THEN 1 ELSE 0 END) as successful_runs,
                    SUM(CASE WHEN result = 'failed' THEN 1 ELSE 0 END) as failed_runs,
                    SUM(CASE WHEN state = 'inProgress' THEN 1 ELSE 0 END) as running
                FROM pipeline_runs 
                WHERE project = $1
            `, [req.params.project])

            return rows[0]
        } catch (err) {
            reply.status(500).send({ error: err.message })
        }
    })

}