import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase, createGame, searchPlayersByName, createPlayer } from '@/lib/supabase'
import { useSettingsStore, useGameStore } from '@/stores/gameStore'
import { ArrowLeft, Plus, Minus, User, Play } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import type { Game, GameSubtype, GameType, OkeyYuzbirSettings, SavedPlayer, SayiliOkeySettings } from '@/types'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { DEFAULT_101_SETTINGS, DEFAULT_SAYILI_SETTINGS } from '@/lib/gameTypes'

export const Route = createFileRoute('/new-game')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: NewGamePage,
})

type MainCategory = 'cezali' | 'sayili' | '101'

interface PlayerSlot {
  name: string
  playerId: string | null
}

function NewGamePage() {
  const navigate = useNavigate()
  const { settings: cezaliSettings } = useSettingsStore()
  const { startGame } = useGameStore()

  const [userId, setUserId] = useState<string | null>(null)
  const [category, setCategory] = useState<MainCategory>('cezali')
  const [subtype, setSubtype] = useState<GameSubtype>('solo')
  const [slots, setSlots] = useState<PlayerSlot[]>([
    { name: '', playerId: null },
    { name: '', playerId: null },
    { name: '', playerId: null },
    { name: '', playerId: null },
  ])
  const [playerCount, setPlayerCount] = useState(4)
  const [totalRounds, setTotalRounds] = useState(cezaliSettings.defaultRounds)
  const [sayiliSettings, setSayiliSettings] = useState<SayiliOkeySettings>(DEFAULT_SAYILI_SETTINGS)
  const [yuzbirSettings, setYuzbirSettings] = useState<OkeyYuzbirSettings>(DEFAULT_101_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isEsli = subtype === 'esli'
  const effectivePlayerCount = isEsli ? 4 : playerCount

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id)
    })
  }, [])

  useEffect(() => {
    if (isEsli) setPlayerCount(4)
  }, [isEsli])

  const handleCategoryChange = (cat: MainCategory) => {
    setCategory(cat)
    setSubtype('solo')
    setError('')
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
      .slice(0, effectivePlayerCount)
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
    const gameType: GameType =
      category === 'sayili' ? 'sayili_okey' : category === '101' ? '101_okey' : 'cezali_okey'

    const teams = isEsli
      ? [[filledNames[0], filledNames[1]], [filledNames[2], filledNames[3]]] as string[][]
      : null

    const gameData = {
      id: gameId,
      user_id: user.id,
      game_type: gameType,
      game_subtype: subtype,
      status: 'active' as const,
      total_rounds: category === 'sayili' ? 99 : totalRounds,
      players: filledNames,
      teams,
      katlamali: category === '101' ? yuzbirSettings.katlamali : undefined,
      settings: category === 'sayili'
        ? sayiliSettings
        : category === '101'
          ? yuzbirSettings
          : cezaliSettings,
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

  const subtypeLabel = (_cat: MainCategory, sub: GameSubtype) =>
    sub === 'esli' ? 'Eşli' : 'Tekli'

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
            <p className="text-xs text-[#718096]">Oyun tipi seçin</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full overflow-y-auto pb-24">
        <div className="mb-5">
          <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
            Oyun Tipi
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => handleCategoryChange('cezali')}
              className={`rounded-2xl p-4 border text-left transition-all ${
                category === 'cezali'
                  ? 'bg-[#e94560]/10 border-[#e94560]'
                  : 'bg-[#16213e] border-[#2d3748]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎴</span>
                <div>
                  <p className="text-white font-semibold">Cezalı Okey</p>
                  <p className="text-[#718096] text-xs">Ceza puanı ile oynanan klasik mod</p>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleCategoryChange('sayili')}
              className={`rounded-2xl p-4 border text-left transition-all ${
                category === 'sayili'
                  ? 'bg-[#e94560]/10 border-[#e94560]'
                  : 'bg-[#16213e] border-[#2d3748]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔢</span>
                <div>
                  <p className="text-white font-semibold">Sayılı Okey</p>
                  <p className="text-[#718096] text-xs">Sayı düşürme ile oynanan mod</p>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleCategoryChange('101')}
              className={`rounded-2xl p-4 border text-left transition-all ${
                category === '101'
                  ? 'bg-[#e94560]/10 border-[#e94560]'
                  : 'bg-[#16213e] border-[#2d3748]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">💯</span>
                <div>
                  <p className="text-white font-semibold">101 Okey</p>
                  <p className="text-[#718096] text-xs">Taş toplamlı bitiş sistemi</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="mb-5">
          <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
            {category === 'cezali' ? 'Oyun Şekli' : 'Oyun Tipi'}
          </p>
          <div className="flex gap-3">
            {(['solo', 'esli'] as GameSubtype[]).map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => setSubtype(sub)}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                  subtype === sub
                    ? 'bg-[#e94560] text-white shadow-lg shadow-[#e94560]/20'
                    : 'bg-[#16213e] border border-[#2d3748] text-[#a0aec0]'
                }`}
              >
                {subtypeLabel(category, sub)}
              </button>
            ))}
          </div>
        </div>

        {category === '101' && (
          <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-4 mb-5 space-y-4">
            <SettingRow label="Katlamalı">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setYuzbirSettings((s) => ({ ...s, katlamali: true }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    yuzbirSettings.katlamali ? 'bg-[#e94560] text-white' : 'bg-[#0f3460] text-[#a0aec0]'
                  }`}
                >
                  Var ✓
                </button>
                <button
                  type="button"
                  onClick={() => setYuzbirSettings((s) => ({ ...s, katlamali: false }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    !yuzbirSettings.katlamali ? 'bg-[#e94560] text-white' : 'bg-[#0f3460] text-[#a0aec0]'
                  }`}
                >
                  Yok
                </button>
              </div>
            </SettingRow>
            {yuzbirSettings.katlamali && (
              <p className="text-[#718096] text-xs">
                Her elde açılış için minimum puan bir önceki elki en yüksek açılış + 1 olur.
              </p>
            )}
          </div>
        )}

        {category === 'sayili' && (
          <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-4 mb-5 space-y-4">
            <SettingRow label="Başlangıç Sayısı">
              <NumberStepper
                value={sayiliSettings.startScore}
                min={1}
                max={99}
                onChange={(v) => setSayiliSettings((s) => ({ ...s, startScore: v }))}
              />
            </SettingRow>

            <SettingRow label="Gösterge">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSayiliSettings((s) => ({ ...s, showIndicator: true }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    sayiliSettings.showIndicator
                      ? 'bg-[#e94560] text-white'
                      : 'bg-[#0f3460] text-[#a0aec0]'
                  }`}
                >
                  Var ✓
                </button>
                <button
                  type="button"
                  onClick={() => setSayiliSettings((s) => ({ ...s, showIndicator: false }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    !sayiliSettings.showIndicator
                      ? 'bg-[#e94560] text-white'
                      : 'bg-[#0f3460] text-[#a0aec0]'
                  }`}
                >
                  Yok
                </button>
              </div>
            </SettingRow>

            {sayiliSettings.showIndicator && (
              <SettingRow label="Gösterge Düşüş">
                <NumberStepper
                  value={sayiliSettings.indicatorValue}
                  min={1}
                  max={10}
                  onChange={(v) => setSayiliSettings((s) => ({ ...s, indicatorValue: v }))}
                />
              </SettingRow>
            )}

            <div className="border-t border-[#2d3748] pt-3 space-y-3">
              <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider">
                Puan Düşme Değerleri
              </p>
              <SettingRow label="Normal Bitiş">
                <NumberStepper
                  value={sayiliSettings.normalFinish}
                  min={1}
                  max={20}
                  onChange={(v) => setSayiliSettings((s) => ({ ...s, normalFinish: v }))}
                />
              </SettingRow>
              <SettingRow label="Okey / Çiftten">
                <NumberStepper
                  value={sayiliSettings.okeyOrDouble}
                  min={1}
                  max={20}
                  onChange={(v) => setSayiliSettings((s) => ({ ...s, okeyOrDouble: v }))}
                />
              </SettingRow>
              <SettingRow label="Okey + Çiftten">
                <NumberStepper
                  value={sayiliSettings.okeyAndDouble}
                  min={1}
                  max={30}
                  onChange={(v) => setSayiliSettings((s) => ({ ...s, okeyAndDouble: v }))}
                />
              </SettingRow>
            </div>
          </div>
        )}

        {!isEsli && (
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
        )}

        <div className="mb-5">
          <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
            {isEsli ? 'Oyuncular (4 kişi, 2 takım)' : 'Oyuncu İsimleri'}
          </p>
          {isEsli && (
            <div className="flex gap-2 mb-3">
              <span className="flex-1 text-center text-[10px] text-[#718096] font-semibold bg-[#0f3460]/50 py-1 rounded-lg">
                Takım 1
              </span>
              <span className="flex-1 text-center text-[10px] text-[#718096] font-semibold bg-[#0f3460]/50 py-1 rounded-lg">
                Takım 2
              </span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {Array.from({ length: effectivePlayerCount }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                {isEsli && (
                  <p className="text-[#718096] text-[10px] mb-1 ml-1">
                    {i < 2 ? 'Takım 1' : 'Takım 2'} — Oyuncu {(i % 2) + 1}
                  </p>
                )}
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

        {(category === 'cezali' || category === '101') && (
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
        )}

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

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#a0aec0] text-sm">{label}</span>
      {children}
    </div>
  )
}

function NumberStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-lg bg-[#0f3460] text-white flex items-center justify-center"
      >
        <Minus size={14} />
      </button>
      <span className="text-white font-bold w-8 text-center">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-lg bg-[#0f3460] text-white flex items-center justify-center"
      >
        <Plus size={14} />
      </button>
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
