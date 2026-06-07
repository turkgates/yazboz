import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { useNavigate } from '@tanstack/react-router'
import type { Game, Round, SavedPlayer } from '@/types'
import { supabase, fetchPlayers } from '@/lib/supabase'
import { calculateTotals, detectOkeyBurnType, getRanking, getLeader } from '@/lib/calculations'
import { formatGameDate } from '@/lib/dateUtils'
import { PlayerAvatar } from '@/components/PlayerAvatar'

export interface GameResultModalProps {
  gameId: string
  isOpen: boolean
  onClose: () => void
  onViewScoreboard: (gameId: string) => void
}

interface GameSummary {
  game: Game
  ranking: ReturnType<typeof getRanking>
  roundsPlayed: number
  okeyThrows: Record<string, number>
  okeyBurns: Record<string, number>
  fakeOkeyRounds: number
}

function computeGameSummary(game: Game, rounds: Round[]): Omit<GameSummary, 'game'> {
  const totals = calculateTotals(game.players, rounds.map((r) => r.scores))
  const ranking = getRanking(totals)
  const okeyThrows: Record<string, number> = {}
  const okeyBurns: Record<string, number> = {}
  let fakeOkeyRounds = 0

  for (const player of game.players) {
    okeyThrows[player] = 0
    okeyBurns[player] = 0
  }

  for (const round of rounds) {
    if (round.fake_okey) fakeOkeyRounds++

    const winner = getLeader(
      Object.fromEntries(
        game.players
          .filter((p) => (round.scores[p] ?? 0) < 0)
          .map((p) => [p, round.scores[p]])
      )
    ) ?? game.players.find((p) => (round.scores[p] ?? 0) < 0)

    if (winner && round.okey_thrown) {
      okeyThrows[winner]++
    }

    for (const player of game.players) {
      const score = round.scores[player] ?? 0
      if (
        score > 0 &&
        detectOkeyBurnType(score, round.color, game.settings, round.fake_okey ?? false)
      ) {
        okeyBurns[player]++
      }
    }
  }

  return { ranking, roundsPlayed: rounds.length, okeyThrows, okeyBurns, fakeOkeyRounds }
}

export function GameResultModal({
  gameId,
  isOpen,
  onClose,
  onViewScoreboard,
}: GameResultModalProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [savedPlayers, setSavedPlayers] = useState<SavedPlayer[]>([])
  const [summary, setSummary] = useState<GameSummary | null>(null)

  useEffect(() => {
    if (!isOpen) return

    setLoading(true)
    setSummary(null)

    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0 },
      colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'],
    })

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()

      const [gameRes, roundsRes, playersRes] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameId).single<Game>(),
        supabase.from('rounds').select('*').eq('game_id', gameId).order('round_number').returns<Round[]>(),
        user ? fetchPlayers(user.id) : Promise.resolve({ data: [] as SavedPlayer[] }),
      ])

      if (gameRes.data) {
        const rounds = roundsRes.data ?? []
        setSummary({
          game: gameRes.data,
          ...computeGameSummary(gameRes.data, rounds),
        })
      }
      setSavedPlayers(playersRes.data ?? [])
      setLoading(false)
    }

    load()
  }, [isOpen, gameId])

  const avatarByName = (name: string) =>
    savedPlayers.find((p) => p.name.toLowerCase() === name.toLowerCase())?.avatar_url

  const playerIdByName = (name: string) =>
    savedPlayers.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id

  const game = summary?.game

  const okeyThrowEntries = summary
    ? Object.entries(summary.okeyThrows).filter(([, count]) => count > 0)
    : []
  const okeyBurnEntries = summary
    ? Object.entries(summary.okeyBurns).filter(([, count]) => count > 0)
    : []

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center overflow-x-hidden"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg bg-[#16213e] rounded-t-3xl border-t border-x border-[#2d3748] overflow-hidden safe-bottom max-h-[92dvh] flex flex-col overflow-x-hidden"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-[#4a5568]" />
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
              {loading || !summary || !game ? (
                <div className="flex justify-center py-16">
                  <div className="w-10 h-10 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-3 mb-6">
                    {summary.ranking.map((item, i) => {
                      const isWinner = i === 0
                      const playerId = playerIdByName(item.name)

                      return (
                        <motion.div
                          key={item.name}
                          initial={{ opacity: 0, y: 24 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1, type: 'spring', damping: 20 }}
                          className={`relative rounded-2xl flex items-center gap-3 border ${
                            isWinner
                              ? 'p-5 bg-gradient-to-r from-[#f5a623]/25 to-[#f5a623]/5 border-[#f5a623]/50 shadow-lg shadow-[#f5a623]/10'
                              : 'p-4 bg-[#0f3460]/40 border-[#2d3748]'
                          }`}
                        >
                          {isWinner && (
                            <motion.div
                              className="absolute inset-0 rounded-2xl pointer-events-none"
                              animate={{ opacity: [0.3, 0.6, 0.3] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              style={{ boxShadow: 'inset 0 0 20px rgba(245,166,35,0.3)' }}
                            />
                          )}
                          <span className={`font-bold shrink-0 ${isWinner ? 'text-2xl text-[#f5a623]' : 'text-lg text-[#718096]'}`}>
                            {isWinner ? '🏆' : `${item.rank}.`}
                          </span>
                          <PlayerAvatar
                            name={item.name}
                            avatarUrl={avatarByName(item.name)}
                            size={48}
                            onClick={
                              playerId
                                ? () => {
                                    onClose()
                                    navigate({ to: '/player/$playerId', params: { playerId } })
                                  }
                                : undefined
                            }
                          />
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold truncate text-white ${isWinner ? 'text-lg' : 'text-sm'}`}>
                              {item.name}
                            </p>
                            {isWinner && <p className="text-[#f5a623] text-xs font-medium">Kazanan</p>}
                          </div>
                          <p
                            className={`font-bold shrink-0 ${
                              item.total < 0 ? 'text-green-400' : item.total > 0 ? 'text-red-400' : 'text-white'
                            } ${isWinner ? 'text-xl' : 'text-base'}`}
                          >
                            {item.total}
                          </p>
                        </motion.div>
                      )
                    })}
                  </div>

                  <div className="bg-[#0f3460]/30 border border-[#2d3748] rounded-xl p-4 mb-5 space-y-2">
                    <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">Özet</p>
                    <p className="text-[#718096] text-sm">
                      {formatGameDate(game.finished_at ?? game.created_at)}
                    </p>
                    <p className="text-white text-sm">
                      Toplam <span className="font-semibold">{summary.roundsPlayed}</span> el oynandı
                    </p>
                    {okeyThrowEntries.map(([name, count]) => (
                      <p key={name} className="text-white text-sm">
                        <span className="text-[#f5a623] font-medium">{name}</span>{' '}
                        {count} kez okey attı
                      </p>
                    ))}
                    {okeyBurnEntries.map(([name, count]) => (
                      <p key={name} className="text-white text-sm">
                        <span className="text-orange-400 font-medium">{name}</span>{' '}
                        {count} kez okeyi yaktı
                      </p>
                    ))}
                    {summary.fakeOkeyRounds > 0 && (
                      <p className="text-white text-sm">
                        Sahte okey atılan el:{' '}
                        <span className="text-purple-400 font-semibold">{summary.fakeOkeyRounds}</span>
                      </p>
                    )}
                    {okeyThrowEntries.length === 0 && okeyBurnEntries.length === 0 && summary.fakeOkeyRounds === 0 && (
                      <p className="text-[#718096] text-sm">Özel durum kaydı yok</p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="px-5 pb-5 flex gap-3 shrink-0 border-t border-[#2d3748] pt-4">
              <button
                type="button"
                onClick={() => onViewScoreboard(gameId)}
                disabled={loading}
                className="flex-[2] bg-[#e94560] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl"
              >
                Yazbozu Gör
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3.5 rounded-xl"
              >
                Kapat
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
