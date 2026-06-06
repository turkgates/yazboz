import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase, createGame, fetchPlayers } from '@/lib/supabase'
import { useSettingsStore, useGameStore } from '@/stores/gameStore'
import { ArrowLeft, Plus, Minus, User, Play, Check } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import type { Game, SavedPlayer } from '@/types'
import { PlayerAvatar } from '@/components/PlayerAvatar'

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

  const [savedPlayers, setSavedPlayers] = useState<SavedPlayer[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [manualNames, setManualNames] = useState<string[]>(['', '', '', ''])
  const [useManual, setUseManual] = useState(false)
  const [playerCount, setPlayerCount] = useState(4)
  const [totalRounds, setTotalRounds] = useState(settings.defaultRounds)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: players } = await fetchPlayers(data.user.id)
      setSavedPlayers(players ?? [])
    })
  }, [])

  const togglePlayer = (id: string) => {
    setUseManual(false)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < playerCount) {
        next.add(id)
      }
      return next
    })
  }

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count)
    setSelectedIds((prev) => {
      const arr = [...prev]
      return new Set(arr.slice(0, count))
    })
  }

  const handleManualNameChange = (index: number, value: string) => {
    setUseManual(true)
    setSelectedIds(new Set())
    const updated = [...manualNames]
    updated[index] = value
    setManualNames(updated)
  }

  const getPlayerNames = (): string[] => {
    if (useManual) {
      return manualNames
        .slice(0, playerCount)
        .map((n, i) => n.trim() || `Oyuncu ${i + 1}`)
    }
    const selected = savedPlayers.filter((p) => selectedIds.has(p.id))
    return selected.map((p) => p.name)
  }

  const canStart = () => {
    if (useManual) return true
    return selectedIds.size === playerCount
  }

  const handleStart = async () => {
    const filledNames = getPlayerNames()
    if (!useManual && filledNames.length !== playerCount) {
      setError(`${playerCount} oyuncu seçmelisiniz.`)
      return
    }

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
    } catch (err) {
      console.error('Create game error:', err)
    }

    navigate({ to: '/game/$gameId', params: { gameId } })
    setLoading(false)
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
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

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full overflow-y-auto pb-24">
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

        <div className="mb-5">
          <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
            Oyuncu Sayısı
          </p>
          <div className="flex gap-3">
            {[2, 3, 4].map((count) => (
              <button
                key={count}
                onClick={() => handlePlayerCountChange(count)}
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

        {savedPlayers.length > 0 && (
          <div className="mb-5">
            <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
              Oyuncu Listesinden Seç ({selectedIds.size}/{playerCount})
            </p>
            <div className="flex flex-col gap-2">
              {savedPlayers.map((player) => {
                const selected = selectedIds.has(player.id)
                const disabled = !selected && selectedIds.size >= playerCount
                return (
                  <button
                    key={player.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => togglePlayer(player.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      selected
                        ? 'border-[#e94560] bg-[#e94560]/10'
                        : disabled
                          ? 'border-[#2d3748] bg-[#16213e] opacity-40'
                          : 'border-[#2d3748] bg-[#16213e] hover:border-[#4a5568]'
                    }`}
                  >
                    <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size={36} />
                    <span className="text-white text-sm font-medium flex-1">{player.name}</span>
                    {selected && <Check size={18} className="text-[#e94560]" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="mb-5">
          <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
            {savedPlayers.length > 0 ? 'Veya Manuel İsim Gir' : 'Oyuncu İsimleri'}
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
                  value={manualNames[i]}
                  onChange={(e) => handleManualNameChange(i, e.target.value)}
                  maxLength={20}
                  className="w-full bg-[#16213e] border border-[#2d3748] rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#718096] focus:outline-none focus:border-[#e94560] transition-colors text-sm"
                />
              </motion.div>
            ))}
          </div>
        </div>

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
        </div>

        {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleStart}
          disabled={loading || !canStart()}
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
