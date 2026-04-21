type Stage = {
    name: string
    result: string
}

const dotStyle: Record<string, { bg: string; glow: string }> = {
    succeeded: { bg: 'bg-emerald-500', glow: '0 0 6px rgba(16,185,129,0.5)' },
    failed: { bg: 'bg-red-500', glow: '0 0 6px rgba(239,68,68,0.5)' },
    skipped: { bg: 'bg-gray-300', glow: 'none' },
    inProgress: { bg: 'bg-blue-500', glow: '0 0 6px rgba(59,130,246,0.5)' },
    canceled: { bg: 'bg-gray-400', glow: 'none' },
    partiallySucceeded: { bg: 'bg-yellow-400', glow: '0 0 6px rgba(250,204,21,0.5)' },
}

const lineColor: Record<string, string> = {
    succeeded: 'bg-emerald-200',
    failed: 'bg-red-200',
    skipped: 'bg-gray-200',
    inProgress: 'bg-blue-300',
    canceled: 'bg-gray-200',
    partiallySucceeded: 'bg-yellow-200',
}

function Dot({ stage }: { stage: Stage }) {
    const s = dotStyle[stage.result] ?? dotStyle.skipped
    return (
        <div className="flex flex-col items-center gap-1 group relative">
            <div
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.bg}`}
                style={{ boxShadow: s.glow }}
            />
            {/* Tooltip on hover */}
            <span className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                {stage.name.replace(/[🚀🔔]/g, '').trim()}
            </span>
        </div>
    )
}

function Line({ result }: { result: string }) {
    return <div className={`w-4 h-px mt-[5px] flex-shrink-0 ${lineColor[result] ?? 'bg-gray-200'}`} />
}

export default function StageBar({ stages }: { stages: Stage[] }) {
    if (!stages || stages.length === 0) return null

    return (
        <div className="mt-3 pl-1 flex items-start flex-wrap gap-y-1">
            {stages.map((stage, i) => (
                <div key={i} className="flex items-start">
                    <Dot stage={stage} />
                    {i < stages.length - 1 && <Line result={stage.result} />}
                </div>
            ))}
        </div>
    )
}