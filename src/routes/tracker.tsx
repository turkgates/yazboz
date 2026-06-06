import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/tracker')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: TrackerPage,
})

const STORAGE_KEY = 'yazboz-tile-tracker'

type TileState = 0 | 1 | 2

interface TrackerData {
  black: TileState[][]
  red: TileState[][]
  yellow: TileState[][]
  green: TileState[][]
  fake: TileState[]
}

const COLORS = [
  { key: 'black' as const, label: 'Siyah', bg: 'bg-gray-800', border: 'border-gray-600' },
  { key: 'red' as const, label: 'Kırmızı', bg: 'bg-red-600', border: 'border-red-400' },
  { key: 'yellow' as const, label: 'Sarı', bg: 'bg-yellow-500', border: 'border-yellow-300' },
  { key: 'green' as const, label: 'Mavi/Yeşil', bg: 'bg-teal-600', border: 'border-teal-400' },
]

function createInitialData(): TrackerData {
  const row = () => Array.from({ length: 13 }, () => 0 as TileState)
  return {
    black: [row(), row()],
    red: [row(), row()],
    yellow: [row(), row()],
    green: [row(), row()],
    fake: [0, 0],
  }
}

function loadData(): TrackerData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as TrackerData
  } catch {}
  return createInitialData()
}

function saveData(data: TrackerData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function nextState(current: TileState): TileState {
  return ((current + 1) % 3) as TileState
}

function TrackerPage() {
  const [data, setData] = useState<TrackerData>(createInitialData)

  useEffect(() => {
    setData(loadData())
  }, [])

  const update = (newData: TrackerData) => {
    setData(newData)
    saveData(newData)
  }

  const cycleTile = (colorKey: keyof Omit<TrackerData, 'fake'>, copy: number, num: number) => {
    const next = structuredClone(data)
    next[colorKey][copy][num] = nextState(next[colorKey][copy][num])
    update(next)
  }

  const cycleFake = (index: number) => {
    const next = structuredClone(data)
    next.fake[index] = nextState(next.fake[index])
    update(next)
  }

  const handleReset = () => {
    if (!confirm('Tüm taş takibini sıfırlamak istediğinizden emin misiniz?')) return
    update(createInitialData())
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col pb-20">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-4 max-w-lg mx-auto">
          <h1 className="text-lg font-bold text-white">Taş Takip</h1>
          <button
            type="button"
            onClick={handleReset}
            className="text-sm text-red-400 hover:text-red-300 font-medium px-3 py-1.5 rounded-lg bg-red-500/10"
          >
            Sıfırla
          </button>
        </div>
      </div>

      <div className="flex-1 px-3 py-4 max-w-lg mx-auto w-full space-y-6 overflow-y-auto">
        {COLORS.map(({ key, label, bg, border }) => (
          <section key={key}>
            <h2 className={`text-sm font-bold mb-2 ${label === 'Siyah' ? 'text-gray-300' : label === 'Kırmızı' ? 'text-red-400' : label === 'Sarı' ? 'text-yellow-400' : 'text-teal-400'}`}>
              {label}
            </h2>
            <div className="flex gap-0.5 mb-1 px-0.5">
              {Array.from({ length: 13 }, (_, i) => (
                <span key={i} className="w-11 text-center text-[10px] text-[#718096] shrink-0">
                  {i + 1}
                </span>
              ))}
            </div>
            {[0, 1].map((copy) => (
              <div key={copy} className="flex gap-0.5 mb-1">
                {Array.from({ length: 13 }, (_, num) => (
                  <TileButton
                    key={num}
                    value={num + 1}
                    state={data[key][copy][num]}
                    bg={bg}
                    border={border}
                    onClick={() => cycleTile(key, copy, num)}
                  />
                ))}
              </div>
            ))}
          </section>
        ))}

        <section>
          <h2 className="text-sm font-bold mb-3 text-purple-400">Sahte Okey</h2>
          <div className="flex gap-3">
            {data.fake.map((state, i) => (
              <button
                key={i}
                type="button"
                onClick={() => cycleFake(i)}
                className={`relative w-11 h-11 rounded-lg border-2 border-purple-400 bg-purple-600 flex items-center justify-center text-white text-xs font-bold transition-all ${
                  state === 0 ? 'opacity-100' : state === 1 ? 'opacity-40' : 'opacity-[0.15]'
                }`}
              >
                SAHTE
                {state >= 1 && (
                  <span className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-0.5 bg-white/80 pointer-events-none" />
                )}
                {state >= 2 && (
                  <span className="absolute inset-x-1 top-1/3 -translate-y-1/2 h-0.5 bg-white/80 pointer-events-none" />
                )}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function TileButton({
  value,
  state,
  bg,
  border,
  onClick,
}: {
  value: number
  state: TileState
  bg: string
  border: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-11 h-11 shrink-0 rounded-lg border-2 ${bg} ${border} flex items-center justify-center text-white text-sm font-bold transition-all ${
        state === 0 ? 'opacity-100' : state === 1 ? 'opacity-40' : 'opacity-[0.15]'
      }`}
    >
      {value}
      {state >= 1 && (
        <span className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-0.5 bg-white/80 pointer-events-none" />
      )}
      {state >= 2 && (
        <span className="absolute inset-x-1 top-1/3 -translate-y-1/2 h-0.5 bg-white/80 pointer-events-none" />
      )}
    </button>
  )
}
