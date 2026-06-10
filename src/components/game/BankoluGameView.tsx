import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Trophy } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { supabase, fetchGameWithRounds, fetchPlayers, insertRound, updateGame } from '@/lib/supabase'
import type { Game, Round, SavedPlayer } from '@/types'
import { useGameStore } from '@/stores/gameStore'
import {
  computeCezaliTeamTotals,
  getTeams,
  isBankoluEsli,
  teamLabel,
} from '@/lib/gameTypes'
import { calculateTotals } from '@/lib/calculations'
import {
  applyBankoToHistory,
  getBankoEntities,
  getBankoHistory,
  getForcedBankos,
  mustForceBanko,
} from '@/lib/bankoluUtils'
import { GameHeader } from '@/components/game/GameHeader'
import { GameSettingsModal } from '@/components/game/GameSettingsModal'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import {
  BankoluRoundEntryModal,
  type BankoluRoundSavePayload,
} from '@/components/game/BankoluRoundEntryModal'

interface Props {
  gameId: string
}

export function BankoluGameView({ gameId }: Props) {
  const navigate = useNavigate()
  const { currentGame, rounds: storeRounds, loadGame, appendRound, finishGame } = useGameStore()

  const [game, setGame] = useState<Game | null>(currentGame)
  const [rounds, setRounds] = useState<Round[]>(storeRounds)
  const [players, setPlayers] = useState<SavedPlayer[]>([])
  const [currentBankos, setCurrentBankos] = useState<string[]>([])
  const [showEntry, setShowEntry] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)

  const refetchGame = async () => {
    const { game: g, rounds: r } = await fetchGameWithRounds(gameId)
    if (g) {
      setGame(g)
      setRounds(r)
      loadGame(g, r)
    }
  }

  useEffect(() => {
    refetchGame()
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: pData } = await fetchPlayers(data.user.id)
        if (pData) setPlayers(pData)
      }
    })
  }, [gameId])

  const currentGame_ = game ?? currentGame
  if (!currentGame_) return null

  const esli = isBankoluEsli(currentGame_)
  const teams = esli ? getTeams(currentGame_) : []
  const columns = getBankoEntities(currentGame_)
  const totalRounds = currentGame_.total_rounds
  const isFinished = currentGame_.status === 'finished'
  const currentRound = rounds.length + 1
  const bankoHistory = getBankoHistory(currentGame_)

  const totals = useMemo(() => {
    if (esli) return computeCezaliTeamTotals(currentGame_, rounds)
    return calculateTotals(currentGame_.players, rounds.map((r) => r.scores))
  }, [currentGame_, rounds, esli])

  useEffect(() => {
    if (isFinished) return
    const forced = getForcedBankos(currentGame_, currentRound)
    if (forced.length > 0) {
      setCurrentBankos((prev) => {
        const merged = new Set([...prev, ...forced])
        return Array.from(merged)
      })
    }
  }, [currentRound, currentGame_?.id, isFinished])

  const getAvatarUrl = (name: string) =>
    players.find((p) => p.name === name)?.avatar_url ?? null

  const getAvatarPlayers = (entity: string) =>
    esli ? (teams.find((t) => teamLabel(t) === entity) ?? [entity]) : [entity]

  const toggleBanko = (entity: string) => {
    if (isFinished || saving) return
    const alreadyUsedBanko = (bankoHistory[entity]?.length ?? 0) > 0
    const forced = mustForceBanko(bankoHistory, entity, currentRound, totalRounds)

    if (alreadyUsedBanko && !currentBankos.includes(entity)) return
    if (forced && currentBankos.includes(entity)) return

    setCurrentBankos((prev) =>
      prev.includes(entity) ? prev.filter((e) => e !== entity) : [...prev, entity]
    )
  }

  const handleSave = async (payload: BankoluRoundSavePayload) => {
    if (!currentGame_) return
    setSaving(true)
    try {
      const roundNumber = rounds.length + 1
      const newHistory = applyBankoToHistory(bankoHistory, currentBankos, roundNumber)

      const newRound: Omit<Round, 'created_at'> = {
        id: uuidv4(),
        game_id: gameId,
        round_number: roundNumber,
        color: payload.color,
        okey_thrown: payload.okeyThrown,
        double_finish: payload.doubleFinish,
        fake_okey: payload.fakeOkey,
        scores: payload.scores,
        banko_players: payload.bankoPlayers,
      }

      const savedRound: Round = { ...newRound, created_at: new Date().toISOString() }
      const updatedGame: Game = { ...currentGame_, banko_history: newHistory }

      setRounds((prev) => [...prev, savedRound])
      setGame(updatedGame)
      appendRound(savedRound)
      setCurrentBankos([])
      setShowEntry(false)

      await insertRound(newRound)
      await updateGame(gameId, { banko_history: newHistory })

      if (roundNumber >= totalRounds) {
        finishGame()
        await updateGame(gameId, { status: 'finished', finished_at: new Date().toISOString() })
        navigate({ to: '/game-over/$gameId', params: { gameId } })
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEndGame = async () => {
    if (!currentGame_) return
    const finished: Game = { ...currentGame_, status: 'finished', finished_at: new Date().toISOString() }
    setGame(finished)
    finishGame()
    setShowEndConfirm(false)
    await updateGame(gameId, { status: 'finished', finished_at: finished.finished_at })
    navigate({ to: '/game-over/$gameId', params: { gameId } })
  }

  const tableColumns = esli ? columns : currentGame_.players

  const playerIdByName = (name: string) =>
    players.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id

  const formatScore = (score: number) => {
    if (score === 0) return '-'
    return score > 0 ? `+${score}` : String(score)
  }

  const scoreClass = (score: number) => {
    if (score < 0) return 'text-green-400'
    if (score > 0) return 'text-red-400'
    return 'text-[#718096]'
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      <GameHeader
        game={currentGame_}
        isFinished={isFinished}
        subtitle={`El ${Math.min(currentRound, totalRounds)} / ${totalRounds}`}
        showEndGame={!isFinished}
        onEndGame={() => setShowEndConfirm(true)}
        onSettings={() => setShowSettings(true)}
      />

      <div className="flex-1 overflow-auto px-2 py-3 max-w-lg mx-auto w-full pb-28">
        <div className="bg-[#16213e] rounded-2xl border border-[#2d3748] overflow-hidden w-full">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-10" />
              {tableColumns.map((col) => (
                <col key={col} />
              ))}
            </colgroup>

            <thead>
              <tr className="bg-[#0f3460] border-b border-[#2d3748]">
                <th className="p-2" />
                {tableColumns.map((entity) => {
                  const avatarPlayers = getAvatarPlayers(entity)
                  const alreadyUsedBanko = (bankoHistory[entity]?.length ?? 0) > 0
                  const forced = mustForceBanko(bankoHistory, entity, currentRound, totalRounds)
                  const isActive = currentBankos.includes(entity)
                  const disabled = (alreadyUsedBanko && !isActive) || (forced && isActive)

                  return (
                    <th key={entity} className="text-center p-2 border-b border-[#2d3748]">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex justify-center">
                          {avatarPlayers.map((p, i) => (
                            <div key={p} style={{ marginLeft: i > 0 ? -10 : 0 }} className="relative">
                              <PlayerAvatar
                                name={p}
                                avatarUrl={getAvatarUrl(p)}
                                size={40}
                                onClick={
                                  !esli && playerIdByName(p)
                                    ? () => navigate({ to: '/player/$playerId', params: { playerId: playerIdByName(p)! } })
                                    : undefined
                                }
                              />
                            </div>
                          ))}
                        </div>
                        <span className="text-xs font-semibold text-white truncate max-w-full">
                          {entity}
                        </span>
                        {!isFinished && (
                          <button
                            type="button"
                            onClick={() => toggleBanko(entity)}
                            disabled={disabled}
                            title={forced ? 'Son el banko zorunlu!' : undefined}
                            className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                              isActive
                                ? 'border-2 border-red-500 text-red-400 bg-red-500/10'
                                : 'border border-[#4a5568] text-[#a0aec0]'
                            } ${alreadyUsedBanko ? 'opacity-40 cursor-not-allowed' : 'hover:border-red-400'}`}
                          >
                            💥 BANKO
                          </button>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              {rounds.map((round, idx) => (
                <tr
                  key={round.id}
                  className={`border-b border-[#2d3748]/50 ${idx % 2 !== 0 ? 'bg-[#0f3460]/20' : ''}`}
                >
                  <td className="text-center p-2">
                    <span className="text-[#718096] text-xs">{round.round_number}</span>
                  </td>
                  {tableColumns.map((entity) => {
                    const score = round.scores[entity] ?? 0
                    const isBanko = round.banko_players?.includes(entity)
                    return (
                      <td key={entity} className="text-center p-2">
                        <span className={`text-xs font-medium ${scoreClass(score)}`}>
                          {formatScore(score)}
                        </span>
                        {isBanko && <span className="ml-1 text-xs">💥</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}

              {Array.from({ length: Math.max(0, totalRounds - rounds.length) }).map((_, idx) => {
                const roundNum = rounds.length + idx + 1
                const isCurrentRound = roundNum === currentRound
                return (
                  <tr
                    key={`empty-${idx}`}
                    className={`border-b border-[#2d3748]/30 ${isCurrentRound ? 'bg-[#e94560]/5' : ''}`}
                  >
                    <td className="text-center p-2">
                      <span className={`text-xs ${isCurrentRound ? 'text-[#e94560] font-bold' : 'text-[#2d3748]'}`}>
                        {roundNum}
                      </span>
                    </td>
                    {tableColumns.map((entity) => (
                      <td key={entity} className="text-center p-2">
                        {isCurrentRound ? (
                          <span className="text-[#e94560]/40 text-xs">—</span>
                        ) : (
                          <span className="text-[#2d3748] text-xs">·</span>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>

            <tfoot>
              <tr className="bg-[#0f3460] border-t-2 border-[#2d3748]">
                <td className="p-2" />
                {tableColumns.map((entity) => {
                  const total = totals[entity] ?? 0
                  return (
                    <td key={entity} className="text-center p-2 font-bold">
                      <span className={`text-sm ${scoreClass(total)}`}>
                        {total}
                      </span>
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {!isFinished && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#16213e] border-t border-[#2d3748] px-4 py-3 pb-safe flex gap-3 max-w-lg mx-auto">
          <button
            onClick={() => setShowEntry(true)}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-[#e94560] text-white font-bold py-3.5 rounded-xl"
          >
            <Plus size={18} />
            El Gir
          </button>
          {rounds.length > 0 && (
            <button
              onClick={() => setShowEndConfirm(true)}
              className="flex items-center justify-center px-4 bg-[#0f3460] text-[#a0aec0] font-semibold py-3.5 rounded-xl"
            >
              <Trophy size={16} />
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {showEndConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70"
            onClick={() => setShowEndConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#16213e] rounded-2xl p-6 w-full max-w-sm border border-[#2d3748]"
            >
              <h3 className="text-white font-bold text-lg mb-2">Oyunu Bitir?</h3>
              <p className="text-[#718096] text-sm mb-5">En düşük ceza alan kazanır.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowEndConfirm(false)} className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3 rounded-xl">İptal</button>
                <button onClick={handleEndGame} className="flex-1 bg-[#f5a623] text-[#1a1a2e] font-bold py-3 rounded-xl">Bitir</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettings && (
          <GameSettingsModal
            game={currentGame_}
            onClose={() => setShowSettings(false)}
            onSaved={refetchGame}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEntry && (
          <BankoluRoundEntryModal
            game={currentGame_}
            roundNumber={currentRound}
            currentBankos={currentBankos}
            onSave={handleSave}
            onClose={() => setShowEntry(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
