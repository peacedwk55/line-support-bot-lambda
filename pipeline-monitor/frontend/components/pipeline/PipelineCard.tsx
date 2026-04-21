type Run = {
    id: number
    name: string
    state: string
    result: string
    createdDate: string
    finishedDate: string
    pipeline: { name: string }
}

const badgeStyle: Record<string, string> = {
    succeeded: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    failed: 'bg-red-50 text-red-600 ring-1 ring-red-200',
    canceled: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
    inProgress: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200',
}

const dotColor: Record<string, string> = {
    succeeded: 'bg-emerald-500',
    failed: 'bg-red-500',
    canceled: 'bg-gray-400',
    inProgress: 'bg-blue-500',
}

const glowColor: Record<string, string> = {
    succeeded: '0 0 8px rgba(16,185,129,0.4)',
    failed: '0 0 8px rgba(239,68,68,0.4)',
    canceled: 'none',
    inProgress: '0 0 8px rgba(59,130,246,0.4)',
}

const stageBoxStyle: Record<string, { border: string; bg: string; text: string; dot: string }> = {
    succeeded:          { border: 'border-emerald-500', bg: 'bg-emerald-950/40', text: 'text-emerald-400', dot: 'bg-emerald-500' },
    failed:             { border: 'border-red-500',     bg: 'bg-red-950/40',     text: 'text-red-400',     dot: 'bg-red-500' },
    skipped:            { border: 'border-slate-600',   bg: 'bg-slate-800/60',   text: 'text-slate-400',   dot: 'bg-slate-600' },
    inProgress:         { border: 'border-blue-500',    bg: 'bg-blue-950/40',    text: 'text-blue-400',    dot: 'bg-blue-500' },
    canceled:           { border: 'border-slate-500',   bg: 'bg-slate-800/40',   text: 'text-slate-400',   dot: 'bg-slate-500' },
    partiallySucceeded: { border: 'border-yellow-500',  bg: 'bg-yellow-950/40',  text: 'text-yellow-400',  dot: 'bg-yellow-500' },
}

// fixed sizes — กล่องทุกอันเท่ากัน
const BOX_W = 128
const LINE_W = 20
const BOX_H = 44
const ROW_GAP = 14

function getDuration(start: string, end: string) {
    if (!start || !end) return '-'
    const diff = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)
    const m = Math.floor(diff / 60)
    const s = diff % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function getBranch(sourceBranch: string) {
    if (sourceBranch === 'refs/heads/develop')
        return { label: 'develop', style: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200' }
    if (sourceBranch === 'refs/heads/master')
        return { label: 'master', style: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' }
    if (sourceBranch.startsWith('refs/tags/dev/'))
        return { label: 'dev', style: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200' }
    if (sourceBranch.startsWith('refs/tags/'))
        return { label: 'prod', style: 'bg-purple-50 text-purple-600 ring-1 ring-purple-200' }
    return { label: sourceBranch, style: 'bg-gray-100 text-gray-500' }
}

function isProdStage(name: string, identifier: string) {
    const nameUpper = name.toUpperCase()
    const idUpper = identifier.toUpperCase()
    if (nameUpper.includes('PROD') || nameUpper.includes('PRODUCTION')) return true
    if (idUpper.includes('PROD')) return true
    if (idUpper.includes('HEALTH_CHECK')) return true
    return false
}

function StageBox({ stage }: { stage: any }) {
    const s = stageBoxStyle[stage.result] ?? stageBoxStyle.skipped
    const isSkipped = stage.result === 'skipped'
    const cleanName = stage.name.replace(/[🚀🔔🏗️]/g, '').trim()
    return (
        <div
            className={`flex-shrink-0 flex flex-col justify-center gap-0.5 px-3 py-2 rounded-xl border ${s.border} ${s.bg}`}
            style={{ width: BOX_W, height: BOX_H }}
        >
            <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot} ${stage.result === 'inProgress' ? 'animate-pulse' : ''}`} />
                <span className={`text-[10px] font-semibold truncate ${s.text}`}>{cleanName}</span>
            </div>
            {isSkipped && (
                <span className="text-[9px] pl-3.5 text-slate-500">Skipped</span>
            )}
        </div>
    )
}

function StageFlow({ stages }: { stages: any[] }) {
    const sorted = [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

    // แยก Teams Noti ออกเป็น final stage
    const finalStage = sorted.find(s => s.name.toLowerCase().includes('team'))
    const rest = sorted.filter(s => !s.name.toLowerCase().includes('team'))

    const devStages = rest.filter(s => !isProdStage(s.name, s.identifier ?? ''))
    const prodStages = rest.filter(s => isProdStage(s.name, s.identifier ?? ''))

    // DEV only (ไม่มี prod)
    if (prodStages.length === 0) {
        return (
            <div className="mt-4 flex items-center overflow-x-auto pb-1">
                {devStages.map((stage, i) => (
                    <div key={i} className="flex items-center flex-shrink-0">
                        <StageBox stage={stage} />
                        {(i < devStages.length - 1 || finalStage) && (
                            <div className="flex-shrink-0 h-px bg-slate-600" style={{ width: LINE_W }} />
                        )}
                    </div>
                ))}
                {finalStage && <StageBox stage={finalStage} />}
            </div>
        )
    }

    // DEV + PROD branch + merge to Teams Noti
    const devTotalW = devStages.length * BOX_W + Math.max(0, devStages.length - 1) * LINE_W
    const prodTotalW = prodStages.length * BOX_W + Math.max(0, prodStages.length - 1) * LINE_W

    const buildIndex = devStages.findIndex(s => s.name.toLowerCase().includes('build'))
    const branchAfterCount = buildIndex >= 0 ? buildIndex + 1 : 1
    const branchX = branchAfterCount * BOX_W + (branchAfterCount - 1) * LINE_W
    const prodStartX = branchX + LINE_W
    const prodRightX = prodStartX + prodTotalW

    // merge point: right edge of the longer row + LINE_W
    const mergeX = Math.max(devTotalW, prodRightX) + LINE_W
    const totalW = finalStage ? mergeX + BOX_W : Math.max(devTotalW, prodRightX)
    const totalH = BOX_H + ROW_GAP + BOX_H

    const devCenterY = BOX_H / 2
    const prodCenterY = BOX_H + ROW_GAP + BOX_H / 2
    const finalCenterY = (devCenterY + prodCenterY) / 2
    const finalTop = finalCenterY - BOX_H / 2

    return (
        <div className="mt-4 overflow-x-auto pb-2">
            <div className="relative" style={{ width: totalW, height: totalH }}>

                <svg
                    style={{ position: 'absolute', inset: 0, width: totalW, height: totalH, pointerEvents: 'none', overflow: 'visible' }}
                >
                    {/* Branch: vertical build → PROD */}
                    <line x1={branchX} y1={devCenterY} x2={branchX} y2={prodCenterY} stroke="#475569" strokeWidth={1} />
                    {/* Branch: horizontal to first PROD box */}
                    <line x1={branchX} y1={prodCenterY} x2={prodStartX} y2={prodCenterY} stroke="#475569" strokeWidth={1} />

                    {finalStage && (<>
                        {/* DEV last → merge */}
                        <line x1={devTotalW} y1={devCenterY} x2={mergeX} y2={devCenterY} stroke="#475569" strokeWidth={1} />
                        <line x1={mergeX} y1={devCenterY} x2={mergeX} y2={finalCenterY} stroke="#475569" strokeWidth={1} />
                        {/* PROD last → merge */}
                        <line x1={prodRightX} y1={prodCenterY} x2={mergeX} y2={prodCenterY} stroke="#475569" strokeWidth={1} />
                        <line x1={mergeX} y1={prodCenterY} x2={mergeX} y2={finalCenterY} stroke="#475569" strokeWidth={1} />
                    </>)}
                </svg>

                {/* DEV row */}
                <div className="absolute flex items-center" style={{ top: 0, left: 0 }}>
                    {devStages.map((stage, i) => (
                        <div key={i} className="flex items-center flex-shrink-0">
                            <StageBox stage={stage} />
                            {i < devStages.length - 1 && (
                                <div className="flex-shrink-0 h-px bg-slate-600" style={{ width: LINE_W }} />
                            )}
                        </div>
                    ))}
                </div>

                {/* PROD row */}
                <div className="absolute flex items-center" style={{ top: BOX_H + ROW_GAP, left: prodStartX }}>
                    {prodStages.map((stage, i) => (
                        <div key={i} className="flex items-center flex-shrink-0">
                            <StageBox stage={stage} />
                            {i < prodStages.length - 1 && (
                                <div className="flex-shrink-0 h-px bg-slate-600" style={{ width: LINE_W }} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Final stage: Teams Noti — centered vertically between DEV and PROD */}
                {finalStage && (
                    <div className="absolute" style={{ top: finalTop, left: mergeX }}>
                        <StageBox stage={finalStage} />
                    </div>
                )}

            </div>
        </div>
    )
}

export default function PipelineCard({ run, stages, sourceBranch }: {
    run: Run
    stages: any[]
    sourceBranch: string
}) {
    const statusKey = run.state === 'inProgress' ? 'inProgress' : run.result
    const badge = badgeStyle[statusKey] ?? badgeStyle.canceled
    const label = run.state === 'inProgress' ? 'running' : run.result
    const dot = dotColor[statusKey] ?? 'bg-gray-400'
    const glow = glowColor[statusKey] ?? 'none'
    const branch = getBranch(sourceBranch)

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl px-5 py-4 shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-100 dark:border-slate-700">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot} ${run.state === 'inProgress' ? 'animate-pulse' : ''}`}
                        style={{ boxShadow: glow }}
                    />
                    <span className="text-sm font-semibold text-gray-800 dark:text-slate-100 truncate">{run.pipeline.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${badge}`}>{label}</span>
                    <span className="text-xs text-gray-400 dark:text-slate-500">{getDuration(run.createdDate, run.finishedDate)}</span>
                </div>
            </div>

            <div className="flex items-center gap-2 mt-1.5 pl-5">
                <span className="text-[11px] text-gray-400 dark:text-slate-500">{run.name}</span>
                <span className="text-gray-300 dark:text-slate-600">·</span>
                <span className="text-[11px] text-gray-400 dark:text-slate-500">
                    {new Date(run.createdDate).toLocaleString('th-TH', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    })}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${branch.style}`}>
                    {branch.label}
                </span>
            </div>

            {stages.length > 0 && <StageFlow stages={stages} />}
        </div>
    )
}
