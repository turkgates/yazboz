import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { Color, Game, Round, RoundInput } from '@/types'
import { COLOR_LABELS, COLOR_HEX } from '@/types'
import {
  getLoserMultiplier,
  getSpecialMultiplier,
  inferRoundInputFromScores,
  previewRoundScore,
} from '@/lib/calculations'

interface RoundEntryModalProps {
  game: Game
  roundNumber: number
  editingRound?: Round | null
  onSave: (input: RoundInput) => void
  onClose: () => void
}

const COLORS: Color[] = ['black', 'red', 'yellow', 'green']

export function RoundEntryModal({
  game,
  roundNumber,
  editingRound,
  onSave,
  onClose,
}: RoundEntryModalProps) {
  const settings = game.settings
  const isEditing = !!editingRound

  const [color, setColor] = useState<Color | null>(editingRound?.color ?? null)
  const [okeyThrown, setOkeyThrown] = useState(editingRound?.okey_thrown ?? false)
  const [doubleFinish, setDoubleFinish] = useState(editingRound?.double_finish ?? false)
  const [winner, setWinner] = useState<string | null>(null)
  const [rawPoints, setRawPoints] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!editingRound) return
    const inferred = inferRoundInputFromScores(editingRound, game.players, settings)
    setColor(editingRound.color)
    setOkeyThrown(editingRound.okey_thrown)
    setDoubleFinish(editingRound.double_finish)
    setWinner(inferred.winner)
    setRawPoints(inferred.rawPoints)
  }, [editingRound, game.players, settings])

  const loserMultiplier = color
    ? getLoserMultiplier(color, okeyThrown, doubleFinish, settings.colorMultipliers)
    : null

  const specialMultiplier = getSpecialMultiplier(okeyThrown, doubleFinish)

  const getPreviewScore = (player: string): number | null => {
    if (!color) return null
    const isWin = player === winner
    const raw = parseInt(rawPoints[player] || '0', 10) || 0
    if (!isWin && !winner) return null
    return previewRoundScore(player, isWin, raw, color, okeyThrown, doubleFinish, settings)
  }

  const canSave = color !== null && winner !== null

  const handleSave = () => {
    if (!color || !winner) return
    const playerResults = game.players.map((p) => ({
      playerName: p,
      isWinner: p === winner,
      rawPoints: p === winner ? 0 : parseInt(rawPoints[p] || '0', 10) || 0,
    }))
    onSave({ color, okeyThrown, doubleFinish, playerResults })
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
          {/* Renk seçimi */}
          <section>
            <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
              Okey Rengi
            </p>
            <div className="grid grid-cols-4 gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`p-2 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${
                    color === c
                      ? 'border-[#e94560] bg-[#e94560]/10'
                      : 'border-[#2d3748] bg-[#0f3460]/30'
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full border border-white/20"
                    style={{ backgroundColor: COLOR_HEX[c] }}
                  />
                  <span className="text-white text-[10px] font-medium">{COLOR_LABELS[c][0]}</span>
                  <span className="text-[#718096] text-[10px]">×{settings.colorMultipliers[c]}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Özel durum */}
          <section>
            <div className="flex gap-3 mb-2">
              <label className="flex-1 flex items-center gap-2 bg-[#0f3460]/40 border border-[#2d3748] rounded-xl p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={okeyThrown}
                  onChange={(e) => setOkeyThrown(e.target.checked)}
                  className="accent-[#e94560] w-4 h-4"
                />
                <span className="text-white text-sm">Okey Atıldı</span>
              </label>
              <label className="flex-1 flex items-center gap-2 bg-[#0f3460]/40 border border-[#2d3748] rounded-xl p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={doubleFinish}
                  onChange={(e) => setDoubleFinish(e.target.checked)}
                  className="accent-[#e94560] w-4 h-4"
                />
                <span className="text-white text-sm">Çiftten</span>
              </label>
            </div>
            <p className="text-center text-[#a0aec0] text-sm">
              Çarpan:{' '}
              <span className="text-white font-bold">
                {color
                  ? `×${loserMultiplier} (özel ×${specialMultiplier})`
                  : 'Renk seçin'}
              </span>
            </p>
          </section>

          {/* Oyuncular */}
          <section>
            <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
              Oyuncular
            </p>
            <div className="flex flex-col gap-2">
              {game.players.map((player) => {
                const isWin = winner === player
                return (
                  <div
                    key={player}
                    className={`flex items-center gap-2 bg-[#0f3460]/40 border rounded-xl p-3 ${
                      isWin ? 'border-green-500/50' : 'border-[#2d3748]'
                    }`}
                  >
                    <span className="text-white text-sm font-medium flex-1 min-w-0 truncate">
                      {player}
                    </span>
                    <button
                      type="button"
                      onClick={() => setWinner(isWin ? null : player)}
                      className={`px-2 py-1 rounded-full text-xs font-semibold shrink-0 ${
                        isWin ? 'bg-green-500 text-white' : 'bg-[#2d3748] text-[#a0aec0]'
                      }`}
                    >
                      {isWin ? 'Bitti ✓' : 'Bitti'}
                    </button>
                    {!isWin && (
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="0"
                        value={rawPoints[player] ?? ''}
                        onChange={(e) =>
                          setRawPoints((p) => ({ ...p, [player]: e.target.value }))
                        }
                        className="w-16 bg-[#1a1a2e] border border-[#2d3748] rounded-lg py-1.5 px-2 text-white text-sm text-center focus:outline-none focus:border-[#e94560]"
                      />
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-[#718096] text-xs mt-2">Sadece 1 kişi bitti seçilebilir</p>
          </section>

          {/* Önizleme */}
          {color && winner && (
            <section className="bg-[#0f3460]/30 border border-[#2d3748] rounded-xl p-4">
              <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
                Önizleme
              </p>
              <div className="grid grid-cols-2 gap-2">
                {game.players.map((player) => {
                  const score = getPreviewScore(player)
                  if (score === null) return null
                  return (
                    <div key={player} className="flex justify-between text-sm">
                      <span className="text-white truncate mr-2">{player}</span>
                      <span className={`font-bold shrink-0 ${score < 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {score > 0 ? `+${score}` : score}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

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
            disabled={!canSave}
            className="flex-[2] bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-colors"
          >
            Kaydet
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
