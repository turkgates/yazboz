import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase, createGame, searchPlayersByName, createPlayer } from '@/lib/supabase'
import { useSettingsStore, useGameStore } from '@/stores/gameStore'
import { ArrowLeft, Plus, Minus, User, Play } from 'lucide-react'
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

interface PlayerSlot {
  name: string
  playerId: string | null
}

function NewGamePage() {
  const navigate = useNavigate()
  const { settings } = useSettingsStore()
  const { startGame } = useGameStore()

  const [userId, setUserId] = useState<string | null>(null)
  const [slots, setSlots] = useState<PlayerSlot[]>([
    { name: '', playerId: null },
    { name: '', playerId: null },
    { name: '', playerId: null },
    { name: '', playerId: null },
  ])
  const [playerCount, setPlayerCount] = useState(4)
  const [totalRounds, setTotalRounds] = useState(settings.defaultRounds)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id)
    })
  }, [])

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count)
  }

  const updateSlot = (index: number, update: Partial<PlayerSlot>) => {
    setSlots((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...update }
      return next
    })
  }

  const getPlayerNames = (): string[] =>
    slots
      .slice(0, playerCount)
      .map((s, i) => s.name.trim() || `Oyuncu ${i + 1}`)

  const handleStart = async () => {
    const filledNames = getPlayerNames()

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
              >
                <PlayerAutocompleteInput
                  index={i}
                  value={slots[i].name}
                  playerId={slots[i].playerId}
                  userId={userId}
                  onChange={(name, playerId) => updateSlot(i, { name, playerId })}
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

function PlayerAutocompleteInput({
  index,
  value,
  playerId,
  userId,
  onChange,
}: {
  index: number
  value: string
  playerId: string | null
  userId: string | null
  onChange: (name: string, playerId: string | null) => void
}) {
  const [suggestions, setSuggestions] = useState<Pick<SavedPlayer, 'id' | 'name' | 'avatar_url'>[]>([])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const search = (query: string) => {
    if (!userId || !query.trim()) {
      setSuggestions([])
      return
    }
    searchPlayersByName(userId, query.trim(), 5).then(({ data }) => {
      setSuggestions(data ?? [])
    })
  }

  const handleInputChange = (text: string) => {
    onChange(text, null)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(text), 200)
  }

  const handleSelect = (player: Pick<SavedPlayer, 'id' | 'name' | 'avatar_url'>) => {
    onChange(player.name, player.id)
    setOpen(false)
    setSuggestions([])
  }

  const handleCreate = async () => {
    if (!userId || !value.trim() || creating) return
    setCreating(true)
    const newId = uuidv4()
    const { data, error } = await createPlayer({
      id: newId,
      user_id: userId,
      name: value.trim(),
      avatar_url: null,
    })
    setCreating(false)
    if (data) {
      onChange(data.name, data.id)
      setOpen(false)
      setSuggestions([])
    } else {
      console.error('Create player error:', error)
    }
  }

  const trimmed = value.trim()
  const hasExactMatch = suggestions.some(
    (s) => s.name.toLowerCase() === trimmed.toLowerCase()
  )
  const showCreateOption = trimmed.length > 0 && !hasExactMatch

  return (
    <div ref={containerRef} className="relative">
      <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096] z-10" />
      <input
        type="text"
        placeholder={`Oyuncu ${index + 1}`}
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          setOpen(true)
          if (value.trim()) search(value)
        }}
        maxLength={20}
        className="w-full bg-[#16213e] border border-[#2d3748] rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#718096] focus:outline-none focus:border-[#e94560] transition-colors text-sm"
      />
      {open && trimmed.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-[#16213e] border border-[#2d3748] rounded-xl overflow-hidden z-20 shadow-xl">
          {suggestions.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => handleSelect(player)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#0f3460] transition-colors ${
                playerId === player.id ? 'bg-[#e94560]/10' : ''
              }`}
            >
              <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size={28} />
              <span className="text-white text-sm">{player.name}</span>
            </button>
          ))}
          {showCreateOption && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-[#e94560] hover:bg-[#0f3460] border-t border-[#2d3748] text-sm font-medium disabled:opacity-50"
            >
              {creating ? (
                <div className="w-4 h-4 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Plus size={16} />
              )}
              + &apos;{trimmed}&apos; oyuncusunu kaydet
            </button>
          )}
          {suggestions.length === 0 && !showCreateOption && (
            <p className="px-3 py-2.5 text-[#718096] text-sm">Eşleşme yok</p>
          )}
        </div>
      )}
    </div>
  )
}
