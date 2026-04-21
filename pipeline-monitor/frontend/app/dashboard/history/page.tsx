'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getProjects, getStats } from '@/lib/api'
import ProjectSelector from '@/components/ProjectSelector'

function useDarkMode() {
    const [dark, setDark] = useState(false)
    useEffect(() => {
        const stored = localStorage.getItem('theme')
        setDark(stored === 'dark')
        document.documentElement.classList.toggle('dark', stored === 'dark')
    }, [])
    const toggle = () => {
        const next = !dark
        setDark(next)
        localStorage.setItem('theme', next ? 'dark' : 'light')
        document.documentElement.classList.toggle('dark', next)
    }
    return { dark, toggle }
}

function Ring({ pct, color, label, value }: { pct: number; color: string; label: string; value: string | number }) {
    const r = 28
    const circ = 2 * Math.PI * r
    const dash = (pct / 100) * circ
    return (
        <div className="flex flex-col items-center gap-1.5">
            <div className="relative w-16 h-16">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-gray-100 dark:text-slate-700" />
                    <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="5"
                        strokeDasharray={`${dash} ${circ}`}
                        strokeLinecap="round"
                        className={color}
                        style={{ transition: 'stroke-dasharray 0.8s ease' }}
                    />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-700 dark:text-slate-200">{pct}%</span>
            </div>
            <p className="text-xs font-medium text-gray-700 dark:text-slate-300">{label}</p>
            <p className="text-[10px] text-gray-400 dark:text-slate-500">{value} runs</p>
        </div>
    )
}

function HistoryContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { dark, toggle: toggleDark } = useDarkMode()
    const [projects, setProjects] = useState<any[]>([])
    const [selectedProject, setSelectedProject] = useState(searchParams.get('project') ?? 'CdsPaperlessWebService')
    const [stats, setStats] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => { getProjects().then(setProjects) }, [])

    useEffect(() => {
        setLoading(true)
        getStats(selectedProject)
            .then(setStats)
            .finally(() => setLoading(false))
    }, [selectedProject])

    const total = Number(stats?.total_runs ?? 0)
    const success = Number(stats?.successful_runs ?? 0)
    const failed = Number(stats?.failed_runs ?? 0)
    const running = Number(stats?.running ?? 0)
    const canceled = total - success - failed - running
    const successPct = total ? Math.round((success / total) * 100) : 0
    const failedPct = total ? Math.round((failed / total) * 100) : 0
    const canceledPct = total ? Math.round((canceled / total) * 100) : 0

    const navItems = [
        { label: 'Dashboard', path: '/dashboard', active: false },
        { label: 'History', path: '/dashboard/history', active: true },
        { label: 'Pipelines', path: '#', active: false },
        { label: 'Environments', path: '#', active: false },
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
                    <button onClick={toggleDark}
                        className="w-full flex items-center px-3 py-2 rounded-lg text-xs border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 transition text-gray-600 dark:text-slate-300">
                        {dark ? '☀️ Light Mode' : '🌙 Dark Mode'}
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
                <div className="bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 px-6 py-4 flex-shrink-0">
                    <h1 className="text-sm font-medium text-gray-900 dark:text-slate-100">History & Metrics</h1>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{selectedProject} — ข้อมูลสะสมทั้งหมดจาก Database</p>
                </div>
                <div className="flex-1 overflow-auto px-6 py-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4 max-w-2xl">
                            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
                                <h2 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-5">ภาพรวมทั้งหมด</h2>
                                <div className="flex items-center gap-8">
                                    <div className="text-center">
                                        <p className="text-4xl font-bold text-gray-900 dark:text-slate-100">{total}</p>
                                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Total Runs</p>
                                    </div>
                                    <div className="flex gap-6 flex-1 justify-center">
                                        <Ring pct={successPct} color="text-emerald-500" label="Success" value={success} />
                                        <Ring pct={failedPct} color="text-red-500" label="Failed" value={failed} />
                                        <Ring pct={canceledPct} color="text-gray-400" label="Canceled" value={canceled} />
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
                                <h2 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-4">แบ่งตามสถานะ</h2>
                                <div className="flex flex-col gap-2.5">
                                    {[
                                        { label: 'Succeeded', value: success, color: 'bg-emerald-500', pct: successPct },
                                        { label: 'Failed', value: failed, color: 'bg-red-500', pct: failedPct },
                                        { label: 'Canceled', value: canceled, color: 'bg-gray-300 dark:bg-slate-600', pct: canceledPct },
                                        { label: 'Running', value: running, color: 'bg-blue-400', pct: total ? Math.round((running / total) * 100) : 0 },
                                    ].map(row => (
                                        <div key={row.label} className="flex items-center gap-3">
                                            <span className="text-xs text-gray-500 dark:text-slate-400 w-20">{row.label}</span>
                                            <div className="flex-1 bg-gray-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                                                <div className={`h-1.5 rounded-full ${row.color}`}
                                                    style={{ width: `${row.pct}%`, transition: 'width 0.6s ease' }} />
                                            </div>
                                            <span className="text-xs font-medium text-gray-700 dark:text-slate-300 w-8 text-right">{row.value}</span>
                                            <span className="text-[10px] text-gray-400 dark:text-slate-500 w-8">{row.pct}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function HistoryPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-slate-900">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <HistoryContent />
        </Suspense>
    )
}
