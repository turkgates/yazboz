import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Trophy } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { supabase, fetchGameWithRounds, fetchPlayers, insertRound, updateGame } from '@/lib/supabase'
import type { Game, Round, SavedPlayer } from '@/types'
import { useGameStore } from '@/stores/gameStore'
import { getTeams, isEsliGame, teamLabel } from '@/lib/gameTypes'
import { calculate101Score, compute101Totals, isSpecialFinish } from '@/lib/101calculations'
import { GameHeader } from '@/components/game/GameHeader'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { OkeyYuzbirRoundEntryModal, type OkeyYuzbirRoundInput } from '@/components/game/OkeyYuzbirRoundEntryModal'

function getScoreClass(score: number, isSpecial?: boolean) {
  if (isSpecial) return 'text-[#f5a623]'
  if (score < 0) return 'text-green-400'
  if (score > 0) return 'text-red-400'
  return 'text-[#718096]'
}

interface Props {
  gameId: string
}

export function OkeyYuzbirGameView({ gameId }: Props) {
  const navigate = useNavigate()
  const { currentGame, rounds: storeRounds, loadGame, appendRound, finishGame } = useGameStore()

  const [game, setGame] = useState<Game | null>(currentGame)
  const [rounds, setRounds] = useState<Round[]>(storeRounds)
  const [players, setPlayers] = useState<SavedPlayer[]>([])
  const [showEntry, setShowEntry] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)

  useEffect(() => {
    fetchGameWithRounds(gameId).then(({ game: g, rounds: r }) => {
      if (g) {
        setGame(g)
        setRounds(r)
        loadGame(g, r)
      }
    })
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: pData } = await fetchPlayers(data.user.id)
        if (pData) setPlayers(pData)
      }
    })
  }, [gameId])

  const currentGame_ = game ?? currentGame
  if (!currentGame_) return null

  const katlamali = currentGame_.katlamali ?? false
  const esli = isEsliGame(currentGame_)
  const teams = esli ? getTeams(currentGame_) : []
  const entities: string[] = esli ? teams.map(teamLabel) : currentGame_.players
  const totalRounds = currentGame_.total_rounds
  const isFinished = currentGame_.status === 'finished'

  const totals = useMemo(
    () => compute101Totals(entities, rounds.map((r) => r.scores)),
    [entities.join(','), rounds]
  )

  const prevMaxOpenScore = useMemo((): number | null => {
    if (!katlamali) return null
    for (let i = rounds.length - 1; i >= 0; i--) {
      const s = rounds[i].scores['__maxOpen__']
      if (s !== undefined) return s
    }
    return null
  }, [rounds, katlamali])

  const getAvatarUrl = (name: string) =>
    players.find((p) => p.name === name)?.avatar_url ?? null

  const handleSave = async (input: OkeyYuzbirRoundInput) => {
    if (!currentGame_) return
    setSaving(true)
    try {
      const scores: Record<string, number> = {}
      if (esli) {
        for (const teamArr of teams) {
          const label = teamLabel(teamArr)
          const inp = input.playerInputs.find((p) => p.playerName === label)
          if (inp) scores[label] = calculate101Score(inp)
        }
      } else {
        for (const inp of input.playerInputs) {
          scores[inp.playerName] = calculate101Score(inp)
        }
      }

      if (katlamali && input.maxOpenScore !== undefined) {
        scores['__maxOpen__'] = input.maxOpenScore
      }

      const roundNumber = rounds.filter((r) => !r.scores['__maxOpen__'] || Object.keys(r.scores).length > 1).length + 1
      const newRound: Omit<Round, 'created_at'> = {
        id: uuidv4(),
        game_id: gameId,
        round_number: roundNumber,
        color: 'black',
        okey_thrown: false,
        double_finish: false,
        scores,
      }
      const savedRound: Round = { ...newRound, created_at: new Date().toISOString() }
      setRounds((prev) => [...prev, savedRound])
      appendRound(savedRound)
      setShowEntry(false)
      await insertRound(newRound)
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

  const displayRounds = rounds.filter((r) => {
    const keys = Object.keys(r.scores).filter((k) => k !== '__maxOpen__')
    return keys.length > 0
  })

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      <GameHeader
        game={currentGame_}
        isFinished={isFinished}
        showEndGame={!isFinished}
        onEndGame={() => setShowEndConfirm(true)}
        onSettings={() => {}}
      />

      {/* Scores header */}
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 py-4">
        <div className={`grid gap-2 max-w-lg mx-auto ${esli ? 'grid-cols-2' : `grid-cols-${Math.min(entities.length, 4)}`}`}>
          {entities.map((entity) => {
            const total = totals[entity] ?? 0
            const avatarPlayers = esli
              ? (teams.find((t) => teamLabel(t) === entity) ?? [entity])
              : [entity]
            return (
              <div key={entity} className="flex flex-col items-center gap-1">
                <div className="flex justify-center">
                  {avatarPlayers.map((p, i) => (
                    <div key={p} style={{ marginLeft: i > 0 ? -10 : 0 }} className="relative">
                      <PlayerAvatar name={p} avatarUrl={getAvatarUrl(p)} size={38} />
                    </div>
                  ))}
                </div>
                <p className="text-[#a0aec0] text-xs font-medium text-center truncate w-full px-1">{entity}</p>
                <p className={`text-2xl font-black ${getScoreClass(total)}`}>
                  {total > 0 ? `+${total}` : total}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* El sayacı */}
      <div className="px-4 py-2 max-w-lg mx-auto w-full flex items-center justify-between">
        <p className="text-[#718096] text-xs">
          El <span className="text-white font-bold">{displayRounds.length}</span> / {totalRounds}
        </p>
        {katlamali && prevMaxOpenScore !== null && (
          <p className="text-[#f5a623] text-xs">
            Min. açılış: <span className="font-bold">{prevMaxOpenScore + 1}</span>
          </p>
        )}
      </div>

      {/* Rounds table */}
      <div className="flex-1 px-4 max-w-lg mx-auto w-full pb-28 overflow-x-auto">
        {displayRounds.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2d3748]">
                <th className="text-left py-2 text-[#4a5568] text-xs font-medium w-10">El</th>
                {entities.map((e) => (
                  <th key={e} className="text-center py-2 text-[#4a5568] text-xs font-medium">{e}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRounds.map((round, idx) => {
                const roundMaxOpen = round.scores['__maxOpen__']
                return (
                  <tr key={round.id} className="border-b border-[#2d3748]/50">
                    <td className="py-2 text-[#718096] text-xs">
                      <div>{idx + 1}</div>
                      {katlamali && roundMaxOpen !== undefined && (
                        <div className="text-[9px] text-[#f5a623]">min.{roundMaxOpen + 1}</div>
                      )}
                    </td>
                    {entities.map((entity) => {
                      const val = round.scores[entity] ?? 0
                      const special = isSpecialFinish(val)
                      return (
                        <td key={entity} className="text-center py-2">
                          <span className={`font-semibold ${getScoreClass(val, special)}`}>
                            {val > 0 ? `+${val}` : val}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {/* Total row */}
              <tr className="border-t-2 border-[#4a5568]">
                <td className="py-2 text-[#a0aec0] text-xs font-bold">TOP.</td>
                {entities.map((entity) => {
                  const total = totals[entity] ?? 0
                  return (
                    <td key={entity} className="text-center py-2">
                      <span className={`font-black text-sm ${getScoreClass(total)}`}>
                        {total > 0 ? `+${total}` : total}
                      </span>
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-[#4a5568]">
            <p className="text-sm">Henüz el girilmedi</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!isFinished && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#16213e] border-t border-[#2d3748] px-4 py-3 pb-safe flex gap-3 max-w-lg mx-auto">
          {displayRounds.length >= totalRounds ? (
            <button
              onClick={() => setShowEndConfirm(true)}
              className="flex-1 flex items-center justify-center gap-2 bg-[#f5a623] text-[#1a1a2e] font-bold py-3.5 rounded-xl"
            >
              <Trophy size={18} />
              Oyunu Bitir
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowEntry(true)}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-[#e94560] text-white font-bold py-3.5 rounded-xl"
              >
                <Plus size={18} />
                El Gir
              </button>
              {displayRounds.length > 0 && (
                <button
                  onClick={() => setShowEndConfirm(true)}
                  className="flex items-center justify-center px-4 bg-[#0f3460] text-[#a0aec0] font-semibold py-3.5 rounded-xl"
                >
                  <Trophy size={16} />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {isFinished && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#16213e] border-t border-[#2d3748] px-4 py-3 pb-safe">
          <button
            onClick={() => navigate({ to: '/game-over/$gameId', params: { gameId } })}
            className="w-full flex items-center justify-center gap-2 bg-[#f5a623] text-[#1a1a2e] font-bold py-3.5 rounded-xl max-w-lg mx-auto block"
          >
            <Trophy size={18} />
            Oyun Sonu
          </button>
        </div>
      )}

      {/* End confirm */}
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
              <p className="text-[#718096] text-sm mb-5">En düşük puanlı oyuncu kazanır.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowEndConfirm(false)} className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3 rounded-xl">İptal</button>
                <button onClick={handleEndGame} className="flex-1 bg-[#f5a623] text-[#1a1a2e] font-bold py-3 rounded-xl">Bitir</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Round entry modal */}
      <AnimatePresence>
        {showEntry && (
          <OkeyYuzbirRoundEntryModal
            game={currentGame_}
            roundNumber={displayRounds.length + 1}
            katlamali={katlamali}
            prevMaxOpenScore={prevMaxOpenScore}
            onSave={handleSave}
            onClose={() => setShowEntry(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
