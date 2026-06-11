import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, fetchPlayerById, fetchPlayerGamesWithRounds } from '@/lib/supabase'
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
  computePlayer101Stats,
  computeGameTotals,
  getPlayerGameTotal,
  getRankEmoji,
  type PlayerProfileStats,
  type OkeyYuzbir101Stats,
} from '@/lib/statsUtils'
import { formatGameDate } from '@/lib/dateUtils'
import { matchesGameFilter, getGameBadgeLabel, getSayiliEntityScore, getWinnersCount, is101Game, isBankoluGame, isSayiliGame, type GameTypeFilter } from '@/lib/gameTypes'
import { computePlayerBankoluStats, type PlayerBankoluStats } from '@/lib/bankoluStatsUtils'
import { GameTypeFilterTabs } from '@/components/GameTypeFilterTabs'
import { computePlayerEsliStats } from '@/lib/teamStatsUtils'
import { Users } from 'lucide-react'

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
  const [realUsername, setRealUsername] = useState<string | null>(null)
  const [isLinkedFriend, setIsLinkedFriend] = useState(false)
  const [statsPlayerName, setStatsPlayerName] = useState('')
  const [stats, setStats] = useState<PlayerProfileStats | null>(null)
  const [history, setHistory] = useState<GameHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [allGames, setAllGames] = useState<Game[]>([])
  const [allRoundsByGame, setAllRoundsByGame] = useState<Record<string, import('@/types').Round[]>>({})
  const [gameFilter, setGameFilter] = useState<GameTypeFilter>([])
  const [esliStats, setEsliStats] = useState<ReturnType<typeof computePlayerEsliStats>>(null)
  const [stats101, setStats101] = useState<OkeyYuzbir101Stats | null>(null)
  const [statsBankolu, setStatsBankolu] = useState<PlayerBankoluStats | null>(null)

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

    let displayName = playerData.name
    let displayAvatar = playerData.avatar_url
    let username: string | null = null
    const linked = !!playerData.linked_user_id && playerData.linked_user_id !== user.id

    if (playerData.linked_user_id) {
      const { data: realProfile } = await supabase
        .from('profiles')
        .select('display_name, username, avatar_url')
        .eq('id', playerData.linked_user_id)
        .maybeSingle<{ display_name: string | null; username: string | null; avatar_url: string | null }>()

      if (realProfile) {
        displayName = realProfile.display_name ?? playerData.name
        displayAvatar = realProfile.avatar_url ?? playerData.avatar_url
        username = realProfile.username
      }
    }

    setPlayer({
      ...playerData,
      name: displayName,
      avatar_url: displayAvatar,
    })
    setRealUsername(username)
    setIsLinkedFriend(linked)
    setStatsPlayerName(playerData.name)

    const { games, roundsByGame } = await fetchPlayerGamesWithRounds(user.id, playerData.name)
    setAllGames(games)
    setAllRoundsByGame(roundsByGame)
    setStats(computePlayerProfileStats(playerData.name, games, roundsByGame))
    setLoading(false)
  }

  useEffect(() => {
    loadProfile()
  }, [playerId])

  useEffect(() => {
    if (!player || !statsPlayerName) return
    const filteredGames = allGames.filter((g) => matchesGameFilter(g, gameFilter))
    const filteredRoundsByGame: Record<string, import('@/types').Round[]> = {}
    for (const game of filteredGames) {
      filteredRoundsByGame[game.id] = allRoundsByGame[game.id] ?? []
    }

    setStats(computePlayerProfileStats(statsPlayerName, filteredGames, filteredRoundsByGame))

    const items: GameHistoryItem[] = filteredGames.slice(0, 10).map((game) => {
      const rounds = filteredRoundsByGame[game.id] ?? []
      const playerTotals = computeGameTotals(game, rounds)
      const winners = getGameWinners(playerTotals, getWinnersCount(game.settings))
      const rank = getPlayerRank(statsPlayerName, playerTotals)
      const total = isSayiliGame(game)
        ? getSayiliEntityScore(game, rounds, statsPlayerName)
        : getPlayerGameTotal(rounds, statsPlayerName)
      return {
        game,
        total,
        rank,
        isWinner: winners.some((w) => w.toLowerCase() === statsPlayerName.toLowerCase()),
      }
    })
    setHistory(items)
    setEsliStats(computePlayerEsliStats(statsPlayerName, allGames, allRoundsByGame))

    const games101 = filteredGames.filter((g) => is101Game(g))
    if (games101.length > 0) {
      setStats101(computePlayer101Stats(statsPlayerName, filteredGames, filteredRoundsByGame))
    } else {
      setStats101(null)
    }

    const gamesBankolu = filteredGames.filter((g) => isBankoluGame(g))
    if (gamesBankolu.length > 0) {
      setStatsBankolu(computePlayerBankoluStats(statsPlayerName, filteredGames, filteredRoundsByGame))
    } else {
      setStatsBankolu(null)
    }
  }, [player, statsPlayerName, allGames, allRoundsByGame, gameFilter])

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
        <GameTypeFilterTabs value={gameFilter} onChange={setGameFilter} />

        <div className="flex flex-col items-center mb-6">
          <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size={96} className="mb-3" />
          <h2 className="text-white text-xl font-bold">{player.name}</h2>
          {realUsername && (
            <p className="text-[#718096] text-sm mt-1">@{realUsername}</p>
          )}
          {isLinkedFriend && (
            <p className="text-[#718096] text-xs mt-1">Arkadaş ✓</p>
          )}
          {!isLinkedFriend && (
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 bg-[#0f3460] text-[#a0aec0] hover:text-white text-sm font-medium px-4 py-2 rounded-xl mt-3"
            >
              <Pencil size={14} />
              Düzenle
            </button>
          )}
        </div>

        {statsBankolu && (
          <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">💥</span>
              <h3 className="text-white font-semibold text-sm">Bankolu Okey</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-[#0f3460]/40 rounded-xl p-2.5">
                <p className="text-[#718096] text-[10px]">Oyun</p>
                <p className="text-white font-bold text-base">{statsBankolu.totalGames}</p>
              </div>
              <div className="bg-[#0f3460]/40 rounded-xl p-2.5">
                <p className="text-[#718096] text-[10px]">Toplam Banko</p>
                <p className="text-[#e94560] font-bold text-base">{statsBankolu.totalBankos}</p>
              </div>
              <div className="bg-[#0f3460]/40 rounded-xl p-2.5">
                <p className="text-[#718096] text-[10px]">Bankodan Kazanma</p>
                <p className="text-green-400 font-bold text-base">{statsBankolu.bankoWins}</p>
              </div>
              <div className="bg-[#0f3460]/40 rounded-xl p-2.5">
                <p className="text-[#718096] text-[10px]">Bankodan Kaybetme</p>
                <p className="text-red-400 font-bold text-base">{statsBankolu.bankoLosses}</p>
              </div>
            </div>
            {statsBankolu.highestBankoPenalty !== null && (
              <div className="bg-[#0f3460]/40 rounded-xl p-2.5">
                <p className="text-[#718096] text-[10px]">En Yüksek Banko Cezası</p>
                <p className="text-[#f5a623] font-bold">+{statsBankolu.highestBankoPenalty}</p>
              </div>
            )}
          </div>
        )}

        {stats101 && (
          <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">💯</span>
              <h3 className="text-white font-semibold text-sm">101 Okey</h3>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-[#0f3460]/40 rounded-xl p-2.5">
                <p className="text-[#718096] text-[10px]">Oyun</p>
                <p className="text-white font-bold text-base">{stats101.totalGames}</p>
              </div>
              <div className="bg-[#0f3460]/40 rounded-xl p-2.5">
                <p className="text-[#718096] text-[10px]">Kazanma</p>
                <p className="text-[#f5a623] font-bold text-base">{stats101.wins}</p>
              </div>
              <div className="bg-[#0f3460]/40 rounded-xl p-2.5">
                <p className="text-[#718096] text-[10px]">Ort. El</p>
                <p className={`font-bold text-base ${stats101.avgRoundScore < 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats101.avgRoundScore > 0 ? `+${stats101.avgRoundScore}` : stats101.avgRoundScore}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 bg-[#0f3460]/40 rounded-xl p-2.5">
                <p className="text-[#718096] text-[10px]">Elden Bitiş</p>
                <p className="text-white font-bold">{stats101.eldenCount}</p>
              </div>
              <div className="flex-1 bg-[#0f3460]/40 rounded-xl p-2.5">
                <p className="text-[#718096] text-[10px]">Elden + Okey</p>
                <p className="text-[#f5a623] font-bold">{stats101.eldenOkeyCount}</p>
              </div>
            </div>
          </div>
        )}

        {esliStats && (
          <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Users size={18} className="text-[#f5a623]" />
              <h3 className="text-white font-semibold text-sm">Eşli Oyunlar</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-[#0f3460]/40 rounded-xl p-3">
                <p className="text-[#718096] text-xs">Eşli Oyun</p>
                <p className="text-white font-bold text-lg">{esliStats.totalEsliGames}</p>
              </div>
              <div className="bg-[#0f3460]/40 rounded-xl p-3">
                <p className="text-[#718096] text-xs">Eşli Kazanma</p>
                <p className="text-[#f5a623] font-bold text-lg">
                  {esliStats.esliWins} (%{esliStats.winRate})
                </p>
              </div>
            </div>
            {esliStats.mostFrequentPartner && (
              <p className="text-[#a0aec0] text-xs mb-1">
                En çok eşleştiği: <span className="text-white font-medium">{esliStats.mostFrequentPartner}</span>
              </p>
            )}
            {esliStats.bestPartner && (
              <p className="text-[#a0aec0] text-xs">
                En çok kazandığı partner:{' '}
                <span className="text-white font-medium">
                  {esliStats.bestPartner.name} ile {esliStats.bestPartner.wins}/{esliStats.bestPartner.total} oyun kazandı (%{esliStats.bestPartner.winRate})
                </span>
              </p>
            )}
          </div>
        )}

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
                <p className="text-[#718096] text-xs mb-1">{getGameBadgeLabel(item.game)}</p>
                <p
                  className={`text-sm font-bold ${
                    isSayiliGame(item.game)
                      ? item.total <= 0
                        ? 'text-green-400'
                        : 'text-white'
                      : item.total < 0
                        ? 'text-green-400'
                        : item.total > 0
                          ? 'text-red-400'
                          : 'text-white'
                  }`}
                >
                  {isSayiliGame(item.game) ? 'Sayı' : 'Toplam'}: {isSayiliGame(item.game) ? item.total : formatScore(item.total)}
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
