import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import { v4 as uuidv4 } from 'uuid'
import { fetchGameWithRounds, insertRound, updateGame } from '@/lib/supabase'
import { useGameStore } from '@/stores/gameStore'
import type { SayiliOkeySettings } from '@/types'
import {
  computeSayiliCurrentScores,
  getIndicatorUsedThisEl,
  getSayiliFinishValue,
  getTeams,
  isEsliGame,
  teamLabel,
  type SayiliFinishType,
} from '@/lib/gameTypes'
import { GameHeader } from '@/components/game/GameHeader'

interface SayiliGameViewProps {
  gameId: string
}

function getScoreColor(score: number): string {
  if (score <= 0) return 'text-green-400'
  if (score === 1) return 'text-red-500'
  if (score <= 5) return 'text-orange-400'
  if (score <= 10) return 'text-[#f5a623]'
  return 'text-green-400'
}

export function SayiliGameView({ gameId }: SayiliGameViewProps) {
  const navigate = useNavigate()
  const { currentGame, rounds, loadGame, appendRound, finishGame } = useGameStore()
  const [loading, setLoading] = useState(true)
  const [finishTarget, setFinishTarget] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [saving, setSaving] = useState(false)

  const game = currentGame
  const settings = (game?.settings ?? {}) as SayiliOkeySettings
  const esli = game ? isEsliGame(game) : false
  const entities = useMemo(() => {
    if (!game) return [] as string[]
    return esli ? getTeams(game).map(teamLabel) : game.players
  }, [game, esli])

  const indicatorUsed = useMemo(
    () => getIndicatorUsedThisEl(rounds, entities),
    [rounds, entities.join(',')]
  )

  useEffect(() => {
    loadGameData()
  }, [gameId])

  const loadGameData = async () => {
    setLoading(true)
    const { game: g, rounds: r } = await fetchGameWithRounds(gameId)
    if (g) loadGame(g, r)
    setLoading(false)
  }

  if (loading || !game) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isFinished = game.status === 'finished'
  const currentScores = computeSayiliCurrentScores(game, rounds)
  const indicatorValue = settings.indicatorValue ?? 1

  const finishGameAndNavigate = async () => {
    finishGame()
    await updateGame(gameId, { status: 'finished', finished_at: new Date().toISOString() })
    navigate({ to: '/game-over/$gameId', params: { gameId } })
  }

  const checkAutoFinish = (scores: Record<string, number>) => {
    if (Object.values(scores).some((s) => s <= 0)) {
      finishGameAndNavigate()
      return true
    }
    return false
  }

  const saveRound = async (
    entity: string,
    drop: number,
    opts: { isIndicatorOnly: boolean }
  ) => {
    setSaving(true)
    const roundNumber = rounds.length + 1
    const roundId = uuidv4()

    const scores: Record<string, number> = {}
    for (const e of entities) scores[e] = 0
    scores[entity] = -drop

    const { data, error } = await insertRound({
      id: roundId,
      game_id: gameId,
      round_number: roundNumber,
      color: 'black',
      okey_thrown: false,
      double_finish: false,
      fake_okey: false,
      scores,
      indicator_players: opts.isIndicatorOnly ? [entity] : [],
      is_indicator_only: opts.isIndicatorOnly,
    })

    setSaving(false)

    if (error) {
      alert(opts.isIndicatorOnly ? 'Gösterge kaydedilemedi: ' + error.message : 'El kaydedilemedi: ' + error.message)
      return false
    }

    if (data) appendRound(data)

    const updatedScores = computeSayiliCurrentScores(game, [...rounds, data!])
    checkAutoFinish(updatedScores)
    return true
  }

  const handleIndicator = async (entity: string) => {
    if (!settings.showIndicator || isFinished || saving) return
    if (indicatorUsed[entity]) return

    const score = currentScores[entity] ?? settings.startScore
    if (score <= 1) return

    await saveRound(entity, indicatorValue, { isIndicatorOnly: true })
  }

  const handleFinishSelect = async (type: SayiliFinishType) => {
    if (!finishTarget || saving) return
    const finishValue = getSayiliFinishValue(settings, type)

    setFinishTarget(null)
    await saveRound(finishTarget, finishValue, { isIndicatorOnly: false })
  }

  const handleManualEnd = async () => {
    setConfirmEnd(false)
    await finishGameAndNavigate()
  }

  const gridCols = entities.length <= 2 ? 'grid-cols-2' : 'grid-cols-4'

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      <GameHeader
        game={game}
        isFinished={isFinished}
        subtitle={`El ${rounds.length + 1}`}
        showEndGame={!isFinished}
        onEndGame={() => setConfirmEnd(true)}
      />

      <div className="flex-1 overflow-auto px-3 py-3 max-w-lg mx-auto w-full">
        <div className="bg-[#16213e] rounded-2xl border border-[#2d3748] overflow-hidden">
          <div className={`grid ${gridCols} border-b border-[#2d3748] bg-[#0f3460] p-3 gap-2`}>
            {entities.map((entity) => {
              const score = currentScores[entity] ?? settings.startScore
              const used = indicatorUsed[entity]
              return (
                <div key={entity} className="text-center flex flex-col items-center">
                  <p className="text-white text-[10px] font-semibold truncate w-full mb-1">
                    {entity}
                  </p>
                  <p className={`text-3xl font-black mb-2 ${getScoreColor(score)}`}>
                    {score}
                  </p>
                  {!isFinished && (
                    <div className="flex gap-1 w-full">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setFinishTarget(entity)}
                        className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-[10px]"
                      >
                        Bitti ✓
                      </button>
                      {settings.showIndicator && (
                        <button
                          type="button"
                          onClick={() => handleIndicator(entity)}
                          disabled={used || score <= 1 || saving}
                          className={`flex-1 font-bold py-2 rounded-lg text-[10px] transition-colors ${
                            used
                              ? 'opacity-50 cursor-not-allowed bg-[#2d3748] text-[#718096]'
                              : 'bg-[#f5a623] hover:bg-[#e8b020] text-[#1a1a2e]'
                          } disabled:opacity-40`}
                        >
                          ★
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {rounds.map((round) => (
            <div
              key={round.id}
              className={`flex border-b border-[#2d3748]/40 ${
                round.is_indicator_only ? 'bg-[#f5a623]/5' : ''
              }`}
            >
              <div className="w-10 shrink-0 flex items-center justify-center text-[#718096] text-xs">
                {round.is_indicator_only ? '★' : round.round_number}
              </div>
              {entities.map((entity) => {
                const val = round.scores[entity] ?? 0
                const isIndicatorCell = round.is_indicator_only && val !== 0
                return (
                  <div key={entity} className="flex-1 py-2 text-center text-xs font-medium">
                    {isIndicatorCell ? (
                      <span className="text-[#f5a623]">
                        ★ -{Math.abs(val)}
                      </span>
                    ) : val === 0 ? (
                      <span className="text-[#718096]">0</span>
                    ) : (
                      <span className="text-[#a0aec0]">{val}</span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {finishTarget && (
          <FinishTypeModal
            settings={settings}
            onSelect={handleFinishSelect}
            onClose={() => setFinishTarget(null)}
          />
        )}
        {confirmEnd && (
          <ConfirmEndModal
            onCancel={() => setConfirmEnd(false)}
            onConfirm={handleManualEnd}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function FinishTypeModal({
  settings,
  onSelect,
  onClose,
}: {
  settings: SayiliOkeySettings
  onSelect: (type: SayiliFinishType) => void
  onClose: () => void
}) {
  const options: { type: SayiliFinishType; label: string; value: number }[] = [
    { type: 'normal', label: 'Normal', value: settings.normalFinish },
    { type: 'okey', label: 'Okey', value: settings.okeyOrDouble },
    { type: 'double', label: 'Çiftten', value: settings.okeyOrDouble },
    { type: 'okey_double', label: 'Çiftten + Okey', value: settings.okeyAndDouble },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-[#16213e] rounded-t-3xl border-t border-x border-[#2d3748] safe-bottom p-5"
      >
        <h3 className="text-white font-bold mb-4">Bitiş Tipi</h3>
        <div className="flex flex-col gap-2">
          {options.map((opt) => (
            <button
              key={opt.type}
              type="button"
              onClick={() => onSelect(opt.type)}
              className="w-full bg-[#0f3460] hover:bg-[#1a4a7a] text-white font-semibold py-3.5 rounded-xl text-left px-4"
            >
              {opt.label} (-{opt.value})
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

function ConfirmEndModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
    >
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative bg-[#16213e] border border-[#2d3748] rounded-2xl p-5 max-w-sm w-full">
        <p className="text-white text-center mb-5">Oyunu bitirmek istediğinizden emin misiniz?</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3 rounded-xl">
            İptal
          </button>
          <button onClick={onConfirm} className="flex-1 bg-[#e94560] text-white font-bold py-3 rounded-xl">
            Bitir
          </button>
        </div>
      </div>
    </motion.div>
  )
}
