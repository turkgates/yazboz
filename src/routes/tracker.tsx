import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { OkeyTile, type OkeyTileColor } from '@/components/OkeyTile'

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
  fake: TileState
}

const COLORS: {
  key: keyof Omit<TrackerData, 'fake'>
  tileColor: OkeyTileColor
  icon: string
  label: string
}[] = [
  { key: 'black', tileColor: 'black', icon: '⬛', label: 'Siyahlar' },
  { key: 'red', tileColor: 'red', icon: '🔴', label: 'Kırmızılar' },
  { key: 'yellow', tileColor: 'yellow', icon: '🟡', label: 'Sarılar' },
  { key: 'green', tileColor: 'blue', icon: '🔵', label: 'Maviler' },
]

function createInitialData(): TrackerData {
  const row = () => Array.from({ length: 13 }, () => 0 as TileState)
  return { black: row(), red: row(), yellow: row(), green: row(), fake: 0 }
}

function migrateFakeState(val: unknown): TileState {
  if (typeof val === 'number' && val >= 0 && val <= 2) return val as TileState
  if (Array.isArray(val)) {
    const arr = val as TileState[]
    if (arr.some((s) => s >= 2)) return 2
    if (arr.some((s) => s >= 1)) return 1
  }
  return 0
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

  result.fake = migrateFakeState(data.fake)
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

function useLandscape() {
  const [isLandscape, setIsLandscape] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(orientation: landscape)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)')
    const handler = (e: MediaQueryListEvent) => setIsLandscape(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isLandscape
}

function TrackerPage() {
  const [data, setData] = useState<TrackerData>(createInitialData)
  const isLandscape = useLandscape()
  const tileSize = isLandscape ? 'small' : 'normal'

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

  const cycleFake = () => {
    update({ ...data, fake: nextState(data.fake) })
  }

  const handleReset = () => {
    if (!confirm('Tüm taşları sıfırlamak istediğinizden emin misiniz?')) return
    update(createInitialData())
  }

  return (
    <div className="tracker-page min-h-dvh bg-[#1a1a2e] flex flex-col pb-20 overflow-x-hidden w-full max-w-full">
      <div className="tracker-header bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-4 max-w-full mx-auto">
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

      <div className="tracker-content flex-1 px-4 py-4 max-w-full mx-auto w-full overflow-y-auto overflow-x-hidden">
        {COLORS.map(({ key, tileColor, icon, label }) => (
          <section key={key} className="tracker-section">
            <h2 className="tracker-section-title">
              <span className="tracker-section-icon">{icon}</span>
              {label}
            </h2>
            <div className="tile-grid">
              {Array.from({ length: 13 }, (_, num) => (
                <OkeyTile
                  key={num}
                  number={num + 1}
                  color={tileColor}
                  status={data[key][num]}
                  size={tileSize}
                  onClick={() => cycleTile(key, num)}
                />
              ))}
            </div>
          </section>
        ))}

        <section className="tracker-section tracker-section--fake">
          <h2 className="tracker-section-title">
            <span className="tracker-section-icon">★</span>
            Sahte Okey
          </h2>
          <OkeyTile
            number={0}
            color="black"
            status={data.fake}
            size={tileSize}
            isFakeOkey
            onClick={cycleFake}
          />
        </section>
      </div>
    </div>
  )
}
