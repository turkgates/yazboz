import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, fetchGameWithRounds, insertRound, updateGame } from '@/lib/supabase'
import { useGameStore } from '@/stores/gameStore'
import { ArrowLeft, Settings, Plus } from 'lucide-react'
import type { Color, RoundInput, Game, Round } from '@/types'
import { COLOR_LABELS, COLOR_HEX } from '@/types'
import { getTotalMultiplier, previewRoundScore } from '@/lib/calculations'
import { v4 as uuidv4 } from 'uuid'
import { formatDate } from '@/lib/dateUtils'

export const Route = createFileRoute('/game/$gameId')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: GamePage,
})

function GamePage() {
  const { gameId } = Route.useParams()
  const navigate = useNavigate()
  const { currentGame, rounds, loadGame, addRound, finishGame, isGameFinished } = useGameStore()
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    loadGameData()
  }, [gameId])

  const loadGameData = async () => {
    if (currentGame?.id === gameId) {
      setLoading(false)
      return
    }
    const { game, rounds: r } = await fetchGameWithRounds(gameId)
    if (game) loadGame(game, r)
    setLoading(false)
  }

  const handleRoundSaved = async (input: RoundInput) => {
    if (!currentGame) return
    const roundId = uuidv4()
    const roundNumber = rounds.length + 1
    addRound(roundId, roundNumber, input)
    setShowModal(false)

    const scores = Object.fromEntries(
      input.playerResults.map((pr) => {
        const score = previewRoundScore(
          pr.playerName, pr.isWinner, pr.rawPoints,
          input.color, input.okeyThrown, input.doubleFinish,
          currentGame.settings
        )
        return [pr.playerName, score]
      })
    )

    try {
      await insertRound({
        id: roundId,
        game_id: gameId,
        round_number: roundNumber,
        color: input.color,
        okey_thrown: input.okeyThrown,
        double_finish: input.doubleFinish,
        scores,
      })
    } catch {}

    if (roundNumber >= currentGame.total_rounds) {
      finishGame()
      try {
        await updateGame(gameId, { status: 'finished', finished_at: new Date().toISOString() })
      } catch {}
      navigate({ to: '/game-over/$gameId', params: { gameId } })
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!currentGame) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex flex-col items-center justify-center gap-4">
        <p className="text-white">Oyun bulunamadı</p>
        <button onClick={() => navigate({ to: '/home' })} className="text-[#e94560]">Ana Sayfaya Dön</button>
      </div>
    )
  }

  const gameOver = isGameFinished()
  const currentRound = rounds.length + 1
  const totals: Record<string, number> = {}
  for (const player of currentGame.players) {
    totals[player] = rounds.reduce((sum, r) => sum + (r.scores[player] ?? 0), 0)
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      {/* Header */}
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top shrink-0">
        <div className="flex items-center justify-between py-3 max-w-lg mx-auto">
          <button
            onClick={() => navigate({ to: '/home' })}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0]"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="text-center">
            <p className="text-white font-semibold text-sm">
              {gameOver ? 'Oyun Bitti!' : `El ${Math.min(currentRound, currentGame.total_rounds)} / ${currentGame.total_rounds}`}
            </p>
            <p className="text-[#718096] text-xs">{formatDate(currentGame.created_at)}</p>
          </div>
          <button className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0]">
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Score Table */}
      <div className="flex-1 overflow-auto px-2 py-3 max-w-lg mx-auto w-full">
        <ScoreTable
          players={currentGame.players}
          rounds={rounds}
          totals={totals}
          currentRound={currentRound}
          totalRounds={currentGame.total_rounds}
        />
      </div>

      {/* Bottom Action */}
      {!gameOver && (
        <div className="px-4 pb-6 pt-3 bg-[#1a1a2e] border-t border-[#2d3748] safe-bottom max-w-lg mx-auto w-full">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowModal(true)}
            className="w-full bg-[#e94560] hover:bg-[#c73652] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-base shadow-lg shadow-[#e94560]/20 transition-colors"
          >
            <Plus size={22} />
            El Gir
          </motion.button>
        </div>
      )}

      {gameOver && (
        <div className="px-4 pb-6 pt-3 safe-bottom max-w-lg mx-auto w-full">
          <button
            onClick={() => navigate({ to: '/game-over/$gameId', params: { gameId } })}
            className="w-full bg-[#f5a623] text-[#1a1a2e] font-bold py-4 rounded-2xl text-base"
          >
            🏆 Sonuçları Gör
          </button>
        </div>
      )}

      {/* Round Entry Modal */}
      <AnimatePresence>
        {showModal && (
          <RoundEntryModal
            game={currentGame}
            roundNumber={currentRound}
            onSave={handleRoundSaved}
            onClose={() => setShowModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Score Table ────────────────────────────────────────────────────────────

function ScoreTable({
  players,
  rounds,
  totals,
  currentRound,
  totalRounds,
}: {
  players: string[]
  rounds: Round[]
  totals: Record<string, number>
  currentRound: number
  totalRounds: number
}) {
  const colWidth = players.length <= 2 ? 'flex-1' : players.length === 3 ? 'w-1/3' : 'w-1/4'

  return (
    <div className="bg-[#16213e] rounded-2xl border border-[#2d3748] overflow-hidden">
      {/* Player Headers */}
      <div className="flex border-b border-[#2d3748] bg-[#0f3460]">
        <div className="w-8 shrink-0" />
        {players.map((player) => (
          <div key={player} className={`${colWidth} py-3 px-1 text-center`}>
            <p className="text-white text-xs font-semibold truncate">{player}</p>
          </div>
        ))}
      </div>

      {/* Round Rows */}
      {rounds.map((round, idx) => (
        <div
          key={round.id}
          className={`flex border-b border-[#2d3748]/50 ${idx % 2 === 0 ? '' : 'bg-[#0f3460]/20'}`}
        >
          <div className="w-8 shrink-0 flex items-center justify-center">
            <span className="text-[#718096] text-xs">{round.round_number}</span>
          </div>
          {players.map((player) => {
            const score = round.scores[player] ?? 0
            const isNeg = score < 0
            return (
              <div key={player} className={`${colWidth} py-2.5 px-1 text-center`}>
                <span className={`text-xs font-medium ${isNeg ? 'text-green-400' : score > 0 ? 'text-red-400' : 'text-[#718096]'}`}>
                  {score === 0 ? '-' : score > 0 ? `+${score}` : score}
                </span>
              </div>
            )
          })}
        </div>
      ))}

      {/* Empty Round Placeholders */}
      {Array.from({ length: Math.max(0, totalRounds - rounds.length) }).map((_, idx) => {
        const roundNum = rounds.length + idx + 1
        const isCurrentRound = roundNum === currentRound
        return (
          <div
            key={`empty-${idx}`}
            className={`flex border-b border-[#2d3748]/30 ${isCurrentRound ? 'bg-[#e94560]/5' : ''}`}
          >
            <div className="w-8 shrink-0 flex items-center justify-center">
              <span className={`text-xs ${isCurrentRound ? 'text-[#e94560] font-bold' : 'text-[#2d3748]'}`}>
                {roundNum}
              </span>
            </div>
            {players.map((player) => (
              <div key={player} className={`${colWidth} py-2.5 px-1 text-center`}>
                {isCurrentRound ? (
                  <span className="text-[#e94560]/40 text-xs">—</span>
                ) : (
                  <span className="text-[#2d3748] text-xs">·</span>
                )}
              </div>
            ))}
          </div>
        )
      })}

      {/* Totals */}
      <div className="flex bg-[#0f3460] border-t-2 border-[#2d3748]">
        <div className="w-8 shrink-0" />
        {players.map((player) => {
          const total = totals[player] ?? 0
          return (
            <div key={player} className={`${colWidth} py-3 px-1 text-center`}>
              <p className={`text-sm font-bold ${total < 0 ? 'text-green-400' : total > 0 ? 'text-red-400' : 'text-white'}`}>
                {total}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Round Entry Modal ───────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4

function RoundEntryModal({
  game,
  roundNumber,
  onSave,
  onClose,
}: {
  game: Game
  roundNumber: number
  onSave: (input: RoundInput) => void
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>(1)
  const [color, setColor] = useState<Color | null>(null)
  const [okeyThrown, setOkeyThrown] = useState(false)
  const [doubleFinish, setDoubleFinish] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)
  const [rawPoints, setRawPoints] = useState<Record<string, string>>({})

  const settings = game.settings

  const multiplier = color
    ? getTotalMultiplier(color, okeyThrown, doubleFinish, settings.colorMultipliers)
    : null

  const canProceed = () => {
    if (step === 1) return color !== null
    if (step === 3) return winner !== null
    return true
  }

  const next = () => setStep((s) => (s + 1) as Step)
  const back = () => {
    if (step === 1) onClose()
    else setStep((s) => (s - 1) as Step)
  }

  const handleSave = () => {
    if (!color || !winner) return
    const playerResults = game.players.map((p) => ({
      playerName: p,
      isWinner: p === winner,
      rawPoints: p === winner ? 0 : parseInt(rawPoints[p] || '0', 10) || 0,
    }))
    onSave({ color, okeyThrown, doubleFinish, playerResults })
  }

  const getPreviewScore = (player: string): number | null => {
    if (!color) return null
    const isWin = player === winner
    const raw = parseInt(rawPoints[player] || '0', 10) || 0
    if (!isWin && rawPoints[player] === undefined) return null
    return previewRoundScore(player, isWin, raw, color, okeyThrown, doubleFinish, settings)
  }

  const COLORS: Color[] = ['black', 'red', 'yellow', 'green']

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
        className="relative w-full max-w-lg bg-[#16213e] rounded-t-3xl border-t border-x border-[#2d3748] overflow-hidden safe-bottom"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#4a5568]" />
        </div>

        {/* Title */}
        <div className="px-5 pb-3 border-b border-[#2d3748]">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold text-base">El {roundNumber}</h3>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className={`h-1 rounded-full transition-all ${
                    s <= step ? 'bg-[#e94560] w-5' : 'bg-[#2d3748] w-3'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-5 min-h-[280px]">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <p className="text-[#a0aec0] text-sm mb-4">Okey rengini seç</p>
                <div className="grid grid-cols-2 gap-3">
                  {COLORS.map((c) => {
                    const mult = settings.colorMultipliers[c]
                    return (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                          color === c
                            ? 'border-[#e94560] bg-[#e94560]/10 scale-105'
                            : 'border-[#2d3748] bg-[#0f3460]/30'
                        }`}
                      >
                        <div
                          className="w-10 h-10 rounded-full border-2 border-white/20 shadow-lg"
                          style={{ backgroundColor: COLOR_HEX[c] }}
                        />
                        <span className="text-white font-semibold text-sm">{COLOR_LABELS[c]}</span>
                        <span className="text-[#718096] text-xs">×{mult}</span>
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {step === 2 && color && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <p className="text-[#a0aec0] text-sm mb-4">Özel durum seç</p>

                <div className="flex flex-col gap-3 mb-6">
                  <ToggleRow
                    label="Okey Atıldı"
                    desc="Tüm çarpanlar ×2"
                    value={okeyThrown}
                    onChange={setOkeyThrown}
                  />
                  <ToggleRow
                    label="Çiftten Bitti"
                    desc="Tüm çarpanlar ×2"
                    value={doubleFinish}
                    onChange={setDoubleFinish}
                  />
                </div>

                <div className="bg-[#0f3460] rounded-xl p-4 text-center">
                  <p className="text-[#a0aec0] text-xs mb-1">Mevcut toplam çarpan</p>
                  <p className="text-white text-3xl font-bold">×{multiplier}</p>
                  <p className="text-[#718096] text-xs mt-1">
                    {COLOR_LABELS[color]}({settings.colorMultipliers[color]})
                    {okeyThrown ? ' × Okey(2)' : ''}
                    {doubleFinish ? ' × Çift(2)' : ''}
                  </p>
                </div>
              </motion.div>
            )}

            {step === 3 && color && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <p className="text-[#a0aec0] text-sm mb-4">Puan gir • ×{multiplier} çarpan uygulanacak</p>
                <div className="flex flex-col gap-3">
                  {game.players.map((player) => {
                    const isWin = winner === player
                    const preview = getPreviewScore(player)
                    return (
                      <div
                        key={player}
                        className={`bg-[#0f3460]/50 rounded-xl p-3 border transition-colors ${
                          isWin ? 'border-green-500/50' : 'border-[#2d3748]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setWinner(isWin ? null : player)}
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${
                                isWin
                                  ? 'bg-green-500 text-white'
                                  : 'bg-[#2d3748] text-[#a0aec0]'
                              }`}
                            >
                              {isWin ? '✓ Bitti' : 'Bitti?'}
                            </button>
                            <span className="text-white text-sm font-medium">{player}</span>
                          </div>
                          {preview !== null && (
                            <span className={`text-xs font-bold ${preview < 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {preview > 0 ? `+${preview}` : preview}
                            </span>
                          )}
                        </div>
                        {!isWin && (
                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder="0"
                            value={rawPoints[player] ?? ''}
                            onChange={(e) => setRawPoints((p) => ({ ...p, [player]: e.target.value }))}
                            className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-[#e94560] transition-colors"
                          />
                        )}
                        {isWin && (
                          <p className="text-green-400 text-xs">
                            Düşüş: {previewRoundScore(player, true, 0, color, okeyThrown, doubleFinish, settings)}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {step === 4 && color && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <p className="text-[#a0aec0] text-sm mb-4">El özeti</p>
                <div className="bg-[#0f3460]/40 rounded-xl border border-[#2d3748] overflow-hidden mb-4">
                  <div className="px-4 py-2 border-b border-[#2d3748] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: COLOR_HEX[color] }} />
                      <span className="text-white text-sm font-medium">{COLOR_LABELS[color]}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {okeyThrown && <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">Okey Atıldı</span>}
                      {doubleFinish && <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Çiftten</span>}
                      <span className="text-[#718096] text-xs">×{multiplier}</span>
                    </div>
                  </div>
                  {game.players.map((player) => {
                    const score = getPreviewScore(player) ?? 0
                    const isWin = player === winner
                    return (
                      <div key={player} className="px-4 py-3 flex items-center justify-between border-b border-[#2d3748]/50 last:border-0">
                        <div className="flex items-center gap-2">
                          {isWin && <span className="text-green-400 text-xs">🏆</span>}
                          <span className="text-white text-sm">{player}</span>
                        </div>
                        <span className={`text-sm font-bold ${score < 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {score > 0 ? `+${score}` : score}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={back}
            className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3.5 rounded-xl"
          >
            {step === 1 ? 'İptal' : 'Geri'}
          </button>
          {step < 4 ? (
            <button
              onClick={next}
              disabled={!canProceed()}
              className="flex-[2] bg-[#e94560] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-opacity"
            >
              İleri
            </button>
          ) : (
            <button
              onClick={handleSave}
              className="flex-[2] bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 rounded-xl transition-colors"
            >
              Kaydet ✓
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

function ToggleRow({
  label, desc, value, onChange,
}: {
  label: string
  desc: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
        value ? 'border-[#e94560] bg-[#e94560]/10' : 'border-[#2d3748] bg-[#0f3460]/30'
      }`}
    >
      <div className="text-left">
        <p className="text-white text-sm font-medium">{label}</p>
        <p className="text-[#718096] text-xs">{desc}</p>
      </div>
      <div className={`w-11 h-6 rounded-full transition-colors relative ${value ? 'bg-[#e94560]' : 'bg-[#2d3748]'}`}>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </div>
    </button>
  )
}
