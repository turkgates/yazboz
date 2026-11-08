import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchPlayers, isDuplicateRoundError, DUPLICATE_ROUND_MESSAGE, getSessionUser, getLocalSession } from '@/lib/supabase'
import {
  deleteRoundAndRenumber,
  loadGameWithRounds,
  syncInsertRound,
  syncUpdateGame,
  syncUpdateRound,
} from '@/lib/gameSync'
import { buildCezaliDetails } from '@/lib/roundDetails'
import type { SavedPlayer } from '@/types'
import { useGameStore } from '@/stores/gameStore'
import { useViewStore } from '@/stores/viewStore'
import { Plus, MoreVertical } from 'lucide-react'
import type { Game, RoundInput, Round } from '@/types'
import { calculateAllScores } from '@/lib/calculations'
import { v4 as uuidv4 } from 'uuid'
import { RoundEntryModal } from '@/components/game/RoundEntryModal'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { GameHeader } from '@/components/game/GameHeader'
import { GameSettingsModal } from '@/components/game/GameSettingsModal'
import { TeamScoreTable } from '@/components/game/TeamScoreTable'
import {
  ConfirmDialog,
  DELETE_REOPENS_HINT,
  HiddenTotal,
  ROUND_TAP_HINT,
  RoundActionSheet,
  TotalsToggle,
} from '@/components/game/RoundActions'
import { SayiliGameView } from '@/components/game/SayiliGameView'
import { OkeyYuzbirGameView } from '@/components/game/OkeyYuzbirGameView'
import { BankoluGameView } from '@/components/game/BankoluGameView'
import { getTeams, isCezaliEsli, isCezaliSettings, is101Game, isBankoluGame, isSayiliGame, teamLabel } from '@/lib/gameTypes'
import { DEFAULT_SETTINGS, type CezaliGameSettings } from '@/types'

export const Route = createFileRoute('/game/$gameId')({
  beforeLoad: async () => {
    const session = await getLocalSession()
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
    appendRound,
    updateRoundInStore,
    finishGame,
    isGameFinished,
  } = useGameStore()

  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingRound, setEditingRound] = useState<Round | null>(null)
  const [actionRound, setActionRound] = useState<Round | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Round | null>(null)
  const hideTotals = useViewStore((s) => s.hideTotals)
  const [savedPlayers, setSavedPlayers] = useState<SavedPlayer[]>([])
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    loadGameData()
    loadSavedPlayers()
  }, [gameId])

  const loadSavedPlayers = async () => {
    const { data: { user } } = await getSessionUser()
    if (!user) return
    if (!navigator.onLine) return
    const { data } = await fetchPlayers(user.id)
    setSavedPlayers(data ?? [])
  }

  const loadGameData = async () => {
    setLoading(true)
    const { game, rounds: r } = await loadGameWithRounds(gameId)
    if (game) loadGame(game, r)
    setLoading(false)
  }

  const getCezaliSettings = (game: Game): CezaliGameSettings =>
    isCezaliSettings(game.settings) ? game.settings : DEFAULT_SETTINGS

  const buildScores = (input: RoundInput) => {
    if (!currentGame) return {}
    return calculateAllScores(
      input.playerResults,
      input.color,
      input.okeyThrown,
      input.doubleFinish,
      getCezaliSettings(currentGame),
      input.fakeOkey ?? false
    )
  }

  const handleRoundSaved = async (input: RoundInput): Promise<boolean> => {
    if (!currentGame) return false

    const scores = buildScores(input)
    const details = buildCezaliDetails(input.noWinner ?? false, input.playerResults)

    if (editingRound) {
      const { error } = await syncUpdateRound(gameId, editingRound.id, {
        color: input.color,
        okey_thrown: input.okeyThrown,
        double_finish: input.doubleFinish,
        fake_okey: input.fakeOkey ?? false,
        scores,
        details,
      })

      if (error) {
        console.error('Round kayıt hatası:', error)
        alert('El kaydedilemedi: ' + error.message)
        return false
      }

      updateRoundInStore(editingRound.id, input)
      setShowModal(false)
      setEditingRound(null)
      return true
    }

    const roundNumber = rounds.length + 1
    const roundId = uuidv4()

    const { data, error } = await syncInsertRound({
      id: roundId,
      game_id: gameId,
      round_number: roundNumber,
      color: input.color,
      okey_thrown: input.okeyThrown,
      double_finish: input.doubleFinish,
      fake_okey: input.fakeOkey ?? false,
      scores,
      details,
    })

    if (error) {
      console.error('Round kayıt hatası:', error)
      if (isDuplicateRoundError(error)) {
        setShowModal(false)
        await loadGameData()
        alert(DUPLICATE_ROUND_MESSAGE)
        return true
      }
      alert('El kaydedilemedi: ' + error.message)
      return false
    }

    if (data) {
      appendRound(data)
    }

    setShowModal(false)

    if (roundNumber >= currentGame.total_rounds) {
      finishGame()
      const { error: finishError } = await syncUpdateGame(gameId, {
        status: 'finished',
        finished_at: new Date().toISOString(),
      })
      if (finishError) {
        console.error('Finish game error:', finishError)
      }
      navigate({ to: '/game-over/$gameId', params: { gameId } })
    }
    return true
  }

  const handleDeleteRound = async (round: Round) => {
    if (!currentGame) return
    setConfirmDelete(null)

    const { rounds: remaining, error } = await deleteRoundAndRenumber(gameId, rounds, round.id)
    if (error) {
      console.error('Delete round error:', error)
      alert('El silinemedi: ' + error.message)
      return
    }

    // Biten oyunda el silinirse oyun açılır: el yeniden girilince tekrar biter
    if (currentGame.status === 'finished') {
      loadGame({ ...currentGame, status: 'active', finished_at: null }, remaining)
      const { error: reopenError } = await syncUpdateGame(gameId, { status: 'active', finished_at: null })
      if (reopenError) console.error('Reopen game error:', reopenError)
      return
    }
    loadGame(currentGame, remaining)
  }

  const openEditModal = (round: Round) => {
    setEditingRound(round)
    setShowModal(true)
    setActionRound(null)
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

  if (isSayiliGame(currentGame)) {
    return <SayiliGameView gameId={gameId} />
  }

  if (is101Game(currentGame)) {
    return <OkeyYuzbirGameView gameId={gameId} />
  }

  if (isBankoluGame(currentGame)) {
    return <BankoluGameView gameId={gameId} />
  }

  const isEsli = isCezaliEsli(currentGame)
  const teams = isEsli ? getTeams(currentGame) : []
  const isFinished = currentGame.status === 'finished'
  const gameOver = isGameFinished()
  const currentRound = rounds.length + 1

  const teamTotals: Record<string, number> = {}
  if (isEsli) {
    for (const team of teams) {
      const label = teamLabel(team)
      teamTotals[label] = rounds.reduce((sum, r) => sum + (r.scores[label] ?? 0), 0)
    }
  }

  const totals: Record<string, number> = {}
  for (const player of currentGame.players) {
    totals[player] = rounds.reduce((sum, r) => sum + (r.scores[player] ?? 0), 0)
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      <GameHeader
        game={currentGame}
        isFinished={isFinished}
        subtitle={
          gameOver
            ? 'Oyun Bitti!'
            : `El ${Math.min(currentRound, currentGame.total_rounds)} / ${currentGame.total_rounds}`
        }
        onSettings={!isFinished ? () => setShowSettings(true) : undefined}
      />

      <div className="flex-1 overflow-auto px-2 py-3 max-w-lg mx-auto w-full">
        {rounds.length > 0 && (
          <p className="text-[#718096] text-xs text-center mb-2">{ROUND_TAP_HINT}</p>
        )}
        {isEsli ? (
          <TeamScoreTable
            teams={teams}
            rounds={rounds}
            teamTotals={teamTotals}
            hideTotals={hideTotals}
            onRoundTap={setActionRound}
          />
        ) : (
          <ScoreTable
            players={currentGame.players}
            rounds={rounds}
            totals={totals}
            currentRound={currentRound}
            totalRounds={currentGame.total_rounds}
            savedPlayers={savedPlayers}
            hideTotals={hideTotals}
            onRoundTap={setActionRound}
          />
        )}
      </div>

      {!isFinished && !gameOver && (
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
        {showModal && (!isFinished || editingRound) && (
          <RoundEntryModal
            game={currentGame}
            roundNumber={currentRound}
            editingRound={editingRound}
            teams={isEsli ? teams : undefined}
            onSave={handleRoundSaved}
            onClose={() => {
              setShowModal(false)
              setEditingRound(null)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettings && (
          <GameSettingsModal
            game={currentGame}
            onClose={() => setShowSettings(false)}
            onSaved={loadGameData}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {actionRound && (
          <RoundActionSheet
            roundNumber={actionRound.round_number}
            onEdit={() => openEditModal(actionRound)}
            onDelete={() => {
              setConfirmDelete(actionRound)
              setActionRound(null)
            }}
            onClose={() => setActionRound(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDelete && (
          <ConfirmDialog
            message={`${confirmDelete.round_number}. eli silmek istediğinizden emin misiniz?`}
            detail={isFinished ? DELETE_REOPENS_HINT : undefined}
            onCancel={() => setConfirmDelete(null)}
            onConfirm={() => handleDeleteRound(confirmDelete)}
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
  savedPlayers,
  hideTotals,
  onRoundTap,
}: {
  players: string[]
  rounds: Round[]
  totals: Record<string, number>
  currentRound: number
  totalRounds: number
  savedPlayers: SavedPlayer[]
  hideTotals: boolean
  onRoundTap: (round: Round) => void
}) {
  const navigate = useNavigate()
  const colWidth = players.length <= 2 ? 'flex-1' : players.length === 3 ? 'w-1/3' : 'w-1/4'

  const playerDataByName = (name: string) =>
    savedPlayers.find((p) => p.name.toLowerCase() === name.toLowerCase())

  return (
    <div className="bg-[#16213e] rounded-2xl border border-[#2d3748] overflow-hidden">
      <div className="flex border-b border-[#2d3748] bg-[#0f3460]">
        <div className="w-10 shrink-0" />
        {players.map((player) => {
          const playerData = playerDataByName(player)
          const playerId = playerData?.id
          return (
            <div key={player} className={`${colWidth} py-2 px-1 flex flex-col items-center gap-1`}>
              <PlayerAvatar
                name={player}
                avatarUrl={playerData?.avatar_url}
                size={40}
                onClick={
                  playerId
                    ? () => navigate({ to: '/player/$playerId', params: { playerId } })
                    : undefined
                }
              />
              <p className="text-white text-xs font-semibold truncate w-full text-center">{player}</p>
            </div>
          )
        })}
        <div className="w-8 shrink-0" />
      </div>

      {rounds.map((round, idx) => (
        <RoundRow
          key={round.id}
          round={round}
          players={players}
          colWidth={colWidth}
          striped={idx % 2 !== 0}
          onTap={() => onRoundTap(round)}
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

      <div className="flex items-center bg-[#0f3460] border-t-2 border-[#2d3748]">
        <div className="w-10 shrink-0 flex items-center justify-center">
          <TotalsToggle />
        </div>
        {players.map((player) => {
          const total = totals[player] ?? 0
          return (
            <div key={player} className={`${colWidth} py-3 px-1 text-center`}>
              {hideTotals ? (
                <HiddenTotal className="text-sm" />
              ) : (
                <p className={`text-sm font-bold ${total < 0 ? 'text-green-400' : total > 0 ? 'text-red-400' : 'text-white'}`}>
                  {total}
                </p>
              )}
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
  onTap,
}: {
  round: Round
  players: string[]
  colWidth: string
  striped: boolean
  onTap: () => void
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${round.round_number}. el`}
      className={`w-full flex text-left border-b border-[#2d3748]/50 active:bg-[#e94560]/10 ${striped ? 'bg-[#0f3460]/20' : ''}`}
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
      <div className="w-8 shrink-0 flex items-center justify-center text-[#718096]">
        <MoreVertical size={14} />
      </div>
    </button>
  )
}
