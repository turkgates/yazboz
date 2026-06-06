import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  supabase,
  fetchPlayerById,
  fetchPlayerGamesWithRounds,
} from '@/lib/supabase'
import type { Game, Round, SavedPlayer } from '@/types'
import { ArrowLeft, Pencil, Trophy, Target, TrendingDown, TrendingUp, Flame, Zap } from 'lucide-react'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { PlayerFormModal } from '@/components/players/PlayerFormModal'
import { calculateTotals, getLeader, detectOkeyBurnType } from '@/lib/calculations'
import { formatDate } from '@/lib/dateUtils'
import { AnimatePresence } from 'framer-motion'

export const Route = createFileRoute('/player/$playerId')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: PlayerProfilePage,
})

interface PlayerStats {
  totalGames: number
  winCount: number
  winPercentage: number
  averagePenalty: number
  bestHand: number | null
  worstHand: number | null
  okeyThrowCount: number
  okeyBurnCount: number
}

interface GameHistoryItem {
  game: Game
  total: number
  isWinner: boolean
  rounds: Round[]
}

function computePlayerStats(
  playerName: string,
  games: Game[],
  roundsByGame: Record<string, Round[]>
): PlayerStats {
  let winCount = 0
  let totalPenalty = 0
  let bestHand: number | null = null
  let worstHand: number | null = null
  let okeyThrowCount = 0
  let okeyBurnCount = 0

  for (const game of games) {
    const rounds = roundsByGame[game.id] ?? []
    const totals = calculateTotals(game.players, rounds.map((r) => r.scores))
    const leader = getLeader(totals)
    if (leader === playerName) winCount++
    totalPenalty += totals[playerName] ?? 0

    for (const round of rounds) {
      const score = round.scores[playerName] ?? 0

      if (score < 0) {
        if (round.okey_thrown) okeyThrowCount++
      }

      if (score > 0 && detectOkeyBurnType(score, round.color)) {
        okeyBurnCount++
      }

      if (bestHand === null || score < bestHand) bestHand = score
      if (worstHand === null || score > worstHand) worstHand = score
    }
  }

  const totalGames = games.length
  return {
    totalGames,
    winCount,
    winPercentage: totalGames > 0 ? Math.round((winCount / totalGames) * 100) : 0,
    averagePenalty: totalGames > 0 ? Math.round(totalPenalty / totalGames) : 0,
    bestHand,
    worstHand,
    okeyThrowCount,
    okeyBurnCount,
  }
}

function PlayerProfilePage() {
  const { playerId } = Route.useParams()
  const navigate = useNavigate()
  const [player, setPlayer] = useState<SavedPlayer | null>(null)
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [history, setHistory] = useState<GameHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: playerData, error } = await fetchPlayerById(playerId)
    if (error || !playerData) {
      setLoading(false)
      return
    }

    if (playerData.user_id !== user.id) {
      setLoading(false)
      return
    }

    setPlayer(playerData)

    const { games, roundsByGame } = await fetchPlayerGamesWithRounds(user.id, playerData.name)
    setStats(computePlayerStats(playerData.name, games, roundsByGame))

    const items: GameHistoryItem[] = games.map((game) => {
      const rounds = roundsByGame[game.id] ?? []
      const totals = calculateTotals(game.players, rounds.map((r) => r.scores))
      const leader = getLeader(totals)
      return {
        game,
        total: totals[playerData.name] ?? 0,
        isWinner: leader === playerData.name,
        rounds,
      }
    })
    setHistory(items)
    setLoading(false)
  }

  useEffect(() => {
    loadProfile()
  }, [playerId])

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!player || !stats) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex flex-col items-center justify-center gap-4">
        <p className="text-white">Oyuncu bulunamadı</p>
        <button onClick={() => navigate({ to: '/players' })} className="text-[#e94560]">
          Oyunculara Dön
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center gap-3 py-4 max-w-lg mx-auto">
          <button
            onClick={() => navigate({ to: '/players' })}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0]"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-bold text-white flex-1 truncate">Oyuncu Profili</h1>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 pb-20 max-w-lg mx-auto w-full">
        {/* Üst kısım */}
        <div className="flex flex-col items-center mb-6">
          <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size={96} className="mb-3" />
          <h2 className="text-white text-xl font-bold mb-3">{player.name}</h2>
          <button
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-2 bg-[#0f3460] text-[#a0aec0] hover:text-white text-sm font-medium px-4 py-2 rounded-xl"
          >
            <Pencil size={14} />
            Düzenle
          </button>
        </div>

        {/* İstatistik kartları */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatCard icon={<Target size={18} />} label="Toplam Oyun" value={stats.totalGames.toString()} />
          <StatCard
            icon={<Trophy size={18} />}
            label="Kazanma"
            value={`${stats.winCount} (%${stats.winPercentage})`}
            color="gold"
          />
          <StatCard
            icon={<TrendingUp size={18} />}
            label="Ort. Ceza"
            value={stats.averagePenalty > 0 ? `+${stats.averagePenalty}` : String(stats.averagePenalty)}
            color="red"
          />
          <StatCard
            icon={<TrendingDown size={18} />}
            label="En İyi El"
            value={stats.bestHand !== null ? String(stats.bestHand) : '—'}
            color="green"
          />
          <StatCard
            icon={<TrendingUp size={18} />}
            label="En Kötü El"
            value={stats.worstHand !== null ? `+${stats.worstHand}` : '—'}
            color="red"
          />
          <StatCard icon={<Zap size={18} />} label="Okey Atma" value={stats.okeyThrowCount.toString()} />
          <StatCard icon={<Flame size={18} />} label="Okeyi Yakma" value={stats.okeyBurnCount.toString()} />
        </div>

        {/* Son oyunlar */}
        <h3 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
          Son Oyunlar
        </h3>

        {history.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#718096] text-sm">Henüz oyun geçmişi yok</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((item, i) => (
              <motion.button
                key={item.game.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() =>
                  navigate({
                    to: item.game.status === 'finished' ? '/game-over/$gameId' : '/game/$gameId',
                    params: { gameId: item.game.id },
                  })
                }
                className="bg-[#16213e] border border-[#2d3748] rounded-xl p-4 text-left hover:border-[#e94560]/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-white text-sm font-medium">
                    {item.isWinner ? '🏆 Kazandı' : 'Kaybetti'}
                  </p>
                  <p className="text-[#718096] text-xs">{formatDate(item.game.created_at)}</p>
                </div>
                <p className="text-[#718096] text-xs mb-1">
                  {item.game.players.join(', ')}
                </p>
                <p
                  className={`text-sm font-bold ${
                    item.total < 0 ? 'text-green-400' : item.total > 0 ? 'text-red-400' : 'text-white'
                  }`}
                >
                  Toplam: {item.total > 0 ? `+${item.total}` : item.total}
                </p>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showEditModal && (
          <PlayerFormModal
            player={player}
            onClose={() => setShowEditModal(false)}
            onSaved={loadProfile}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color?: 'gold' | 'green' | 'red'
}) {
  const colorMap = {
    gold: 'text-[#f5a623] bg-[#f5a623]/10',
    green: 'text-green-400 bg-green-500/10',
    red: 'text-red-400 bg-red-500/10',
    default: 'text-blue-400 bg-blue-500/10',
  }
  const c = color ? colorMap[color] : colorMap.default

  return (
    <div className="bg-[#16213e] border border-[#2d3748] rounded-xl p-4">
      <div className={`w-8 h-8 rounded-lg ${c} flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[#718096] text-xs mt-0.5">{label}</p>
    </div>
  )
}
