import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { Color, Game } from '@/types'
import { COLOR_LABELS } from '@/types'
import { getTeams, isBankoluEsli, teamLabel } from '@/lib/gameTypes'
import { playerIsBanko } from '@/lib/bankoluUtils'
import {
  type BankoluColor,
  type BankoluPlayerInput,
  type BankoluRoundInput,
  calculateBankoluScores,
} from '@/lib/bankoluCalculations'

export interface BankoluRoundSavePayload {
  color: Color
  fakeOkey: boolean
  okeyThrown: boolean
  doubleFinish: boolean
  scores: Record<string, number>
  bankoPlayers: string[]
}

interface Props {
  game: Game
  roundNumber: number
  currentBankos: string[]
  onSave: (payload: BankoluRoundSavePayload) => void
  onClose: () => void
}

const COLORS: Color[] = ['black', 'red', 'yellow', 'green']
const COLOR_EMOJI: Record<Color, string> = {
  black: '⬛',
  red: '🔴',
  yellow: '🟡',
  green: '🟢',
}

type PlayerUIStatus = 'normal' | 'winner' | 'okey_burned'

export function BankoluRoundEntryModal({
  game,
  roundNumber,
  currentBankos,
  onSave,
  onClose,
}: Props) {
  const esli = isBankoluEsli(game)
  const teams = esli ? getTeams(game) : []

  const [color, setColor] = useState<Color | null>(null)
  const [fakeOkey, setFakeOkey] = useState(false)
  const [okeyThrown, setOkeyThrown] = useState(false)
  const [doubleFinish, setDoubleFinish] = useState(false)
  const [playerStatuses, setPlayerStatuses] = useState<Record<string, PlayerUIStatus>>({})
  const [rawPoints, setRawPoints] = useState<Record<string, string>>({})
  const [fakeOpeners, setFakeOpeners] = useState<Record<string, boolean>>({})
  const [winnerTeam, setWinnerTeam] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    const statuses: Record<string, PlayerUIStatus> = {}
    const pts: Record<string, string> = {}
    const openers: Record<string, boolean> = {}
    for (const p of game.players) {
      statuses[p] = 'normal'
      pts[p] = ''
      openers[p] = false
    }
    setPlayerStatuses(statuses)
    setRawPoints(pts)
    setFakeOpeners(openers)
    setColor(null)
    setFakeOkey(false)
    setOkeyThrown(false)
    setDoubleFinish(false)
    setWinnerTeam(null)
    setSaveError('')
  }, [game.players.join(','), roundNumber])

  const bankoluColor = (): BankoluColor => {
    if (fakeOkey) return 'fake'
    return color ?? 'black'
  }

  const buildRoundInput = (): BankoluRoundInput | null => {
    if (!fakeOkey && !color) return null

    const players: BankoluPlayerInput[] = game.players.map((name) => {
      const isBanko = playerIsBanko(name, currentBankos, game)
      let isWinner = playerStatuses[name] === 'winner'
      if (esli && winnerTeam) {
        const team = teams.find((t) => teamLabel(t) === winnerTeam)
        isWinner = team?.includes(name) ?? false
      }
      return {
        name,
        isBanko,
        isWinner,
        isFakeOkeyOpener: fakeOpeners[name] ?? false,
        isOkeyBurned: playerStatuses[name] === 'okey_burned',
        rawPoints: parseInt(rawPoints[name] || '0') || 0,
      }
    })

    return {
      color: bankoluColor(),
      okeyThrown,
      doubleFinish,
      players,
    }
  }

  const previewScores = useMemo(() => {
    const input = buildRoundInput()
    if (!input) return null
    return calculateBankoluScores(input)
  }, [color, fakeOkey, okeyThrown, doubleFinish, playerStatuses, rawPoints, fakeOpeners, winnerTeam, currentBankos.join(',')])

  const previewDisplay = useMemo(() => {
    if (!previewScores) return null
    if (!esli) return previewScores

    const teamScores: Record<string, number> = {}
    for (const team of teams) {
      const label = teamLabel(team)
      teamScores[label] = team.reduce((sum, p) => sum + (previewScores[p] ?? 0), 0)
    }
    return teamScores
  }, [previewScores, esli, teams])

  const handleSave = () => {
    if (!fakeOkey && !color) {
      setSaveError('Renk veya sahte okey seçin')
      return
    }

    const hasWinner = esli
      ? !!winnerTeam
      : Object.values(playerStatuses).some((s) => s === 'winner')

    if (!hasWinner) {
      setSaveError('Biten oyuncu/takım seçin')
      return
    }

    const input = buildRoundInput()
    if (!input) return

    const playerScores = calculateBankoluScores(input)
    let scores: Record<string, number> = playerScores

    if (esli) {
      scores = {}
      for (const team of teams) {
        const label = teamLabel(team)
        scores[label] = team.reduce((sum, p) => sum + (playerScores[p] ?? 0), 0)
      }
    }

    onSave({
      color: fakeOkey ? 'black' : color!,
      fakeOkey,
      okeyThrown,
      doubleFinish,
      scores,
      bankoPlayers: currentBankos,
    })
  }

  const setStatus = (player: string, status: PlayerUIStatus) => {
    if (esli) return
    setPlayerStatuses((prev) => {
      const next = { ...prev }
      for (const p of game.players) {
        if (p !== player) next[p] = next[p] === 'winner' ? 'normal' : next[p]
      }
      next[player] = status
      return next
    })
  }

  const bankoLabel = currentBankos.length > 0
    ? currentBankos.join(', ')
    : 'Yok'

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
        className="relative w-full max-w-lg bg-[#16213e] rounded-t-3xl border-t border-x border-[#2d3748] safe-bottom max-h-[92dvh] flex flex-col overflow-hidden"
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#4a5568]" />
        </div>
        <div className="px-5 pb-3 border-b border-[#2d3748] shrink-0">
          <h3 className="text-white font-bold">El {roundNumber} — Bankolu Cezalı</h3>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <section>
            <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">Renk</p>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setColor(c); setFakeOkey(false) }}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold border ${
                    color === c && !fakeOkey
                      ? 'bg-[#e94560] border-[#e94560] text-white'
                      : 'bg-[#0f3460] border-[#2d3748] text-[#a0aec0]'
                  }`}
                >
                  {COLOR_EMOJI[c]} {COLOR_LABELS[c]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setFakeOkey(true); setColor(null) }}
                className={`px-3 py-2 rounded-xl text-sm font-semibold border ${
                  fakeOkey
                    ? 'bg-purple-600 border-purple-500 text-white'
                    : 'bg-[#0f3460] border-[#2d3748] text-[#a0aec0]'
                }`}
              >
                🃏 Sahte Okey
              </button>
            </div>
          </section>

          {!fakeOkey && (
            <section className="flex gap-4">
              <label className="flex items-center gap-2 text-[#a0aec0] text-sm cursor-pointer">
                <input type="checkbox" checked={okeyThrown} onChange={(e) => setOkeyThrown(e.target.checked)} className="accent-[#e94560]" />
                Okey Atıldı
              </label>
              <label className="flex items-center gap-2 text-[#a0aec0] text-sm cursor-pointer">
                <input type="checkbox" checked={doubleFinish} onChange={(e) => setDoubleFinish(e.target.checked)} className="accent-[#e94560]" />
                Çiftten Bitti
              </label>
            </section>
          )}

          <section className="bg-[#0f3460]/30 border border-[#2d3748] rounded-xl p-3">
            <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-1">Bu Elde Bankocu</p>
            <p className="text-white text-sm">{bankoLabel}</p>
          </section>

          <section>
            <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">Oyuncu Durumları</p>
            <div className="flex flex-col gap-3">
              {esli && (
                <div className="flex flex-col gap-2 mb-2">
                  <p className="text-[#718096] text-xs">Biten takım:</p>
                  {teams.map((team) => {
                    const label = teamLabel(team)
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setWinnerTeam(label)}
                        className={`p-3 rounded-xl border text-left font-semibold ${
                          winnerTeam === label
                            ? 'bg-green-600/20 border-green-500 text-green-400'
                            : 'bg-[#0f3460]/40 border-[#2d3748] text-white'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}

              {game.players.map((player) => {
                const isBanko = playerIsBanko(player, currentBankos, game)
                const status = playerStatuses[player] ?? 'normal'
                const showPoints = status === 'normal' || status === 'okey_burned'

                return (
                  <div key={player} className="bg-[#0f3460]/40 border border-[#2d3748] rounded-xl p-3">
                    <p className="text-white text-sm font-semibold mb-2">
                      {isBanko && <span className="text-red-400 mr-1">💥</span>}
                      {player}
                      {isBanko && <span className="text-red-400 text-xs ml-1">(BANKOCU)</span>}
                    </p>

                    {!esli && (
                      <div className="flex gap-2 mb-3 flex-wrap">
                        {(['normal', 'winner', 'okey_burned'] as PlayerUIStatus[]).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setStatus(player, s)}
                            className={`px-2 py-1.5 rounded-lg text-xs font-semibold ${
                              status === s
                                ? s === 'winner' ? 'bg-green-600 text-white' : s === 'okey_burned' ? 'bg-orange-600 text-white' : 'bg-[#2d3748] text-white'
                                : 'bg-[#1a1a2e] text-[#718096]'
                            }`}
                          >
                            {s === 'normal' ? 'Normal' : s === 'winner' ? 'Bitti' : 'Okeyi Yaktı'}
                          </button>
                        ))}
                      </div>
                    )}

                    {esli && winnerTeam && (
                      <p className="text-[#718096] text-xs mb-2">
                        {teams.find((t) => teamLabel(t) === winnerTeam)?.includes(player)
                          ? 'Bitti (takım)'
                          : 'Ceza girişi'}
                      </p>
                    )}

                    {showPoints && (!esli || (esli && winnerTeam && !teams.find((t) => teamLabel(t) === winnerTeam)?.includes(player))) && (
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="Elindeki puan"
                        value={rawPoints[player] ?? ''}
                        onChange={(e) => setRawPoints((prev) => ({ ...prev, [player]: e.target.value }))}
                        className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded-lg py-2 px-3 text-white text-sm mb-2"
                      />
                    )}

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={fakeOpeners[player] ?? false}
                        onChange={(e) => setFakeOpeners((prev) => ({ ...prev, [player]: e.target.checked }))}
                        className="accent-purple-500"
                      />
                      <span className="text-[#a0aec0] text-xs">Sahte Okey Açtı (+100)</span>
                    </label>
                  </div>
                )
              })}
            </div>
          </section>

          {previewDisplay && (
            <section className="bg-[#0f3460]/30 border border-[#2d3748] rounded-xl p-4">
              <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">Önizleme</p>
              {Object.entries(previewDisplay).map(([name, score]) => {
                const isBanko = esli
                  ? currentBankos.includes(name)
                  : playerIsBanko(name, currentBankos, game)
                const fakeNote = !esli && fakeOpeners[name] ? ' (+100 sahte)' : ''
                return (
                  <div key={name} className="flex justify-between text-sm mb-1">
                    <span className="text-white">
                      {name}{isBanko ? ' (Bankocu)' : ''}{fakeNote}
                    </span>
                    <span className={`font-bold ${score < 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {score > 0 ? `+${score}` : score}
                    </span>
                  </div>
                )
              })}
            </section>
          )}
        </div>

        {saveError && <p className="px-5 text-red-400 text-sm text-center">{saveError}</p>}

        <div className="px-5 pb-5 flex gap-3 shrink-0 border-t border-[#2d3748] pt-4">
          <button type="button" onClick={onClose} className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3.5 rounded-xl">
            İptal
          </button>
          <button type="button" onClick={handleSave} className="flex-[2] bg-green-500 text-white font-bold py-3.5 rounded-xl">
            Kaydet
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
