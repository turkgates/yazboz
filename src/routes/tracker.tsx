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

const STORAGE_KEY = 'okey-tracker-state'

type TileState = 0 | 1 | 2

interface TrackerData {
  black: TileState[]
  red: TileState[]
  yellow: TileState[]
  green: TileState[]
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
  return { black: row(), red: row(), yellow: row(), green: row(), fake: [0, 0] }
}

function migrateData(raw: unknown): TrackerData {
  const initial = createInitialData()
  if (!raw || typeof raw !== 'object') return initial

  const data = raw as Record<string, unknown>
  const result = { ...initial }

  for (const key of ['black', 'red', 'yellow', 'green'] as const) {
    const val = data[key]
    if (Array.isArray(val)) {
      if (Array.isArray(val[0])) {
        result[key] = (val[0] as TileState[]).slice(0, 13)
        while (result[key].length < 13) result[key].push(0)
      } else if (val.length === 13) {
        result[key] = val as TileState[]
      }
    }
  }

  if (Array.isArray(data.fake) && data.fake.length === 2) {
    result.fake = data.fake as TileState[]
  }

  return result
}

function loadData(): TrackerData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return migrateData(JSON.parse(raw))
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

  const cycleTile = (colorKey: keyof Omit<TrackerData, 'fake'>, num: number) => {
    const next = { ...data, [colorKey]: [...data[colorKey]] }
    next[colorKey][num] = nextState(next[colorKey][num])
    update(next)
  }

  const cycleFake = (index: number) => {
    const next = { ...data, fake: [...data.fake] as TileState[] }
    next.fake[index] = nextState(next.fake[index])
    update(next)
  }

  const handleReset = () => {
    if (!confirm('Tüm taşları sıfırlamak istediğinizden emin misiniz?')) return
    update(createInitialData())
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col pb-20 overflow-x-hidden">
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

      <div className="flex-1 px-4 py-4 max-w-lg mx-auto w-full space-y-6 overflow-y-auto overflow-x-hidden">
        {COLORS.map(({ key, label, bg, border }) => (
          <section key={key} className="overflow-x-hidden">
            <h2
              className={`text-sm font-bold mb-3 ${
                label === 'Siyah'
                  ? 'text-gray-300'
                  : label === 'Kırmızı'
                    ? 'text-red-400'
                    : label === 'Sarı'
                      ? 'text-yellow-400'
                      : 'text-teal-400'
              }`}
            >
              {label}
            </h2>
            <div className="tile-grid">
              {Array.from({ length: 13 }, (_, num) => (
                <TileButton
                  key={num}
                  value={num + 1}
                  state={data[key][num]}
                  bg={bg}
                  border={border}
                  onClick={() => cycleTile(key, num)}
                />
              ))}
            </div>
          </section>
        ))}

        <section className="overflow-x-hidden">
          <h2 className="text-sm font-bold mb-3 text-purple-400">Sahte Okey</h2>
          <div className="tile-grid">
            {data.fake.map((state, i) => (
              <button
                key={i}
                type="button"
                onClick={() => cycleFake(i)}
                className={`tile-btn rounded-lg border-2 border-purple-400 bg-purple-600 flex items-center justify-center text-white text-[10px] font-bold transition-all ${
                  state === 0 ? '' : state === 1 ? 'tile-btn--state-1' : 'tile-btn--state-2'
                }`}
              >
                <span className="tile-num">SAHTE</span>
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
      className={`tile-btn rounded-lg border-2 ${bg} ${border} flex items-center justify-center text-white text-sm font-bold transition-all ${
        state === 0 ? '' : state === 1 ? 'tile-btn--state-1' : 'tile-btn--state-2'
      }`}
    >
      <span className="tile-num">{value}</span>
    </button>
  )
}
