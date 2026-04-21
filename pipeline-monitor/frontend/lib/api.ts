import axios from 'axios'

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || ''
})

export async function getProjects() {
    const res = await api.get('/api/projects')
    return res.data
}

export async function getPipelines(project: string) {
    const res = await api.get(`/api/projects/${project}/pipelines`)
    return res.data
}

export async function getPipelineRuns(project: string, pipelineId: number) {
    const res = await api.get(`/api/projects/${project}/pipelines/${pipelineId}/runs`)
    return res.data
}

export async function getTimeline(project: string, buildId: number) {
    const res = await api.get(`/api/projects/${project}/builds/${buildId}/timeline`)
    return res.data
}

export async function getStats(project: string) {
    const res = await api.get(`/api/projects/${project}/stats`)
    return res.data
}

export async function getDashboard(project: string, page = 1) {
    const res = await api.get(`/api/projects/${project}/dashboard?page=${page}`)
    return res.data as {
        items: { run: any; stages: any[]; sourceBranch: string }[]
        total: number
        page: number
        pageSize: number
        totalPages: number
    }
}

export async function getBuildDetail(project: string, buildId: number) {
    const res = await api.get(`/api/projects/${project}/builds/${buildId}/detail`)
    return res.data
}