import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { Color, Game, Round, RoundInput, CezaliGameSettings } from '@/types'
import { COLOR_LABELS, DEFAULT_SETTINGS } from '@/types'
import { isCezaliSettings, teamLabel } from '@/lib/gameTypes'
import type { PlayerRoundInput } from '@/lib/calculations'
import {
  deriveOkeyBurnType,
  getFakeOkeyLoserMultiplier,
  getLoserMultiplier,
  inferRoundInputFromScores,
  previewRoundScore,
} from '@/lib/calculations'

interface RoundEntryModalProps {
  game: Game
  roundNumber: number
  editingRound?: Round | null
  teams?: string[][]
  onSave: (input: RoundInput) => void
  onClose: () => void
}

const COLORS: Color[] = ['black', 'red', 'yellow', 'green']
const COLOR_EMOJI: Record<Color, string> = {
  black: '⬛',
  red: '🔴',
  yellow: '🟡',
  green: '🟢',
}

type PlayerUIStatus = 'normal' | 'okey_burned' | 'winner'

export function RoundEntryModal({
  game,
  roundNumber,
  editingRound,
  teams,
  onSave,
  onClose,
}: RoundEntryModalProps) {
  const settings: CezaliGameSettings = isCezaliSettings(game.settings) ? game.settings : DEFAULT_SETTINGS
  const isEditing = !!editingRound

  const [color, setColor] = useState<Color | null>(editingRound?.color ?? null)
  const [fakeOkey, setFakeOkey] = useState(editingRound?.fake_okey ?? false)
  const [okeyThrown, setOkeyThrown] = useState(editingRound?.okey_thrown ?? false)
  const [doubleFinish, setDoubleFinish] = useState(editingRound?.double_finish ?? false)
  const [noWinner, setNoWinner] = useState(false)
  const [playerStatuses, setPlayerStatuses] = useState<Record<string, PlayerUIStatus>>({})
  const [rawPoints, setRawPoints] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    const initial: Record<string, PlayerUIStatus> = {}
    const initialRaw: Record<string, string> = {}
    for (const p of game.players) {
      initial[p] = 'normal'
      initialRaw[p] = ''
    }
    setPlayerStatuses(initial)
    setRawPoints(initialRaw)
    setNoWinner(false)
  }, [game.players])

  useEffect(() => {
    if (!editingRound) return
    const inferred = inferRoundInputFromScores(editingRound, game.players, settings)
    setColor(editingRound.color)
    setFakeOkey(inferred.fakeOkey)
    setOkeyThrown(editingRound.okey_thrown)
    setDoubleFinish(editingRound.double_finish)
    setNoWinner(inferred.noWinner)
    setPlayerStatuses(inferred.playerStatuses)
    setRawPoints(inferred.rawPoints)
  }, [editingRound, game.players, settings])

  const winner = game.players.find((p) => playerStatuses[p] === 'winner') ?? null

  const currentMultiplier = fakeOkey
    ? getFakeOkeyLoserMultiplier(okeyThrown, doubleFinish)
    : color
      ? getLoserMultiplier(color, okeyThrown, doubleFinish, settings.colorMultipliers)
      : null

  const handleFakeOkeyToggle = (checked: boolean) => {
    setFakeOkey(checked)
    if (checked) {
      setOkeyThrown(false)
      if (!color) setColor('black')
    }
  }

  const handleNoWinnerToggle = (checked: boolean) => {
    setNoWinner(checked)
    if (checked) {
      const updated: Record<string, PlayerUIStatus> = {}
      for (const p of game.players) updated[p] = 'normal'
      setPlayerStatuses(updated)
      setOkeyThrown(false)
      setDoubleFinish(false)
    }
  }

  const setPlayerStatus = (player: string, status: PlayerUIStatus) => {
    if (noWinner && status !== 'normal') return

    setPlayerStatuses((prev) => {
      const next = { ...prev }
      if (status === 'winner') {
        for (const p of game.players) {
          if (p !== player && next[p] === 'winner') next[p] = 'normal'
        }
      }
      next[player] = status
      return next
    })
  }

  const setTeamStatus = (team: string[], status: PlayerUIStatus) => {
    for (const player of team) setPlayerStatus(player, status)
    if (status === 'normal') return
    const pts = rawPoints[team[0]] ?? ''
    if (pts) {
      const updated = { ...rawPoints }
      for (const p of team) updated[p] = pts
      setRawPoints(updated)
    }
  }

  const buildPlayerInput = (player: string): PlayerRoundInput => {
    const status = playerStatuses[player] ?? 'normal'

    if (noWinner) {
      return {
        playerName: player,
        status: 'no_winner',
        rawPoints: parseInt(rawPoints[player] || '0', 10) || 0,
      }
    }

    if (status === 'winner') {
      return { playerName: player, status: 'winner' }
    }

    if (status === 'okey_burned') {
      return {
        playerName: player,
        status: 'okey_burned',
        okeyBurnType: deriveOkeyBurnType(okeyThrown, doubleFinish),
      }
    }

    return {
      playerName: player,
      status: 'loser',
      rawPoints: parseInt(rawPoints[player] || '0', 10) || 0,
    }
  }

  const effectiveColor = color ?? 'black'

  const getPreviewScore = (player: string): number | null => {
    if (!fakeOkey && !color) return null
    if (!noWinner && !winner) return null
    return previewRoundScore(buildPlayerInput(player), effectiveColor, okeyThrown, doubleFinish, settings, fakeOkey)
  }

  const showPreview = (fakeOkey || color) && (noWinner || winner)

  const handleSave = () => {
    if (!fakeOkey && !color) return

    if (!noWinner && !winner) {
      setSaveError("Biten oyuncuyu veya 'Kimse Bitmedi'yi seçin")
      return
    }

    setSaveError('')

    const playerResults = game.players.map(buildPlayerInput)
    onSave({
      color: effectiveColor,
      okeyThrown: fakeOkey ? false : okeyThrown,
      doubleFinish,
      fakeOkey,
      noWinner,
      playerResults,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-[#16213e] rounded-t-3xl border-t border-x border-[#2d3748] overflow-hidden safe-bottom max-h-[92dvh] flex flex-col"
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#4a5568]" />
        </div>

        <div className="px-5 pb-3 border-b border-[#2d3748] shrink-0">
          <h3 className="text-white font-bold text-base">
            {isEditing ? `El ${editingRound.round_number} Düzenle` : `El ${roundNumber}`}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* BÖLÜM 1 - Renk seçimi + Sahte Okey */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider">
                Okey Rengi
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fakeOkey}
                  onChange={(e) => handleFakeOkeyToggle(e.target.checked)}
                  className="accent-purple-500 w-4 h-4"
                />
                <span className="text-white text-sm">Sahte Okey</span>
              </label>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={fakeOkey}
                  onClick={() => setColor(c)}
                  className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1.5 transition-all ${
                    fakeOkey
                      ? 'opacity-40 cursor-not-allowed border-[#2d3748] bg-[#0f3460]/20'
                      : color === c
                        ? 'border-[#e94560] bg-[#e94560]/10'
                        : 'border-[#2d3748] bg-[#0f3460]/30'
                  }`}
                >
                  <span className="text-2xl">{COLOR_EMOJI[c]}</span>
                  <span className="text-white text-xs font-medium">{COLOR_LABELS[c]}</span>
                </button>
              ))}
            </div>
          </section>

          {/* BÖLÜM 2 - Özel durum */}
          {!noWinner && (
            <section>
              <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
                Özel Durum {winner ? '(Biten oyuncu)' : ''}
              </p>
              <div className="flex gap-3 mb-2">
                <label
                  className={`flex-1 flex items-center gap-2 bg-[#0f3460]/40 border border-[#2d3748] rounded-xl p-3 ${
                    winner && !fakeOkey ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={okeyThrown}
                    disabled={!winner || fakeOkey}
                    onChange={(e) => setOkeyThrown(e.target.checked)}
                    className="accent-[#e94560] w-4 h-4"
                  />
                  <span className="text-white text-sm">Okey Atıldı</span>
                </label>
                <label
                  className={`flex-1 flex items-center gap-2 bg-[#0f3460]/40 border border-[#2d3748] rounded-xl p-3 ${
                    winner ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={doubleFinish}
                    disabled={!winner}
                    onChange={(e) => setDoubleFinish(e.target.checked)}
                    className="accent-[#e94560] w-4 h-4"
                  />
                  <span className="text-white text-sm">Çiftten Bitti</span>
                </label>
              </div>
              <p className="text-center text-[#a0aec0] text-sm">
                {fakeOkey ? (
                  <>
                    Sahte Okey:{' '}
                    <span className="text-purple-400 font-bold">×{currentMultiplier}</span>
                  </>
                ) : (
                  <>
                    Mevcut çarpan:{' '}
                    <span className="text-white font-bold">
                      {color ? `×${currentMultiplier}` : 'Renk seçin'}
                    </span>
                  </>
                )}
              </p>
            </section>
          )}

          {/* Kimse Bitmedi toggle */}
          <section>
            <label className="flex items-center gap-3 bg-[#0f3460]/40 border border-[#2d3748] rounded-xl p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={noWinner}
                onChange={(e) => handleNoWinnerToggle(e.target.checked)}
                className="accent-[#e94560] w-4 h-4"
              />
              <span className="text-white text-sm font-medium">Kimse Bitmedi</span>
            </label>
          </section>

          {/* BÖLÜM 3 - Oyuncu / Takım durumları */}
          <section>
            <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
              {teams ? 'Takım Durumları' : 'Oyuncu Durumları'}
            </p>
            <div className="flex flex-col gap-3">
              {(teams ?? game.players.map((p) => [p])).map((group) => {
                const isTeam = teams !== undefined
                const label = isTeam ? teamLabel(group) : group[0]
                const player = group[0]
                const status = playerStatuses[player] ?? 'normal'
                const isWinner = status === 'winner'
                const isBurned = status === 'okey_burned'

                return (
                  <div
                    key={label}
                    className={`bg-[#0f3460]/40 border rounded-xl p-3 ${
                      isWinner ? 'border-green-500/50' : isBurned ? 'border-orange-500/50' : 'border-[#2d3748]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-white text-sm font-medium flex-1 min-w-0 truncate">
                        {label}
                      </span>
                      <div className="flex gap-1 shrink-0">
                        {(['normal', 'okey_burned', 'winner'] as const).map((s) => {
                          const labels = { normal: 'Normal', okey_burned: 'Okeyi Yaktı', winner: 'Bitti' }
                          const disabled = noWinner && s !== 'normal'
                          return (
                            <button
                              key={s}
                              type="button"
                              disabled={disabled}
                              onClick={() => (isTeam ? setTeamStatus(group, s) : setPlayerStatus(player, s))}
                              className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-colors ${
                                status === s
                                  ? s === 'winner'
                                    ? 'bg-green-500 text-white'
                                    : s === 'okey_burned'
                                      ? 'bg-orange-500 text-white'
                                      : 'bg-[#e94560] text-white'
                                  : 'bg-[#2d3748] text-[#a0aec0]'
                              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              {labels[s]}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {status === 'normal' && (
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="Elindeki puan"
                        value={rawPoints[player] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value
                          setRawPoints((p) => {
                            const next = { ...p, [player]: val }
                            if (isTeam) for (const tp of group) next[tp] = val
                            return next
                          })
                        }}
                        className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-[#e94560]"
                      />
                    )}

                    {isBurned && (
                      <p className="text-orange-400 text-xs font-medium mt-1">Okeyi Yaktı</p>
                    )}
                  </div>
                )
              })}
            </div>
            {!noWinner && (
              <p className="text-[#718096] text-xs mt-2">
                Sadece 1 {teams ? 'takım' : 'kişi'} bitti seçilebilir.
              </p>
            )}
          </section>

          {/* BÖLÜM 4 - Önizleme */}
          {showPreview && (
            <section className="bg-[#0f3460]/30 border border-[#2d3748] rounded-xl p-4">
              <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
                Önizleme
              </p>
              <div className="flex flex-col gap-2">
                {game.players.map((player) => {
                  const score = getPreviewScore(player)
                  if (score === null) return null
                  return (
                    <div key={player} className="flex justify-between text-sm">
                      <span className="text-white truncate mr-2">{player}</span>
                      <span
                        className={`font-bold shrink-0 ${score < 0 ? 'text-green-400' : score > 0 ? 'text-red-400' : 'text-[#718096]'}`}
                      >
                        {score > 0 ? `+${score}` : score}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        {saveError && (
          <p className="px-5 text-red-400 text-sm text-center">{saveError}</p>
        )}

        {/* BÖLÜM 5 - Butonlar */}
        <div className="px-5 pb-5 flex gap-3 shrink-0 border-t border-[#2d3748] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3.5 rounded-xl"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!fakeOkey && !color}
            className="flex-[2] bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-colors"
          >
            Kaydet
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
