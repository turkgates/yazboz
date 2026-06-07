import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, fetchPlayerById, fetchPlayerGamesWithRounds, fetchProfile } from '@/lib/supabase'
import type { Game, SavedPlayer } from '@/types'
import { getGameWinners, getPlayerRank } from '@/lib/calculations'
import {
  Pencil,
  Trophy,
  TrendingUp,
  Flame,
  Zap,
  Gamepad2,
  BarChart3,
  Layers,
  Star,
  Skull,
  Medal,
} from 'lucide-react'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { PlayerFormModal } from '@/components/players/PlayerFormModal'
import { BackButton } from '@/components/layout/BackButton'
import { GameResultModal } from '@/components/GameResultModal'
import {
  computePlayerProfileStats,
  computeGameTotals,
  getPlayerGameTotal,
  getRankEmoji,
  type PlayerProfileStats,
} from '@/lib/statsUtils'
import { formatGameDate } from '@/lib/dateUtils'

export const Route = createFileRoute('/player/$playerId')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: PlayerProfilePage,
})

interface GameHistoryItem {
  game: Game
  total: number
  rank: number
  isWinner: boolean
}

function formatScore(score: number): string {
  if (score > 0) return `+${score}`
  return String(score)
}

function PlayerProfilePage() {
  const { playerId } = Route.useParams()
  const navigate = useNavigate()
  const [player, setPlayer] = useState<SavedPlayer | null>(null)
  const [stats, setStats] = useState<PlayerProfileStats | null>(null)
  const [history, setHistory] = useState<GameHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)

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

    const { data: profile } = await fetchProfile(user.id)
    const winnersCount = profile?.winners_count ?? 1

    const { games, roundsByGame } = await fetchPlayerGamesWithRounds(user.id, playerData.name)
    setStats(computePlayerProfileStats(playerData.name, games, roundsByGame, winnersCount))

    const items: GameHistoryItem[] = games.slice(0, 10).map((game) => {
      const rounds = roundsByGame[game.id] ?? []
      const playerTotals = computeGameTotals(game, rounds)
      const winners = getGameWinners(playerTotals, winnersCount)
      const rank = getPlayerRank(playerData.name, playerTotals)
      return {
        game,
        total: getPlayerGameTotal(rounds, playerData.name),
        rank,
        isWinner: winners.some((w) => w.toLowerCase() === playerData.name.toLowerCase()),
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
          <BackButton className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460]" />
          <h1 className="text-lg font-bold text-white flex-1 truncate">Oyuncu Profili</h1>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 pb-20 max-w-lg mx-auto w-full">
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

        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatCard icon={<Gamepad2 size={18} />} label="Toplam Oyun" value={String(stats.totalGames)} />
          <StatCard
            icon={<Trophy size={18} />}
            label="Kazanma"
            value={`${stats.wins} (%${stats.winPercentage})`}
            color="gold"
          />
          <StatCard icon={<span className="text-base">🥇</span>} label="Birincilik" value={String(stats.firstPlaceCount)} color="gold" />
          <StatCard icon={<span className="text-base">🥈</span>} label="İkincilik" value={String(stats.secondPlaceCount)} />
          <StatCard icon={<span className="text-base">🥉</span>} label="Üçüncülük" value={String(stats.thirdPlaceCount)} />
          <StatCard
            icon={<BarChart3 size={18} />}
            label="Ort. Oyun Puanı"
            value={formatScore(stats.averageGameScore)}
            color={stats.averageGameScore < 0 ? 'green' : stats.averageGameScore > 0 ? 'red' : undefined}
          />
          <StatCard icon={<Layers size={18} />} label="Toplam El" value={String(stats.totalRounds)} />
          <StatCard icon={<Zap size={18} />} label="Okey Atma" value={String(stats.okeyCount)} />
          <StatCard icon={<Flame size={18} />} label="Okey Yakma" value={String(stats.burnedCount)} />
          <StatCard
            icon={<Star size={18} />}
            label="En İyi El"
            value={stats.bestRound !== null ? formatScore(stats.bestRound) : '—'}
            color="green"
          />
          <StatCard
            icon={<Skull size={18} />}
            label="En Kötü El"
            value={stats.worstRound !== null ? formatScore(stats.worstRound) : '—'}
            color="red"
          />
          <StatCard
            icon={<Medal size={18} />}
            label="En İyi Oyun"
            value={stats.bestGame !== null ? formatScore(stats.bestGame) : '—'}
            color="green"
          />
          <StatCard
            icon={<TrendingUp size={18} />}
            label="En Kötü Oyun"
            value={stats.worstGame !== null ? formatScore(stats.worstGame) : '—'}
            color="red"
          />
        </div>

        <h3 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
          Son 10 Oyun
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
                onClick={() => setSelectedGameId(item.game.id)}
                className="bg-[#16213e] border border-[#2d3748] rounded-xl p-4 text-left hover:border-[#e94560]/40 transition-colors w-full"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        item.isWinner
                          ? 'bg-[#f5a623]/20 text-[#f5a623]'
                          : 'bg-[#2d3748] text-[#718096]'
                      }`}
                    >
                      {item.isWinner ? '🏆 Kazandı' : 'Kaybetti'}
                    </span>
                    <span className="text-sm">{getRankEmoji(item.rank)}</span>
                  </div>
                  <p className="text-[#718096] text-xs">
                    {formatGameDate(item.game.finished_at ?? item.game.created_at)}
                  </p>
                </div>
                <p
                  className={`text-sm font-bold ${
                    item.total < 0 ? 'text-green-400' : item.total > 0 ? 'text-red-400' : 'text-white'
                  }`}
                >
                  Toplam: {formatScore(item.total)}
                </p>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      <GameResultModal
        gameId={selectedGameId ?? ''}
        isOpen={!!selectedGameId}
        onClose={() => setSelectedGameId(null)}
        onViewScoreboard={(gameId) => {
          setSelectedGameId(null)
          navigate({ to: '/game/$gameId', params: { gameId } })
        }}
      />

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
