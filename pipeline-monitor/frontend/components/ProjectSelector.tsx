'use client'

import { useEffect, useRef, useState } from 'react'

type Project = {
    id: string
    name: string
}

export default function ProjectSelector({
    projects,
    selected,
    onChange
}: {
    projects: Project[]
    selected: string
    onChange: (name: string) => void
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs border border-gray-200 bg-white hover:bg-gray-50 transition"
            >
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="truncate text-gray-800">{selected}</span>
                </div>
                <span className="text-gray-400 flex-shrink-0">{open ? '▲' : '▼'}</span>
            </button>

            {open && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg overflow-hidden z-50 shadow-sm">
                    {projects.map(p => (
                        <button
                            key={p.id}
                            onClick={() => { onChange(p.name); setOpen(false) }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-50 transition border-b border-gray-100 last:border-0 ${selected === p.name ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                        >
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${selected === p.name ? 'bg-blue-500' : 'bg-gray-300'}`} />
                            <span className="truncate">{p.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}