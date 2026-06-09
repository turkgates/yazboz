import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { BackButton } from '@/components/layout/BackButton'
import { DiceFace } from '@/components/DiceFace'
import { formatDistanceToNow } from '@/lib/dateUtils'

export const Route = createFileRoute('/dice')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: DicePage,
})

const STORAGE_KEY = 'dice-history'
const MAX_HISTORY = 10

interface DiceHistoryEntry {
  values: number[]
  timestamp: number
}

function loadHistory(): DiceHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DiceHistoryEntry[]
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : []
  } catch {
    return []
  }
}

function saveHistory(entries: DiceHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)))
}

function DicePage() {
  const [zarSayisi, setZarSayisi] = useState<1 | 2>(1)
  const [displayValues, setDisplayValues] = useState<number[]>([1])
  const [isRolling, setIsRolling] = useState(false)
  const [history, setHistory] = useState<DiceHistoryEntry[]>([])

  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  useEffect(() => {
    setDisplayValues(Array.from({ length: zarSayisi }, () => 1))
  }, [zarSayisi])

  const addToHistory = (values: number[]) => {
    const entry: DiceHistoryEntry = { values, timestamp: Date.now() }
    const next = [entry, ...history].slice(0, MAX_HISTORY)
    setHistory(next)
    saveHistory(next)
  }

  const rollDice = () => {
    if (isRolling) return
    setIsRolling(true)

    let count = 0
    const interval = setInterval(() => {
      setDisplayValues(
        Array.from({ length: zarSayisi }, () => Math.floor(Math.random() * 6) + 1)
      )
      count++
      if (count > 10) {
        clearInterval(interval)
        const finals = Array.from(
          { length: zarSayisi },
          () => Math.floor(Math.random() * 6) + 1
        )
        setDisplayValues(finals)
        setIsRolling(false)
        addToHistory(finals)
      }
    }, 50)
  }

  const clearHistory = () => {
    setHistory([])
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center gap-3 py-4 max-w-lg mx-auto">
          <BackButton className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460]" />
          <h1 className="text-lg font-bold text-white">Zar At</h1>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full flex flex-col">
        <div className="flex gap-3 mb-8">
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => !isRolling && setZarSayisi(n)}
              className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                zarSayisi === n
                  ? 'bg-[#e94560] text-white shadow-lg shadow-[#e94560]/20'
                  : 'bg-[#16213e] border border-[#2d3748] text-[#a0aec0]'
              }`}
            >
              {n} Zar
            </button>
          ))}
        </div>

        <div className="flex-1 flex items-center justify-center gap-6 mb-8">
          {displayValues.map((val, i) => (
            <DiceFace
              key={i}
              value={Math.max(1, Math.min(6, val)) as 1 | 2 | 3 | 4 | 5 | 6}
              size={zarSayisi === 1 ? 120 : 100}
              isRolling={isRolling}
            />
          ))}
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={rollDice}
          disabled={isRolling}
          className="w-full bg-[#e94560] hover:bg-[#c73652] disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-lg flex items-center justify-center gap-2 mb-8 shadow-lg shadow-[#e94560]/20"
        >
          🎲 Zar At
        </motion.button>

        {history.length > 0 && (
          <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider">
                Son Atışlar
              </p>
              <button
                type="button"
                onClick={clearHistory}
                className="text-[#718096] text-xs hover:text-red-400 transition-colors"
              >
                Geçmişi Temizle
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {history.map((entry, i) => (
                <div
                  key={`${entry.timestamp}-${i}`}
                  className="flex items-center justify-between py-2 border-b border-[#2d3748]/50 last:border-0"
                >
                  <span className="text-white text-sm">
                    🎲 {entry.values.join(' • ')}
                  </span>
                  <span className="text-[#718096] text-xs shrink-0 ml-2">
                    {formatDistanceToNow(new Date(entry.timestamp).toISOString())}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
