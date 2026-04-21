'use client'

import { useCallback, useEffect, useState } from 'react'
import { getProjects, getDashboard } from '@/lib/api'
import PipelineCard from '@/components/pipeline/PipelineCard'
import ProjectSelector from '@/components/ProjectSelector'
import { useRouter } from 'next/navigation'

function useDarkMode() {
    const [dark, setDark] = useState(false)
    useEffect(() => {
        const stored = localStorage.getItem('theme')
        const isDark = stored === 'dark'
        setDark(isDark)
        document.documentElement.classList.toggle('dark', isDark)
    }, [])
    const toggle = () => {
        const next = !dark
        setDark(next)
        localStorage.setItem('theme', next ? 'dark' : 'light')
        document.documentElement.classList.toggle('dark', next)
    }
    return { dark, toggle }
}

type StatusFilter = 'all' | 'succeeded' | 'failed' | 'canceled' | 'inProgress'

export default function DashboardPage() {
    const router = useRouter()
    const { dark, toggle: toggleDark } = useDarkMode()
    const [projects, setProjects] = useState<any[]>([])
    const [selectedProject, setSelectedProject] = useState('CdsPaperlessWebService')
    const [runs, setRuns] = useState<any[]>([])
    const [stages, setStages] = useState<Record<number, any[]>>({})
    const [sourceBranches, setSourceBranches] = useState<Record<number, string>>({})
    const [loading, setLoading] = useState(true)
    const [live, setLive] = useState(false)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    useEffect(() => {
        getProjects().then(setProjects)
    }, [])

    const load = useCallback(async (project: string, p = 1) => {
        setLoading(true)
        setRuns([])
        setStages({})
        setSourceBranches({})
        try {
            const data = await getDashboard(project, p)
            const stageMap: Record<number, any[]> = {}
            const branchMap: Record<number, string> = {}
            const allRuns: any[] = []
            for (const item of data.items) {
                allRuns.push(item.run)
                stageMap[item.run.id] = item.stages
                branchMap[item.run.id] = item.sourceBranch
            }
            setRuns(allRuns)
            setStages(stageMap)
            setSourceBranches(branchMap)
            setTotalPages(data.totalPages)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { setPage(1); load(selectedProject, 1) }, [selectedProject, load])
    useEffect(() => { load(selectedProject, page) }, [page])

    useEffect(() => {
        const es = new EventSource('/api/sse')
        es.addEventListener('connected', () => setLive(true))
        es.addEventListener('pipeline.update', (e: MessageEvent) => {
            const data = JSON.parse(e.data)
            if (data.project === selectedProject) load(selectedProject)
        })
        es.onerror = () => setLive(false)
        return () => { es.close(); setLive(false) }
    }, [selectedProject, load])

    const filteredRuns = runs.filter(run => {
        const matchSearch = search === '' || run.pipeline?.name?.toLowerCase().includes(search.toLowerCase()) || run.name?.toLowerCase().includes(search.toLowerCase())
        const statusKey = run.state === 'inProgress' ? 'inProgress' : run.result
        const matchStatus = statusFilter === 'all' || statusKey === statusFilter
        return matchSearch && matchStatus
    })

    const total = runs.length
    const success = runs.filter(r => r.result === 'succeeded').length
    const failed = runs.filter(r => r.result === 'failed').length
    const canceled = runs.filter(r => r.result === 'canceled').length
    const running = runs.filter(r => r.state === 'inProgress').length

    const navItems = [
        { label: 'Dashboard', path: '/dashboard', active: true },
        { label: 'History', path: `/dashboard/history?project=${selectedProject}`, active: false },
        { label: 'Pipelines', path: '#', active: false },
        { label: 'Environments', path: '#', active: false },
    ]

    const filterPills: { label: string; key: StatusFilter; color: string }[] = [
        { label: 'All', key: 'all', color: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-200' },
        { label: 'Success', key: 'succeeded', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
        { label: 'Failed', key: 'failed', color: 'bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-300' },
        { label: 'Running', key: 'inProgress', color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300' },
        { label: 'Canceled', key: 'canceled', color: 'bg-gray-50 text-gray-500 dark:bg-slate-700 dark:text-slate-400' },
    ]

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-slate-900 overflow-hidden">

            <div className="w-52 bg-white dark:bg-slate-800 border-r border-gray-100 dark:border-slate-700 flex flex-col flex-shrink-0">
                <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-100 dark:border-slate-700">
                    <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <circle cx="6.5" cy="6.5" r="5.5" stroke="white" strokeWidth="1.5" />
                            <path d="M4.5 6.5l1.5 1.5L8.5 4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-slate-100">PipelineHub</span>
                </div>

                <nav className="flex flex-col gap-1 p-3">
                    {navItems.map(item => (
                        <button key={item.label}
                            onClick={() => item.path !== '#' && router.push(item.path)}
                            className={`text-left px-3 py-2 rounded-lg text-xs transition ${item.active
                                ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/40 dark:text-blue-300'
                                : 'text-gray-500 hover:bg-gray-50 dark:text-slate-400 dark:hover:bg-slate-700'}`}>
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="px-3 pb-1">
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-2">Projects</p>
                    <ProjectSelector projects={projects} selected={selectedProject} onChange={setSelectedProject} />
                </div>

                <div className="flex-1" />

                <div className="px-3 pb-3">
                    <button
                        onClick={toggleDark}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 transition text-gray-600 dark:text-slate-300"
                    >
                        <span>{dark ? '☀️ Light Mode' : '🌙 Dark Mode'}</span>
                    </button>
                </div>

                <div className="p-3 border-t border-gray-100 dark:border-slate-700 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-xs font-medium text-blue-700 dark:text-blue-300 flex-shrink-0">SP</div>
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-slate-200 truncate">Santiphap</p>
                        <p className="text-[10px] text-gray-400 dark:text-slate-500">CDS Dev</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

                <div className="bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
                    <div>
                        <h1 className="text-sm font-medium text-gray-900 dark:text-slate-100">Dashboard</h1>
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{selectedProject}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300 dark:bg-slate-600'}`} />
                            <span className={`text-[10px] font-medium ${live ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'}`}>
                                {live ? 'Live' : 'Offline'}
                            </span>
                        </div>
                        <button
                            onClick={() => load(selectedProject)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 transition"
                        >
                            ↻ Refresh
                        </button>
                    </div>
                </div>

                <div className="px-6 py-4 flex gap-3 border-b border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0">
                    {[
                        { label: 'Total', value: total, color: 'text-gray-800 dark:text-slate-100' },
                        { label: 'Success', value: success, color: 'text-emerald-600 dark:text-emerald-400' },
                        { label: 'Failed', value: failed, color: 'text-red-500 dark:text-red-400' },
                        { label: 'Canceled', value: canceled, color: 'text-gray-500 dark:text-slate-400' },
                        { label: 'Running', value: running, color: 'text-blue-500 dark:text-blue-400' },
                    ].map(s => (
                        <div key={s.label} className="bg-gray-50 dark:bg-slate-700/50 rounded-lg px-4 py-3 flex-1">
                            <p className="text-[11px] text-gray-400 dark:text-slate-500 mb-1">{s.label}</p>
                            <p className={`text-xl font-medium ${s.color}`}>{s.value}</p>
                        </div>
                    ))}
                </div>

                <div className="px-6 py-3 flex items-center gap-3 border-b border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0">
                    <div className="flex-1 relative">
                        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                        </svg>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="ค้นหา pipeline..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:focus:ring-blue-700"
                        />
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {filterPills.map(pill => (
                            <button
                                key={pill.key}
                                onClick={() => setStatusFilter(pill.key)}
                                className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition ${statusFilter === pill.key
                                    ? pill.color + ' ring-1 ring-inset ring-current'
                                    : 'text-gray-400 dark:text-slate-500 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                            >
                                {pill.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-auto px-6 py-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-40 gap-2">
                            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-xs text-gray-400 dark:text-slate-500">Loading pipelines...</p>
                        </div>
                    ) : filteredRuns.length === 0 ? (
                        <div className="flex items-center justify-center h-40 text-sm text-gray-400 dark:text-slate-500">
                            ไม่พบ Pipeline ที่ตรงกับเงื่อนไข
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {filteredRuns.map(run => (
                                <PipelineCard
                                    key={run.id}
                                    run={run}
                                    stages={stages[run.id] ?? []}
                                    sourceBranch={sourceBranches[run.id] ?? ''}
                                />
                            ))}
                        </div>
                    )}
                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-1.5 py-4 flex-shrink-0 border-t border-gray-100 dark:border-slate-700">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
                        >
                            ← Prev
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                            <button
                                key={p}
                                onClick={() => setPage(p)}
                                className={`w-8 h-8 text-xs rounded-lg border transition ${page === p
                                    ? 'bg-blue-600 border-blue-600 text-white font-medium'
                                    : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                            >
                                {p}
                            </button>
                        ))}
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
                        >
                            Next →
                        </button>
                    </div>
                )}
                </div>

            </div>
        </div>
    )
}