import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase, createPlayer, getSessionUser, getLocalSession, fetchPlayers } from '@/lib/supabase'
import { fetchGroupMembers, fetchPlayerSuggestionsWithSocial } from '@/lib/socialSupabase'
import { useSettingsStore, useGameStore } from '@/stores/gameStore'
import { ArrowLeft, ChevronDown, Plus, Minus, User, Play } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { syncCreateGame } from '@/lib/gameSync'
import type { Game, GameSubtype, GameType, OkeyYuzbirSettings, SavedPlayer, SayiliOkeySettings } from '@/types'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { DEFAULT_101_SETTINGS, DEFAULT_SAYILI_SETTINGS } from '@/lib/gameTypes'
import { GameRulesModal } from '@/components/GameRulesModal'
import type { GameRulesKey } from '@/lib/gameRules'

export const Route = createFileRoute('/new-game')({
  validateSearch: (search: Record<string, unknown>): { group?: string } => ({
    group: typeof search.group === 'string' ? search.group : undefined,
  }),
  beforeLoad: async () => {
    const session = await getLocalSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: NewGamePage,
})

type MainCategory = 'cezali' | 'sayili' | '101' | 'bankolu'

const MAX_PLAYERS = 4
const PLAYERS_CACHE_KEY = 'yazboz-players-cache'

const GAME_TYPES: {
  key: MainCategory
  emoji: string
  label: string
  description: string
  rules: GameRulesKey
}[] = [
  { key: 'cezali', emoji: '🎴', label: 'Cezalı Okey', description: 'Ceza puanıyla oynanan klasik mod', rules: 'cezali_okey' },
  { key: 'sayili', emoji: '🔢', label: 'Sayılı Okey', description: 'Sayı düşürerek oynanan mod', rules: 'sayili_okey' },
  { key: 'bankolu', emoji: '💥', label: 'Bankolu', description: 'Banko zorunlu cezalı mod', rules: 'bankolu_cezali_okey' },
  { key: '101', emoji: '💯', label: '101 Okey', description: 'Taş toplamlı bitiş sistemi', rules: 'yuzbir_okey' },
]

interface PlayerSlot {
  name: string
  playerId: string | null
}

function NewGamePage() {
  const navigate = useNavigate()
  const { group: groupId } = Route.useSearch()
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
  const [winnersCount, setWinnersCount] = useState(2)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showRules, setShowRules] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [rulesGameType, setRulesGameType] = useState<GameRulesKey>('cezali_okey')

  const isEsli = subtype === 'esli'
  const effectivePlayerCount = isEsli ? 4 : playerCount

  useEffect(() => {
    getSessionUser().then(async ({ data }) => {
      if (!data.user) return
      setUserId(data.user.id)
      if (!navigator.onLine) return
      // İnternetsizken de kayıtlı oyuncular önerilebilsin
      const { data: players } = await fetchPlayers(data.user.id)
      if (players) localStorage.setItem(PLAYERS_CACHE_KEY, JSON.stringify(players))
    })
  }, [])

  useEffect(() => {
    if (isEsli) setPlayerCount(4)
  }, [isEsli])

  // Gruptan başlatılan oyunda üyeler hazır gelir, kişi kendini ilk sırada görür
  useEffect(() => {
    if (!groupId || !navigator.onLine) return
    const fillFromGroup = async () => {
      const [{ data: { user } }, { data: members }] = await Promise.all([
        supabase.auth.getUser(),
        fetchGroupMembers(groupId),
      ])
      const names = [...members]
        .sort((a, b) => Number(b.user_id === user?.id) - Number(a.user_id === user?.id))
        .map((m) => m.profiles?.display_name?.trim())
        .filter((name): name is string => !!name)
        .slice(0, MAX_PLAYERS)
      if (names.length < 2) return

      setPlayerCount(names.length)
      setSlots((prev) => prev.map((slot, i) => ({ ...slot, name: names[i] ?? '' })))
    }
    fillFromGroup()
  }, [groupId])

  const handleCategoryChange = (cat: MainCategory) => {
    setCategory(cat)
    setSubtype('solo')
    setError('')
  }

  const updateSlot = (index: number, update: Partial<PlayerSlot>) => {
    setError('')
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

    // Skorlar isimle tutulduğu için aynı isim iki oyuncunun puanını birbirine yazar
    if (new Set(filledNames.map((n) => n.toLocaleLowerCase('tr'))).size !== filledNames.length) {
      setError('Aynı isim iki kez kullanılamaz')
      return
    }

    const { data: { user } } = await getSessionUser()
    if (!user) {
      navigate({ to: '/auth' })
      return
    }

    setLoading(true)
    setError('')

    const gameId = uuidv4()
    const gameType: GameType =
      category === 'sayili'
        ? 'sayili_okey'
        : category === '101'
          ? '101_okey'
          : category === 'bankolu'
            ? 'bankolu_cezali_okey'
            : 'cezali_okey'

    const teams = isEsli
      ? [[filledNames[0], filledNames[1]], [filledNames[2], filledNames[3]]] as string[][]
      : null

    const gameData = {
      id: gameId,
      user_id: user.id,
      recorded_by: user.id,
      game_type: gameType,
      game_subtype: subtype,
      status: 'active' as const,
      total_rounds: category === 'sayili' ? 99 : totalRounds,
      players: filledNames,
      teams,
      katlamali: category === '101' ? yuzbirSettings.katlamali : undefined,
      banko_history: category === 'bankolu' ? {} : undefined,
      settings: category === 'sayili'
        ? { ...sayiliSettings, winnersCount }
        : category === '101'
          ? { ...yuzbirSettings, winnersCount }
          : { ...cezaliSettings, winnersCount },
      finished_at: null,
    }

    const localGame: Game = {
      ...gameData,
      created_at: new Date().toISOString(),
    }

    const { error: createError } = await syncCreateGame(gameData)

    if (createError) {
      console.error('Create game error:', createError)
      setError('Oyun başlatılamadı: ' + createError.message)
      setLoading(false)
      return
    }

    startGame(localGame)
    navigate({ to: '/game/$gameId', params: { gameId } })
    setLoading(false)
  }

  const selectedType = GAME_TYPES.find((t) => t.key === category)!

  const settingsSummary = [
    category === 'sayili' ? `Başlangıç ${sayiliSettings.startScore}` : `${totalRounds} el`,
    `${winnersCount} kazanan`,
    ...(category === '101' && yuzbirSettings.katlamali ? ['Katlamalı'] : []),
  ].join(' · ')

  const renderPlayerInput = (i: number) => (
    <PlayerAutocompleteInput
      key={i}
      index={i}
      value={slots[i].name}
      playerId={slots[i].playerId}
      userId={userId}
      onChange={(name, playerId) => updateSlot(i, { name, playerId })}
    />
  )

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center gap-3 py-3 max-w-lg mx-auto">
          <button
            onClick={() => navigate({ to: '/home' })}
            aria-label="Geri"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0]"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-bold text-white">Yeni Oyun</h1>
        </div>
      </div>

      <div className="flex-1 px-4 pt-4 pb-32 max-w-lg mx-auto w-full space-y-5">
        <section>
          <div className="grid grid-cols-2 gap-2">
            {GAME_TYPES.map((type) => {
              const isSelected = category === type.key
              return (
                <button
                  key={type.key}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleCategoryChange(type.key)}
                  className={`h-14 px-3 rounded-2xl border flex items-center gap-2.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-[#e94560]/15 border-[#e94560]'
                      : 'bg-[#16213e] border-[#2d3748]'
                  }`}
                >
                  <span className="text-xl">{type.emoji}</span>
                  <span className="text-white text-sm font-semibold leading-tight">{type.label}</span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between gap-3 mt-2 px-1">
            <p className="text-[#718096] text-xs">{selectedType.description}</p>
            <button
              type="button"
              onClick={() => {
                setRulesGameType(selectedType.rules)
                setShowRules(true)
              }}
              className="text-[#a0aec0] text-xs font-medium underline underline-offset-2 shrink-0"
            >
              Kurallar
            </button>
          </div>
        </section>

        <Segmented
          options={[
            { value: 'solo' as GameSubtype, label: 'Tekli' },
            { value: 'esli' as GameSubtype, label: 'Eşli' },
          ]}
          value={subtype}
          onChange={setSubtype}
        />

        <section>
          <div className="flex items-center justify-between mb-2 min-h-8">
            <p className="text-[#a0aec0] text-sm font-medium">Oyuncular</p>
            {!isEsli && (
              <div className="w-32">
                <Segmented
                  size="sm"
                  options={[2, 3, 4].map((count) => ({ value: count, label: String(count) }))}
                  value={playerCount}
                  onChange={setPlayerCount}
                />
              </div>
            )}
          </div>

          {isEsli ? (
            <div className="flex flex-col gap-3">
              {[0, 1].map((team) => (
                <div key={team} className="flex flex-col gap-2">
                  <p className="text-[#718096] text-xs font-medium px-1">Takım {team + 1}</p>
                  {renderPlayerInput(team * 2)}
                  {renderPlayerInput(team * 2 + 1)}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {Array.from({ length: effectivePlayerCount }).map((_, i) => renderPlayerInput(i))}
            </div>
          )}
        </section>

        <section className="bg-[#16213e] border border-[#2d3748] rounded-2xl overflow-hidden">
          <button
            type="button"
            aria-expanded={showSettings}
            onClick={() => setShowSettings(!showSettings)}
            className="w-full min-h-12 px-4 flex items-center justify-between gap-3 text-left"
          >
            <span className="text-white text-sm font-medium">Ayarlar</span>
            <span className="flex items-center gap-2 text-[#718096] text-xs min-w-0">
              <span className="truncate">{settingsSummary}</span>
              <ChevronDown size={16} className={`shrink-0 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
            </span>
          </button>

          {showSettings && (
            <div className="px-4 pb-4 pt-1 space-y-4 border-t border-[#2d3748]">
              <div className="pt-3 space-y-4">
                {category !== 'sayili' && (
                  <SettingRow label="El sayısı">
                    <NumberStepper value={totalRounds} min={5} max={21} onChange={setTotalRounds} />
                  </SettingRow>
                )}

                <SettingRow label="Kaç kişi kazanır?">
                  <NumberStepper value={winnersCount} min={1} max={3} onChange={setWinnersCount} />
                </SettingRow>

                {category === '101' && (
                  <>
                    <SettingRow label="Katlamalı">
                      <OnOffToggle
                        value={yuzbirSettings.katlamali}
                        onChange={(katlamali) => setYuzbirSettings((s) => ({ ...s, katlamali }))}
                      />
                    </SettingRow>
                    {yuzbirSettings.katlamali && (
                      <p className="text-[#718096] text-xs">
                        Her elde en az, önceki elin en yüksek açılışının 1 fazlasıyla açılır.
                      </p>
                    )}
                  </>
                )}

                {category === 'sayili' && (
                  <>
                    <SettingRow label="Başlangıç sayısı">
                      <NumberStepper
                        value={sayiliSettings.startScore}
                        min={1}
                        max={99}
                        onChange={(v) => setSayiliSettings((s) => ({ ...s, startScore: v }))}
                      />
                    </SettingRow>
                    <SettingRow label="Gösterge">
                      <OnOffToggle
                        value={sayiliSettings.showIndicator}
                        onChange={(showIndicator) => setSayiliSettings((s) => ({ ...s, showIndicator }))}
                      />
                    </SettingRow>
                    {sayiliSettings.showIndicator && (
                      <SettingRow label="Gösterge düşüşü">
                        <NumberStepper
                          value={sayiliSettings.indicatorValue}
                          min={1}
                          max={10}
                          onChange={(v) => setSayiliSettings((s) => ({ ...s, indicatorValue: v }))}
                        />
                      </SettingRow>
                    )}
                    <SettingRow label="Normal bitiş">
                      <NumberStepper
                        value={sayiliSettings.normalFinish}
                        min={1}
                        max={20}
                        onChange={(v) => setSayiliSettings((s) => ({ ...s, normalFinish: v }))}
                      />
                    </SettingRow>
                    <SettingRow label="Okey veya çiftten">
                      <NumberStepper
                        value={sayiliSettings.okeyOrDouble}
                        min={1}
                        max={20}
                        onChange={(v) => setSayiliSettings((s) => ({ ...s, okeyOrDouble: v }))}
                      />
                    </SettingRow>
                    <SettingRow label="Okey ve çiftten">
                      <NumberStepper
                        value={sayiliSettings.okeyAndDouble}
                        min={1}
                        max={30}
                        onChange={(v) => setSayiliSettings((s) => ({ ...s, okeyAndDouble: v }))}
                      />
                    </SettingRow>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-10 bg-[#1a1a2e]/95 backdrop-blur border-t border-[#2d3748] safe-bottom">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-4">
          {error && <p className="text-red-400 text-sm mb-2 text-center">{error}</p>}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleStart}
            disabled={loading}
            className="w-full h-14 bg-[#e94560] hover:bg-[#c73652] disabled:opacity-60 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-base shadow-lg shadow-[#e94560]/20 transition-colors"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Play size={20} />
                Oyunu Başlat
              </>
            )}
          </motion.button>
        </div>
      </div>

      <GameRulesModal
        gameType={rulesGameType}
        isOpen={showRules}
        onClose={() => setShowRules(false)}
      />
    </div>
  )
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  size?: 'md' | 'sm'
}) {
  return (
    <div className="flex gap-1 p-1 bg-[#16213e] border border-[#2d3748] rounded-xl">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-lg font-semibold transition-colors ${
            size === 'sm' ? 'h-7 text-xs' : 'h-10 text-sm'
          } ${value === option.value ? 'bg-[#e94560] text-white' : 'text-[#a0aec0]'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function OnOffToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`w-12 h-7 rounded-full p-0.5 transition-colors ${value ? 'bg-[#e94560]' : 'bg-[#2d3748]'}`}
    >
      <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
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

interface SuggestionItem {
  id?: string
  name: string
  avatar_url?: string | null
  isGroupMember?: boolean
  groupName?: string
  isFriend?: boolean
  isSelf?: boolean
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
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
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

    if (!navigator.onLine) {
      const cached = JSON.parse(localStorage.getItem(PLAYERS_CACHE_KEY) ?? '[]') as SavedPlayer[]
      const lower = query.trim().toLowerCase()
      setSuggestions(
        cached
          .filter((p) => p.name.toLowerCase().includes(lower))
          .map((p) => ({ id: p.id, name: p.name, avatar_url: p.avatar_url }))
      )
      return
    }

    fetchPlayerSuggestionsWithSocial(userId, query.trim()).then((results) => {
      setSuggestions(
        results.map((r) => ({
          id: r.id,
          name: r.name,
          avatar_url: r.avatarUrl,
          isGroupMember: r.isGroupMember,
          groupName: r.groupName,
          isFriend: r.isFriend,
          isSelf: r.isSelf,
        }))
      )
    })
  }

  const handleInputChange = (text: string) => {
    onChange(text, null)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(text), 200)
  }

  const handleSelect = (s: SuggestionItem) => {
    onChange(s.name, s.id ?? null)
    setOpen(false)
    setSuggestions([])
  }

  const handleCreate = async () => {
    if (!userId || !value.trim() || creating) return
    setCreating(true)
    const newId = uuidv4()
    const { data, error } = await createPlayer({ id: newId, user_id: userId, name: value.trim(), avatar_url: null })
    setCreating(false)
    if (data) { onChange(data.name, data.id); setOpen(false); setSuggestions([]) }
    else console.error('Create player error:', error)
  }

  const trimmed = value.trim()
  const hasExactMatch = suggestions.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())
  const showCreateOption = trimmed.length > 0 && !hasExactMatch && navigator.onLine

  return (
    <div ref={containerRef} className="relative">
      <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096] z-10" />
      <input
        type="text"
        placeholder={`Oyuncu ${index + 1}`}
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => { setOpen(true); if (value.trim()) search(value) }}
        maxLength={20}
        className="w-full bg-[#16213e] border border-[#2d3748] rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#718096] focus:outline-none focus:border-[#e94560] transition-colors text-sm"
      />
      {open && trimmed.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-[#16213e] border border-[#2d3748] rounded-xl overflow-hidden z-20 shadow-xl">
          {suggestions.map((s, i) => (
            <button
              key={s.id ?? `${s.name}-${i}`}
              type="button"
              onClick={() => handleSelect(s)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#0f3460] transition-colors ${
                playerId && playerId === s.id ? 'bg-[#e94560]/10' : ''
              }`}
            >
              <PlayerAvatar name={s.name} avatarUrl={s.avatar_url} size={28} />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm">{s.name}</p>
                {s.isSelf && (
                  <p className="text-[#e94560] text-[10px]">Sen</p>
                )}
                {s.isFriend && !s.isSelf && (
                  <p className="text-[#718096] text-[10px]">Arkadaş ✓</p>
                )}
                {s.isGroupMember && s.groupName && (
                  <p className="text-[#718096] text-[10px] flex items-center gap-1">
                    👥 {s.groupName}
                  </p>
                )}
              </div>
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
          {suggestions.length === 0 && !showCreateOption && navigator.onLine && (
            <p className="px-3 py-2.5 text-[#718096] text-sm">Eşleşme yok</p>
          )}
        </div>
      )}
    </div>
  )
}
