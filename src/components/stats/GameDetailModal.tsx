import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import type { Game, Round, SavedPlayer } from '@/types'
import { fetchGameWithRounds, fetchPlayers } from '@/lib/supabase'
import { calculateTotals, detectOkeyBurnType, getRanking } from '@/lib/calculations'
import { formatGameDate } from '@/lib/dateUtils'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { supabase } from '@/lib/supabase'

interface GameDetailModalProps {
  game: Game
  onClose: () => void
}

interface GameSummary {
  ranking: ReturnType<typeof getRanking>
  roundsPlayed: number
  okeyThrows: Record<string, number>
  okeyBurns: Record<string, number>
}

function computeGameSummary(game: Game, rounds: Round[]): GameSummary {
  const totals = calculateTotals(game.players, rounds.map((r) => r.scores))
  const ranking = getRanking(totals)
  const okeyThrows: Record<string, number> = {}
  const okeyBurns: Record<string, number> = {}

  for (const player of game.players) {
    okeyThrows[player] = 0
    okeyBurns[player] = 0
  }

  for (const round of rounds) {
    for (const player of game.players) {
      const score = round.scores[player] ?? 0
      if (score < 0 && round.okey_thrown) okeyThrows[player]++
      if (score > 0 && detectOkeyBurnType(score, round.color, game.settings)) {
        okeyBurns[player]++
      }
    }
  }

  return { ranking, roundsPlayed: rounds.length, okeyThrows, okeyBurns }
}

export function GameDetailModal({ game, onClose }: GameDetailModalProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [savedPlayers, setSavedPlayers] = useState<SavedPlayer[]>([])
  const [summary, setSummary] = useState<GameSummary | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const [{ rounds: r }, playersRes] = await Promise.all([
        fetchGameWithRounds(game.id),
        user ? fetchPlayers(user.id) : Promise.resolve({ data: [] as SavedPlayer[] }),
      ])
      setSavedPlayers(playersRes.data ?? [])
      setSummary(computeGameSummary(game, r))
      setLoading(false)
    }
    load()
  }, [game])

  const avatarByName = (name: string) =>
    savedPlayers.find((p) => p.name.toLowerCase() === name.toLowerCase())?.avatar_url

  const playerIdByName = (name: string) =>
    savedPlayers.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id

  const handleViewScoreboard = () => {
    onClose()
    navigate({ to: '/game/$gameId', params: { gameId: game.id } })
  }

  const okeyThrowEntries = summary
    ? game.players.filter((p) => summary.okeyThrows[p] > 0)
    : []
  const okeyBurnEntries = summary
    ? game.players.filter((p) => summary.okeyBurns[p] > 0)
    : []

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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading || !summary ? (
            <div className="flex justify-center py-16">
              <div className="w-10 h-10 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* ÜST - Puan tablosu */}
              <div className="text-center mb-5">
                <p className="text-[#718096] text-sm">{formatGameDate(game.finished_at ?? game.created_at)}</p>
                {game.settings.note && (
                  <p className="text-white text-sm font-medium mt-1">{game.settings.note}</p>
                )}
              </div>

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
                      className={`relative rounded-2xl p-4 flex items-center gap-3 border ${
                        isWinner
                          ? 'bg-gradient-to-r from-[#f5a623]/25 to-[#f5a623]/5 border-[#f5a623]/50 shadow-lg shadow-[#f5a623]/10'
                          : 'bg-[#0f3460]/40 border-[#2d3748]'
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
                        size={isWinner ? 52 : 40}
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
                        <p className={`font-semibold truncate ${isWinner ? 'text-white text-lg' : 'text-white text-sm'}`}>
                          {item.name}
                        </p>
                        {isWinner && <p className="text-[#f5a623] text-xs font-medium">Kazanan</p>}
                      </div>
                      <p className={`font-bold shrink-0 ${item.total < 0 ? 'text-green-400' : item.total > 0 ? 'text-red-400' : 'text-white'} ${isWinner ? 'text-xl' : 'text-base'}`}>
                        {item.total}
                      </p>
                    </motion.div>
                  )
                })}
              </div>

              {/* ORTA - Özet */}
              <div className="bg-[#0f3460]/30 border border-[#2d3748] rounded-xl p-4 mb-5 space-y-3">
                <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider">Özet</p>
                <p className="text-white text-sm">
                  <span className="text-[#718096]">Oynanan el:</span>{' '}
                  <span className="font-semibold">{summary.roundsPlayed}</span>
                </p>
                {okeyThrowEntries.length > 0 ? (
                  <div>
                    <p className="text-[#718096] text-xs mb-1">Okey atanlar</p>
                    {okeyThrowEntries.map((p) => (
                      <p key={p} className="text-white text-sm">
                        {p}: <span className="text-[#f5a623] font-semibold">{summary.okeyThrows[p]} kez</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-[#718096] text-sm">Bu oyunda okey atılmadı</p>
                )}
                {okeyBurnEntries.length > 0 ? (
                  <div>
                    <p className="text-[#718096] text-xs mb-1">Okeyi yakanlar</p>
                    {okeyBurnEntries.map((p) => (
                      <p key={p} className="text-white text-sm">
                        {p}: <span className="text-orange-400 font-semibold">{summary.okeyBurns[p]} kez</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-[#718096] text-sm">Bu oyunda okey yakılmadı</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* ALT - Butonlar */}
        <div className="px-5 pb-5 flex gap-3 shrink-0 border-t border-[#2d3748] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3.5 rounded-xl"
          >
            Kapat
          </button>
          <button
            type="button"
            onClick={handleViewScoreboard}
            disabled={loading}
            className="flex-[2] bg-[#e94560] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl"
          >
            Yazbozu Gör
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
