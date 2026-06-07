import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import { v4 as uuidv4 } from 'uuid'
import {
  fetchGameWithRounds,
  insertRound,
  updateGame,
} from '@/lib/supabase'
import { useGameStore } from '@/stores/gameStore'
import type { SayiliOkeySettings } from '@/types'
import {
  computeSayiliCurrentScores,
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

export function SayiliGameView({ gameId }: SayiliGameViewProps) {
  const navigate = useNavigate()
  const { currentGame, rounds, loadGame, appendRound, finishGame } = useGameStore()
  const [loading, setLoading] = useState(true)
  const [pendingScores, setPendingScores] = useState<Record<string, number>>({})
  const [pendingIndicators, setPendingIndicators] = useState<string[]>([])
  const [finishTarget, setFinishTarget] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)

  const game = currentGame
  const settings = (game?.settings ?? {}) as SayiliOkeySettings
  const esli = game ? isEsliGame(game) : false
  const entities = useMemo(() => {
    if (!game) return [] as string[]
    return esli ? getTeams(game).map(teamLabel) : game.players
  }, [game, esli])

  useEffect(() => {
    loadGameData()
  }, [gameId])

  const loadGameData = async () => {
    setLoading(true)
    const { game: g, rounds: r } = await fetchGameWithRounds(gameId)
    if (g) loadGame(g, r)
    setLoading(false)
  }

  useEffect(() => {
    if (!entities.length) return
    const init: Record<string, number> = {}
    for (const e of entities) init[e] = 0
    setPendingScores(init)
    setPendingIndicators([])
  }, [entities.join(',')])

  if (loading || !game) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isFinished = game.status === 'finished'
  const currentScores = computeSayiliCurrentScores(game, rounds)
  const displayScores = { ...currentScores }
  for (const [k, v] of Object.entries(pendingScores)) {
    displayScores[k] = (displayScores[k] ?? settings.startScore) + v
  }

  const hasPendingAction = Object.values(pendingScores).some((v) => v !== 0) || pendingIndicators.length > 0

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

  const handleIndicator = (entity: string) => {
    if (!settings.showIndicator) return
    const score = displayScores[entity] ?? settings.startScore
    if (score <= 1) return
    setPendingIndicators((prev) =>
      prev.includes(entity) ? prev.filter((e) => e !== entity) : [...prev, entity]
    )
  }

  const handleFinishSelect = async (type: SayiliFinishType) => {
    if (!finishTarget) return
    const finishValue = getSayiliFinishValue(settings, type)
    const hasIndicator = pendingIndicators.includes(finishTarget)
    const totalDrop = finishValue + (hasIndicator ? settings.indicatorValue : 0)

    const newPending = { ...pendingScores, [finishTarget]: (pendingScores[finishTarget] ?? 0) - totalDrop }
    setPendingScores(newPending)
    setFinishTarget(null)

    const newScores = { ...currentScores }
    for (const [k, v] of Object.entries(newPending)) {
      newScores[k] += v
    }
    if (checkAutoFinish(newScores)) return
  }

  const saveEl = async (
    scores: Record<string, number>,
    indicators: string[]
  ) => {
    const roundNumber = rounds.length + 1
    const roundId = uuidv4()
    const { data, error } = await insertRound({
      id: roundId,
      game_id: gameId,
      round_number: roundNumber,
      color: 'black',
      okey_thrown: false,
      double_finish: false,
      fake_okey: false,
      scores,
      indicator_players: indicators,
    })

    if (error) {
      alert('El kaydedilemedi: ' + error.message)
      return
    }

    if (data) appendRound(data)

    const init: Record<string, number> = {}
    for (const e of entities) init[e] = 0
    setPendingScores(init)
    setPendingIndicators([])

    const updatedScores = computeSayiliCurrentScores(game, [...rounds, data!])
    checkAutoFinish(updatedScores)
  }

  const buildFinalScores = () => {
    const finalScores = { ...pendingScores }
    for (const entity of pendingIndicators) {
      if ((finalScores[entity] ?? 0) === 0) {
        finalScores[entity] = -settings.indicatorValue
      }
    }
    return finalScores
  }

  const handleSaveEl = () => {
    if (!hasPendingAction) return
    saveEl(buildFinalScores(), pendingIndicators)
  }

  const handleManualEnd = async () => {
    setConfirmEnd(false)
    await finishGameAndNavigate()
  }

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
        <div className="bg-[#16213e] rounded-2xl border border-[#2d3748] overflow-hidden mb-4">
          <div className={`grid ${entities.length <= 2 ? 'grid-cols-2' : 'grid-cols-4'} border-b border-[#2d3748] bg-[#0f3460] p-3`}>
            {entities.map((entity) => (
              <div key={entity} className="text-center">
                <p className="text-white text-[10px] font-semibold truncate mb-1">{entity}</p>
                <p className={`text-2xl font-black ${(displayScores[entity] ?? 0) <= 5 ? 'text-[#e94560]' : 'text-white'}`}>
                  {displayScores[entity] ?? settings.startScore}
                </p>
              </div>
            ))}
          </div>

          {rounds.map((round) => (
            <div key={round.id} className="flex border-b border-[#2d3748]/40">
              <div className="w-10 shrink-0 flex items-center justify-center text-[#718096] text-xs">
                {round.round_number}
              </div>
              {entities.map((entity) => {
                const val = round.scores[entity] ?? 0
                return (
                  <div key={entity} className="flex-1 py-2 text-center text-xs font-medium text-[#a0aec0]">
                    {val === 0 ? '0' : val}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {!isFinished && (
          <div className="space-y-3">
            {entities.map((entity) => {
              const score = displayScores[entity] ?? settings.startScore
              const indicatorOn = pendingIndicators.includes(entity)
              return (
                <div key={entity} className="bg-[#16213e] border border-[#2d3748] rounded-xl p-3">
                  <p className="text-white text-sm font-semibold mb-2">{entity}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFinishTarget(entity)}
                      className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl text-sm"
                    >
                      Bitti ✓
                    </button>
                    {settings.showIndicator && (
                      <button
                        type="button"
                        onClick={() => handleIndicator(entity)}
                        disabled={score <= 1}
                        className={`flex-1 font-bold py-3 rounded-xl text-sm transition-colors ${
                          indicatorOn
                            ? 'bg-[#f5a623] text-[#1a1a2e]'
                            : 'bg-[#0f3460] text-[#a0aec0] hover:text-white'
                        } disabled:opacity-40`}
                      >
                        Gösterge ★
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {hasPendingAction && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSaveEl}
                className="w-full bg-[#e94560] text-white font-bold py-4 rounded-2xl"
              >
                El Kaydet
              </motion.button>
            )}
          </div>
        )}
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
