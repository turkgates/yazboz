import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  supabase,
  fetchGameWithRounds,
  insertRound,
  updateGame,
  updateRound,
  deleteRound,
} from '@/lib/supabase'
import { useGameStore } from '@/stores/gameStore'
import { ArrowLeft, Settings, Plus, MoreVertical } from 'lucide-react'
import type { RoundInput, Round } from '@/types'
import { calculateAllScores } from '@/lib/calculations'
import { v4 as uuidv4 } from 'uuid'
import { formatDate } from '@/lib/dateUtils'
import { RoundEntryModal } from '@/components/game/RoundEntryModal'

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
  const {
    currentGame,
    rounds,
    loadGame,
    addRound,
    updateRoundInStore,
    deleteRoundInStore,
    finishGame,
    isGameFinished,
  } = useGameStore()

  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingRound, setEditingRound] = useState<Round | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

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

  const buildScores = (input: RoundInput) => {
    if (!currentGame) return {}
    return calculateAllScores(
      input.playerResults,
      input.color,
      input.okeyThrown,
      input.doubleFinish,
      currentGame.settings
    )
  }

  const handleRoundSaved = async (input: RoundInput) => {
    if (!currentGame) return

    if (editingRound) {
      const scores = buildScores(input)
      updateRoundInStore(editingRound.id, input)
      setShowModal(false)
      setEditingRound(null)

      try {
        await updateRound(editingRound.id, {
          color: input.color,
          okey_thrown: input.okeyThrown,
          double_finish: input.doubleFinish,
          scores,
        })
      } catch (err) {
        console.error('Update round error:', err)
      }
      return
    }

    const roundId = uuidv4()
    const roundNumber = rounds.length + 1
    const scores = buildScores(input)

    addRound(roundId, roundNumber, input)
    setShowModal(false)

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
    } catch (err) {
      console.error('Insert round error:', err)
    }

    if (roundNumber >= currentGame.total_rounds) {
      finishGame()
      try {
        await updateGame(gameId, { status: 'finished', finished_at: new Date().toISOString() })
      } catch (err) {
        console.error('Finish game error:', err)
      }
      navigate({ to: '/game-over/$gameId', params: { gameId } })
    }
  }

  const handleDeleteRound = async (roundId: string) => {
    if (!currentGame) return

    deleteRoundInStore(roundId)
    setConfirmDeleteId(null)
    setOpenMenuId(null)

    const updatedRounds = useGameStore.getState().rounds

    try {
      await deleteRound(roundId)
      for (const round of updatedRounds) {
        await updateRound(round.id, { round_number: round.round_number })
      }
    } catch (err) {
      console.error('Delete round error:', err)
    }

    if (currentGame.status === 'finished' && updatedRounds.length < currentGame.total_rounds) {
      const reopenedGame = { ...currentGame, status: 'active' as const, finished_at: null }
      loadGame(reopenedGame, updatedRounds)
      try {
        await updateGame(gameId, { status: 'active', finished_at: null })
      } catch (err) {
        console.error('Reopen game error:', err)
      }
    }
  }

  const openEditModal = (round: Round) => {
    setEditingRound(round)
    setShowModal(true)
    setOpenMenuId(null)
  }

  const openNewModal = () => {
    setEditingRound(null)
    setShowModal(true)
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
        <button onClick={() => navigate({ to: '/home' })} className="text-[#e94560]">
          Ana Sayfaya Dön
        </button>
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
              {gameOver
                ? 'Oyun Bitti!'
                : `El ${Math.min(currentRound, currentGame.total_rounds)} / ${currentGame.total_rounds}`}
            </p>
            <p className="text-[#718096] text-xs">{formatDate(currentGame.created_at)}</p>
          </div>
          <button className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0]">
            <Settings size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-2 py-3 max-w-lg mx-auto w-full">
        <ScoreTable
          players={currentGame.players}
          rounds={rounds}
          totals={totals}
          currentRound={currentRound}
          totalRounds={currentGame.total_rounds}
          openMenuId={openMenuId}
          onMenuToggle={setOpenMenuId}
          onEdit={openEditModal}
          onDelete={(id) => {
            setConfirmDeleteId(id)
            setOpenMenuId(null)
          }}
        />
      </div>

      {!gameOver && (
        <div className="px-4 pb-6 pt-3 bg-[#1a1a2e] border-t border-[#2d3748] safe-bottom max-w-lg mx-auto w-full">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={openNewModal}
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

      <AnimatePresence>
        {showModal && (
          <RoundEntryModal
            game={currentGame}
            roundNumber={currentRound}
            editingRound={editingRound}
            onSave={handleRoundSaved}
            onClose={() => {
              setShowModal(false)
              setEditingRound(null)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDeleteId && (
          <ConfirmDialog
            message="Bu eli silmek istediğinizden emin misiniz?"
            onCancel={() => setConfirmDeleteId(null)}
            onConfirm={() => handleDeleteRound(confirmDeleteId)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ScoreTable({
  players,
  rounds,
  totals,
  currentRound,
  totalRounds,
  openMenuId,
  onMenuToggle,
  onEdit,
  onDelete,
}: {
  players: string[]
  rounds: Round[]
  totals: Record<string, number>
  currentRound: number
  totalRounds: number
  openMenuId: string | null
  onMenuToggle: (id: string | null) => void
  onEdit: (round: Round) => void
  onDelete: (id: string) => void
}) {
  const colWidth = players.length <= 2 ? 'flex-1' : players.length === 3 ? 'w-1/3' : 'w-1/4'

  return (
    <div className="bg-[#16213e] rounded-2xl border border-[#2d3748] overflow-hidden">
      <div className="flex border-b border-[#2d3748] bg-[#0f3460]">
        <div className="w-10 shrink-0" />
        {players.map((player) => (
          <div key={player} className={`${colWidth} py-3 px-1 text-center`}>
            <p className="text-white text-xs font-semibold truncate">{player}</p>
          </div>
        ))}
        <div className="w-8 shrink-0" />
      </div>

      {rounds.map((round, idx) => (
        <RoundRow
          key={round.id}
          round={round}
          players={players}
          colWidth={colWidth}
          striped={idx % 2 !== 0}
          menuOpen={openMenuId === round.id}
          onMenuToggle={() => onMenuToggle(openMenuId === round.id ? null : round.id)}
          onEdit={() => onEdit(round)}
          onDelete={() => onDelete(round.id)}
        />
      ))}

      {Array.from({ length: Math.max(0, totalRounds - rounds.length) }).map((_, idx) => {
        const roundNum = rounds.length + idx + 1
        const isCurrentRound = roundNum === currentRound
        return (
          <div
            key={`empty-${idx}`}
            className={`flex border-b border-[#2d3748]/30 ${isCurrentRound ? 'bg-[#e94560]/5' : ''}`}
          >
            <div className="w-10 shrink-0 flex items-center justify-center">
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
            <div className="w-8 shrink-0" />
          </div>
        )
      })}

      <div className="flex bg-[#0f3460] border-t-2 border-[#2d3748]">
        <div className="w-10 shrink-0" />
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
        <div className="w-8 shrink-0" />
      </div>
    </div>
  )
}

function RoundRow({
  round,
  players,
  colWidth,
  striped,
  menuOpen,
  onMenuToggle,
  onEdit,
  onDelete,
}: {
  round: Round
  players: string[]
  colWidth: string
  striped: boolean
  menuOpen: boolean
  onMenuToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => onMenuToggle(), 500)
  }

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  return (
    <div
      className={`relative flex border-b border-[#2d3748]/50 ${striped ? 'bg-[#0f3460]/20' : ''}`}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenuToggle()
      }}
    >
      <div className="w-10 shrink-0 flex items-center justify-center">
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
      <div className="w-8 shrink-0 flex items-center justify-center relative">
        <button
          type="button"
          onClick={onMenuToggle}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[#718096] hover:text-white hover:bg-[#0f3460]"
        >
          <MoreVertical size={14} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 z-20 bg-[#0f3460] border border-[#2d3748] rounded-xl shadow-xl overflow-hidden min-w-[120px]">
            <button
              type="button"
              onClick={onEdit}
              className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-[#16213e]"
            >
              Düzenle
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-[#16213e]"
            >
              Sil
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ConfirmDialog({
  message,
  onCancel,
  onConfirm,
}: {
  message: string
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
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="relative bg-[#16213e] border border-[#2d3748] rounded-2xl p-5 max-w-sm w-full"
      >
        <p className="text-white text-center mb-5">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3 rounded-xl"
          >
            İptal
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl"
          >
            Sil
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
