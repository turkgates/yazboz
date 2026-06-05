import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase, createGame } from '@/lib/supabase'
import { useSettingsStore, useGameStore } from '@/stores/gameStore'
import { ArrowLeft, Plus, Minus, User, Play } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import type { Game } from '@/types'

export const Route = createFileRoute('/new-game')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: NewGamePage,
})

function NewGamePage() {
  const navigate = useNavigate()
  const { settings } = useSettingsStore()
  const { startGame } = useGameStore()

  const [playerCount, setPlayerCount] = useState(4)
  const [playerNames, setPlayerNames] = useState(['', '', '', ''])
  const [totalRounds, setTotalRounds] = useState(settings.defaultRounds)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handlePlayerNameChange = (index: number, value: string) => {
    const updated = [...playerNames]
    updated[index] = value
    setPlayerNames(updated)
  }

  const handleStart = async () => {
    const activePlayers = playerNames.slice(0, playerCount)
    const filledNames = activePlayers.map((n, i) => n.trim() || `Oyuncu ${i + 1}`)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      navigate({ to: '/auth' })
      return
    }

    setLoading(true)
    setError('')

    const gameId = uuidv4()
    const gameData = {
      id: gameId,
      user_id: user.id,
      game_type: 'cezali_okey' as const,
      status: 'active' as const,
      total_rounds: totalRounds,
      players: filledNames,
      settings,
      finished_at: null,
    }

    const localGame: Game = {
      ...gameData,
      created_at: new Date().toISOString(),
    }

    startGame(localGame)

    try {
      await createGame(gameData)
    } catch {
      // Offline: devam et, sonra sync edilecek
    }

    navigate({ to: '/game/$gameId', params: { gameId } })
    setLoading(false)
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      {/* Header */}
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center gap-3 py-4 max-w-lg mx-auto">
          <button
            onClick={() => navigate({ to: '/home' })}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0]"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">Yeni Oyun</h1>
            <p className="text-xs text-[#718096]">Cezalı Okey</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full overflow-y-auto">
        {/* Game Type */}
        <div className="bg-[#16213e] border border-[#e94560]/30 rounded-2xl p-4 mb-5">
          <p className="text-xs text-[#718096] mb-2 uppercase tracking-wider">Oyun Tipi</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎴</span>
            <div>
              <p className="text-white font-semibold">Cezalı Okey</p>
              <p className="text-[#718096] text-xs">Türkiye'nin en sevilen kart oyunu</p>
            </div>
          </div>
        </div>

        {/* Player Count */}
        <div className="mb-5">
          <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
            Oyuncu Sayısı
          </p>
          <div className="flex gap-3">
            {[2, 3, 4].map((count) => (
              <button
                key={count}
                onClick={() => setPlayerCount(count)}
                className={`flex-1 py-3 rounded-xl font-bold text-lg transition-all ${
                  playerCount === count
                    ? 'bg-[#e94560] text-white shadow-lg shadow-[#e94560]/20'
                    : 'bg-[#16213e] border border-[#2d3748] text-[#a0aec0]'
                }`}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        {/* Player Names */}
        <div className="mb-5">
          <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
            Oyuncu İsimleri
          </p>
          <div className="flex flex-col gap-2">
            {Array.from({ length: playerCount }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="relative"
              >
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096]" />
                <input
                  type="text"
                  placeholder={`Oyuncu ${i + 1}`}
                  value={playerNames[i]}
                  onChange={(e) => handlePlayerNameChange(i, e.target.value)}
                  maxLength={20}
                  className="w-full bg-[#16213e] border border-[#2d3748] rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#718096] focus:outline-none focus:border-[#e94560] transition-colors text-sm"
                />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Round Count */}
        <div className="mb-8">
          <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
            El Sayısı
          </p>
          <div className="bg-[#16213e] border border-[#2d3748] rounded-xl p-4 flex items-center justify-between">
            <button
              onClick={() => setTotalRounds(Math.max(5, totalRounds - 1))}
              className="w-10 h-10 rounded-lg bg-[#0f3460] text-white flex items-center justify-center active:scale-95 transition-transform"
            >
              <Minus size={18} />
            </button>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{totalRounds}</p>
              <p className="text-[#718096] text-xs">el</p>
            </div>
            <button
              onClick={() => setTotalRounds(Math.min(21, totalRounds + 1))}
              className="w-10 h-10 rounded-lg bg-[#0f3460] text-white flex items-center justify-center active:scale-95 transition-transform"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="flex justify-between mt-2 px-1">
            {[5, 7, 9, 11, 13, 15, 21].map((n) => (
              <button
                key={n}
                onClick={() => setTotalRounds(n)}
                className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                  totalRounds === n ? 'text-[#e94560] font-semibold' : 'text-[#718096]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm mb-4 text-center">{error}</p>
        )}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleStart}
          disabled={loading}
          className="w-full bg-[#e94560] hover:bg-[#c73652] disabled:opacity-60 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 text-lg shadow-lg shadow-[#e94560]/20 transition-colors"
        >
          {loading ? (
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Play size={22} />
              Oyunu Başlat
            </>
          )}
        </motion.button>
      </div>
    </div>
  )
}
