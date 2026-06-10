import { useState } from 'react'
import { motion } from 'framer-motion'
import type { Game } from '@/types'
import { useGameStore } from '@/stores/gameStore'
import {
  fetchGameWithRounds,
  updateGame,
  updateRound,
} from '@/lib/supabase'
import {
  getGameBadgeLabel,
  getTeams,
  getWinnersCount,
  isEsliGame,
  teamLabel,
} from '@/lib/gameTypes'

interface Props {
  game: Game
  onClose: () => void
  onSaved: () => void
}

function remapBankoHistory(
  history: Record<string, number[]>,
  game: Game,
  trimmedNames: string[],
  nameMap: Record<string, string>
): Record<string, number[]> {
  const esli = isEsliGame(game)
  const oldTeams = getTeams(game)
  const newTeams = esli
    ? [[trimmedNames[0], trimmedNames[1]], [trimmedNames[2], trimmedNames[3]]]
    : null

  const next: Record<string, number[]> = {}
  for (const [oldKey, rounds] of Object.entries(history)) {
    let newKey = nameMap[oldKey] ?? oldKey
    if (esli && newTeams) {
      const idx = oldTeams.findIndex((t) => teamLabel(t) === oldKey)
      if (idx >= 0) newKey = teamLabel(newTeams[idx])
    }
    next[newKey] = rounds
  }
  return next
}

function remapBankoPlayers(
  bankoPlayers: string[] | undefined,
  game: Game,
  trimmedNames: string[],
  nameMap: Record<string, string>
): string[] | undefined {
  if (!bankoPlayers?.length) return bankoPlayers
  const esli = isEsliGame(game)
  const oldTeams = getTeams(game)
  const newTeams = esli
    ? [[trimmedNames[0], trimmedNames[1]], [trimmedNames[2], trimmedNames[3]]]
    : null

  return bankoPlayers.map((oldKey) => {
    if (esli && newTeams) {
      const idx = oldTeams.findIndex((t) => teamLabel(t) === oldKey)
      if (idx >= 0) return teamLabel(newTeams[idx])
    }
    return nameMap[oldKey] ?? oldKey
  })
}

export function GameSettingsModal({ game, onClose, onSaved }: Props) {
  const { loadGame } = useGameStore()
  const isActive = game.status === 'active'
  const hasWinnersCount = 'winnersCount' in game.settings || isActive

  const [note, setNote] = useState('note' in game.settings ? (game.settings.note ?? '') : '')
  const [totalRounds, setTotalRounds] = useState(game.total_rounds)
  const [playerNames, setPlayerNames] = useState<string[]>([...game.players])
  const [winnersCount, setWinnersCount] = useState(getWinnersCount(game.settings))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (totalRounds < 1) {
      setError('El sayısı en az 1 olmalı')
      return
    }

    const trimmedNames = playerNames.map((n, i) => n.trim() || game.players[i] || `Oyuncu ${i + 1}`)
    if (trimmedNames.some((n) => !n)) {
      setError('Tüm oyuncu isimleri dolu olmalı')
      return
    }

    setSaving(true)
    setError('')

    try {
      const nameMap: Record<string, string> = {}
      game.players.forEach((oldName, i) => {
        if (oldName !== trimmedNames[i]) nameMap[oldName] = trimmedNames[i]
      })

      const playersChanged = Object.keys(nameMap).length > 0
      const esli = isEsliGame(game)
      const newTeams = esli
        ? ([[trimmedNames[0], trimmedNames[1]], [trimmedNames[2], trimmedNames[3]]] as string[][])
        : undefined

      const updatedSettings = {
        ...game.settings,
        note: note.trim() || undefined,
        ...(hasWinnersCount ? { winnersCount } : {}),
      }

      let newBankoHistory = game.banko_history
      if (playersChanged && game.banko_history) {
        newBankoHistory = remapBankoHistory(game.banko_history, game, trimmedNames, nameMap)
      }

      const { data, error: updateError } = await updateGame(game.id, {
        total_rounds: totalRounds,
        players: trimmedNames,
        teams: newTeams,
        settings: updatedSettings,
        ...(newBankoHistory !== game.banko_history ? { banko_history: newBankoHistory } : {}),
      })

      if (updateError) throw updateError

      if (playersChanged) {
        const { rounds: gameRounds } = await fetchGameWithRounds(game.id)
        for (const round of gameRounds) {
          const newScores: Record<string, number> = {}
          for (const [key, value] of Object.entries(round.scores)) {
            if (esli && newTeams) {
              const oldTeams = getTeams(game)
              const idx = oldTeams.findIndex((t) => teamLabel(t) === key)
              const newKey = idx >= 0 ? teamLabel(newTeams[idx]) : (nameMap[key] ?? key)
              newScores[newKey] = value
            } else {
              newScores[nameMap[key] ?? key] = value
            }
          }

          const newBankoPlayers = remapBankoPlayers(round.banko_players, game, trimmedNames, nameMap)

          await updateRound(round.id, {
            scores: newScores,
            ...(newBankoPlayers ? { banko_players: newBankoPlayers } : {}),
          })
        }
      }

      if (data) {
        const { rounds: r } = await fetchGameWithRounds(game.id)
        loadGame(data, r)
      }

      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
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
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-[#16213e] rounded-t-3xl border-t border-x border-[#2d3748] safe-bottom max-h-[92dvh] overflow-y-auto"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#4a5568]" />
        </div>

        <div className="px-5 pb-5">
          <h3 className="text-white font-bold text-lg mb-5">Oyun Ayarları</h3>

          <div className="space-y-4 mb-5">
            <div>
              <label className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2 block">
                Oyun Adı / Notu
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Örn: Cuma gecesi okeyi"
                maxLength={50}
                className="w-full bg-[#0f3460]/50 border border-[#2d3748] rounded-xl py-3 px-4 text-white placeholder-[#718096] focus:outline-none focus:border-[#e94560] text-sm"
              />
            </div>

            <div>
              <label className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2 block">
                El Sayısı
              </label>
              <input
                type="number"
                min={1}
                value={totalRounds}
                onChange={(e) => setTotalRounds(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full bg-[#0f3460]/50 border border-[#2d3748] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-[#e94560] text-sm"
              />
            </div>

            <div>
              <label className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2 block">
                Oyuncu İsimleri
              </label>
              {isActive ? (
                <div className="space-y-2">
                  {playerNames.map((name, i) => (
                    <div key={i}>
                      <label className="text-[#718096] text-xs mb-1 block">Oyuncu {i + 1}</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => {
                          const updated = [...playerNames]
                          updated[i] = e.target.value
                          setPlayerNames(updated)
                        }}
                        maxLength={30}
                        placeholder={`Oyuncu ${i + 1}`}
                        className="w-full bg-[#0f3460]/50 border border-[#2d3748] rounded-xl py-3 px-4 text-white placeholder-[#718096] focus:outline-none focus:border-[#e94560] text-sm"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <input
                  type="text"
                  value={game.players.join(', ')}
                  disabled
                  className="w-full bg-[#0f3460]/20 border border-[#2d3748] rounded-xl py-3 px-4 text-[#718096] text-sm cursor-not-allowed"
                />
              )}
            </div>

            {hasWinnersCount && (
              <div>
                <label className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2 block">
                  Kaç kişi kazanır?
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setWinnersCount(count)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                        winnersCount === count
                          ? 'bg-[#e94560] border-[#e94560] text-white'
                          : 'bg-[#0f3460] border-[#2d3748] text-[#a0aec0]'
                      }`}
                    >
                      {count} kişi
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-[#718096] text-xs font-semibold uppercase tracking-wider mb-2 block">
                Oyun Tipi
              </label>
              <input
                type="text"
                value={getGameBadgeLabel(game)}
                disabled
                className="w-full bg-[#0f3460]/20 border border-[#2d3748] rounded-xl py-3 px-4 text-[#718096] text-sm cursor-not-allowed"
              />
            </div>
          </div>

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          <div className="flex gap-3">
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
              disabled={saving}
              className="flex-[2] bg-[#e94560] disabled:opacity-60 text-white font-bold py-3.5 rounded-xl"
            >
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
