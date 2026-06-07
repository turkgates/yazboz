import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  supabase,
  fetchGameWithRounds,
  fetchPlayers,
  insertRound,
  updateGame,
  updateRound,
  deleteRound,
} from '@/lib/supabase'
import type { SavedPlayer } from '@/types'
import { useGameStore } from '@/stores/gameStore'
import { Settings, Plus, MoreVertical } from 'lucide-react'
import { BackButton } from '@/components/layout/BackButton'
import type { Game, RoundInput, Round } from '@/types'
import { calculateAllScores } from '@/lib/calculations'
import { v4 as uuidv4 } from 'uuid'
import { formatGameDate } from '@/lib/dateUtils'
import { RoundEntryModal } from '@/components/game/RoundEntryModal'
import { PlayerAvatar } from '@/components/PlayerAvatar'

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
    appendRound,
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
  const [savedPlayers, setSavedPlayers] = useState<SavedPlayer[]>([])
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    loadGameData()
    loadSavedPlayers()
  }, [gameId])

  const loadSavedPlayers = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await fetchPlayers(user.id)
    setSavedPlayers(data ?? [])
  }

  const loadGameData = async () => {
    setLoading(true)
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
      currentGame.settings,
      input.fakeOkey ?? false
    )
  }

  const handleRoundSaved = async (input: RoundInput) => {
    if (!currentGame) return

    const scores = buildScores(input)

    if (editingRound) {
      const { error } = await updateRound(editingRound.id, {
        color: input.color,
        okey_thrown: input.okeyThrown,
        double_finish: input.doubleFinish,
        fake_okey: input.fakeOkey ?? false,
        scores,
      })

      if (error) {
        console.error('Round kayıt hatası:', error)
        alert('El kaydedilemedi: ' + error.message)
        return
      }

      updateRoundInStore(editingRound.id, input)
      setShowModal(false)
      setEditingRound(null)
      return
    }

    const roundNumber = rounds.length + 1
    const roundId = uuidv4()

    const { data, error } = await insertRound({
      id: roundId,
      game_id: gameId,
      round_number: roundNumber,
      color: input.color,
      okey_thrown: input.okeyThrown,
      double_finish: input.doubleFinish,
      fake_okey: input.fakeOkey ?? false,
      scores,
    })

    if (error) {
      console.error('Round kayıt hatası:', error)
      alert('El kaydedilemedi: ' + error.message)
      return
    }

    if (data) {
      appendRound(data)
    }

    setShowModal(false)

    if (roundNumber >= currentGame.total_rounds) {
      finishGame()
      const { error: finishError } = await updateGame(gameId, {
        status: 'finished',
        finished_at: new Date().toISOString(),
      })
      if (finishError) {
        console.error('Finish game error:', finishError)
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

  const isFinished = currentGame.status === 'finished'
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
          <BackButton showLabel={isFinished} className="shrink-0" />
          <div className="text-center flex-1 min-w-0 px-2">
            {isFinished ? (
              <span className="inline-block bg-[#f5a623]/25 text-[#f5a623] text-xs font-bold px-3 py-1 rounded-full mb-1 border border-[#f5a623]/40">
                ✓ Tamamlanan Oyun
              </span>
            ) : (
              <p className="text-white font-semibold text-sm">
                {gameOver
                  ? 'Oyun Bitti!'
                  : `El ${Math.min(currentRound, currentGame.total_rounds)} / ${currentGame.total_rounds}`}
              </p>
            )}
            {currentGame.settings.note && (
              <p className="text-white text-xs font-medium truncate">{currentGame.settings.note}</p>
            )}
            <p className="text-[#718096] text-xs">{formatGameDate(currentGame.created_at)}</p>
          </div>
          {!isFinished ? (
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0] hover:text-white transition-colors shrink-0"
            >
              <Settings size={18} />
            </button>
          ) : (
            <div className="w-9 shrink-0" />
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-2 py-3 max-w-lg mx-auto w-full">
        <ScoreTable
          players={currentGame.players}
          rounds={rounds}
          totals={totals}
          currentRound={currentRound}
          totalRounds={currentGame.total_rounds}
          savedPlayers={savedPlayers}
          readOnly={isFinished}
          openMenuId={openMenuId}
          onMenuToggle={setOpenMenuId}
          onEdit={openEditModal}
          onDelete={(id) => {
            setConfirmDeleteId(id)
            setOpenMenuId(null)
          }}
        />
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

      {gameOver && !isFinished && (
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
        {showModal && !isFinished && (
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
        {showSettings && (
          <GameSettingsModal
            game={currentGame}
            onClose={() => setShowSettings(false)}
            onSaved={loadGameData}
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
  savedPlayers,
  readOnly,
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
  savedPlayers: SavedPlayer[]
  readOnly?: boolean
  openMenuId: string | null
  onMenuToggle: (id: string | null) => void
  onEdit: (round: Round) => void
  onDelete: (id: string) => void
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
        {readOnly ? <div className="w-2 shrink-0" /> : <div className="w-8 shrink-0" />}
      </div>

      {rounds.map((round, idx) => (
        <RoundRow
          key={round.id}
          round={round}
          players={players}
          colWidth={colWidth}
          striped={idx % 2 !== 0}
          readOnly={readOnly}
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
            {readOnly ? <div className="w-2 shrink-0" /> : <div className="w-8 shrink-0" />}
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
        {readOnly ? <div className="w-2 shrink-0" /> : <div className="w-8 shrink-0" />}
      </div>
    </div>
  )
}

function RoundRow({
  round,
  players,
  colWidth,
  striped,
  readOnly,
  menuOpen,
  onMenuToggle,
  onEdit,
  onDelete,
}: {
  round: Round
  players: string[]
  colWidth: string
  striped: boolean
  readOnly?: boolean
  menuOpen: boolean
  onMenuToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startLongPress = () => {
    if (readOnly) return
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
        if (readOnly) return
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
      {!readOnly && (
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
      )}
    </div>
  )
}

function GameSettingsModal({
  game,
  onClose,
  onSaved,
}: {
  game: Game
  onClose: () => void
  onSaved: () => void
}) {
  const { loadGame } = useGameStore()
  const isActive = game.status === 'active'
  const [note, setNote] = useState(game.settings.note ?? '')
  const [totalRounds, setTotalRounds] = useState(game.total_rounds)
  const [playerNames, setPlayerNames] = useState<string[]>([...game.players])
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
      const updatedSettings = { ...game.settings, note: note.trim() || undefined }
      const nameMap: Record<string, string> = {}
      game.players.forEach((oldName, i) => {
        if (oldName !== trimmedNames[i]) nameMap[oldName] = trimmedNames[i]
      })

      const { data, error: updateError } = await updateGame(game.id, {
        total_rounds: totalRounds,
        players: trimmedNames,
        settings: updatedSettings,
      })

      if (updateError) throw updateError

      if (Object.keys(nameMap).length > 0) {
        const { rounds: gameRounds } = await fetchGameWithRounds(game.id)
        for (const round of gameRounds) {
          const newScores: Record<string, number> = {}
          for (const [key, value] of Object.entries(round.scores)) {
            newScores[nameMap[key] ?? key] = value
          }
          await updateRound(round.id, { scores: newScores })
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
        className="relative w-full max-w-lg bg-[#16213e] rounded-t-3xl border-t border-x border-[#2d3748] safe-bottom"
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
              <label className="text-[#718096] text-xs font-semibold uppercase tracking-wider mb-2 block">
                Oyuncu Sayısı
              </label>
              <input
                type="text"
                value={game.players.length.toString()}
                disabled
                className="w-full bg-[#0f3460]/20 border border-[#2d3748] rounded-xl py-3 px-4 text-[#718096] text-sm cursor-not-allowed"
              />
            </div>

            <div>
              <label className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2 block">
                Oyuncu İsimleri
              </label>
              {isActive ? (
                <div className="space-y-2">
                  {playerNames.map((name, i) => (
                    <input
                      key={i}
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

            <div>
              <label className="text-[#718096] text-xs font-semibold uppercase tracking-wider mb-2 block">
                Oyun Tipi
              </label>
              <input
                type="text"
                value="Cezalı Okey"
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
