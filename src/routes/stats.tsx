import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase, fetchPlayers, fetchProfile } from '@/lib/supabase'
import type { Game, Round, SavedPlayer } from '@/types'
import {
  Gamepad2,
  Layers,
  Zap,
  Flame,
  Skull,
  Star,
  Medal,
  ChevronRight,
} from 'lucide-react'
import { formatGameDate } from '@/lib/dateUtils'
import { GameResultModal } from '@/components/GameResultModal'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { BackButton } from '@/components/layout/BackButton'
import { computeGlobalStats, type GlobalStatsSummary } from '@/lib/statsUtils'
import { matchesGameFilter, getGameBadgeLabel, type GameTypeFilter } from '@/lib/gameTypes'
import { GameTypeFilterTabs } from '@/components/GameTypeFilterTabs'

export const Route = createFileRoute('/stats')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: StatsPage,
})

const MEDALS = ['🥇', '🥈', '🥉']

function StatsPage() {
  const navigate = useNavigate()
  const [allGames, setAllGames] = useState<Game[]>([])
  const [allRounds, setAllRounds] = useState<Round[]>([])
  const [globalStats, setGlobalStats] = useState<GlobalStatsSummary | null>(null)
  const [savedPlayers, setSavedPlayers] = useState<SavedPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [gameFilter, setGameFilter] = useState<GameTypeFilter>('all')
  const [winnersCount, setWinnersCount] = useState(1)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [gamesRes, playersRes, profileRes] = await Promise.all([
      supabase
        .from('games')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'finished')
        .order('created_at', { ascending: false })
        .returns<Game[]>(),
      fetchPlayers(user.id),
      fetchProfile(user.id),
    ])

    const finishedGames = gamesRes.data ?? []
    const wc = profileRes.data?.winners_count ?? 1

    setAllGames(finishedGames)
    setWinnersCount(wc)
    setSavedPlayers(playersRes.data ?? [])

    if (finishedGames.length > 0) {
      const { data: rounds } = await supabase
        .from('rounds')
        .select('*')
        .in('game_id', finishedGames.map((g) => g.id))
        .returns<Round[]>()

      setAllRounds(rounds ?? [])
    } else {
      setAllRounds([])
    }

    setLoading(false)
  }

  useEffect(() => {
    const filteredGames = allGames.filter((g) => matchesGameFilter(g, gameFilter))
    const filteredRounds = allRounds.filter((r) =>
      filteredGames.some((g) => g.id === r.game_id)
    )
    if (filteredGames.length > 0) {
      setGlobalStats(computeGlobalStats(filteredGames, filteredRounds, winnersCount))
    } else {
      setGlobalStats(null)
    }
  }, [allGames, allRounds, gameFilter, winnersCount])

  const games = allGames.filter((g) => matchesGameFilter(g, gameFilter))

  const playerByName = (name: string) =>
    savedPlayers.find((p) => p.name.toLowerCase() === name.toLowerCase())

  const navigateToPlayer = async (playerName: string) => {
    if (!userId) return

    const saved = playerByName(playerName)
    if (saved) {
      navigate({ to: '/player/$playerId', params: { playerId: saved.id } })
      return
    }

    const { data: playerRecord } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', userId)
      .eq('name', playerName)
      .maybeSingle<{ id: string }>()

    if (playerRecord) {
      navigate({ to: '/player/$playerId', params: { playerId: playerRecord.id } })
    }
  }

  const records = globalStats?.records

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center gap-3 py-4 max-w-lg mx-auto">
          <BackButton className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460]" />
          <h1 className="text-lg font-bold text-white">İstatistikler</h1>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 pb-20 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : allGames.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-5xl mb-4">📊</div>
            <p className="text-white font-medium mb-2">Henüz tamamlanan oyun yok</p>
            <p className="text-[#718096] text-sm">Oyunlarını tamamladıkça istatistikler burada görünecek.</p>
          </div>
        ) : (
          <div className="space-y-8">
            <GameTypeFilterTabs value={gameFilter} onChange={setGameFilter} />

            {games.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[#718096] text-sm">Bu filtrede tamamlanan oyun yok.</p>
              </div>
            ) : (
              <>
            <section>
              <SectionTitle>Genel Özet</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <SummaryCard icon={<Gamepad2 size={20} />} label="Toplam Oyun" value={String(globalStats?.totalGames ?? 0)} />
                <SummaryCard icon={<Layers size={20} />} label="Toplam El" value={String(globalStats?.totalRounds ?? 0)} />
                <SummaryCard icon={<Zap size={20} />} label="Toplam Okey" value={String(globalStats?.totalOkeyThrows ?? 0)} color="gold" />
                <SummaryCard icon={<Flame size={20} />} label="Toplam Yakma" value={String(globalStats?.totalOkeyBurns ?? 0)} color="red" />
              </div>
            </section>

            {globalStats && globalStats.playerStats.length > 0 && (
              <section>
                <SectionTitle>En İyi Oyuncular</SectionTitle>
                <div className="flex flex-col gap-2">
                  {globalStats.playerStats.map((player, i) => (
                    <motion.button
                      key={player.name}
                      type="button"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => navigateToPlayer(player.name)}
                      className="bg-[#16213e] border border-[#2d3748] rounded-xl p-3 flex items-center gap-3 text-left hover:border-[#e94560]/40 transition-colors w-full"
                    >
                      <span className="text-lg w-6 shrink-0">
                        {i < 3 ? MEDALS[i] : `${i + 1}.`}
                      </span>
                      <PlayerAvatar
                        name={player.name}
                        avatarUrl={playerByName(player.name)?.avatar_url}
                        size={40}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{player.name}</p>
                        <p className="text-[#718096] text-xs">
                          {player.wins} kazanma (%{player.winPercentage}) • 🥇{player.firstPlaceCount} 🥈{player.secondPlaceCount} • {player.okeyThrows} okey
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-[#718096] shrink-0" />
                    </motion.button>
                  ))}
                </div>
              </section>
            )}

            {records && (
              <section>
                <SectionTitle>Rekorlar</SectionTitle>
                <div className="bg-[#16213e] border border-[#2d3748] rounded-xl overflow-hidden divide-y divide-[#2d3748]">
                  <RecordRow
                    icon={<Skull size={18} />}
                    title="En Yüksek Ceza (tek el)"
                    value={
                      records.highestPenalty
                        ? `${records.highestPenalty.player} — +${records.highestPenalty.score} puan (${formatGameDate(records.highestPenalty.date)})`
                        : '—'
                    }
                  />
                  <RecordRow
                    icon={<Star size={18} />}
                    title="En Düşük Puan (tek el)"
                    value={
                      records.lowestScore
                        ? `${records.lowestScore.player} — ${records.lowestScore.score} puan${records.lowestScore.okeyThrown ? ' (okey attı!)' : ''} (${formatGameDate(records.lowestScore.date)})`
                        : '—'
                    }
                  />
                  <RecordRow
                    icon={<Zap size={18} />}
                    title="En Çok Okey Atan"
                    value={
                      records.mostOkeyThrows
                        ? `${records.mostOkeyThrows.player} — ${records.mostOkeyThrows.count} kez`
                        : '—'
                    }
                  />
                  <RecordRow
                    icon={<Flame size={18} />}
                    title="En Çok Okey Yakan"
                    value={
                      records.mostOkeyBurns
                        ? `${records.mostOkeyBurns.player} — ${records.mostOkeyBurns.count} kez`
                        : '—'
                    }
                  />
                  <RecordRow
                    icon={<Medal size={18} />}
                    title="En Uzun Oyun"
                    value={
                      records.longestGame
                        ? `${records.longestGame.rounds} el (${formatGameDate(records.longestGame.date)})`
                        : '—'
                    }
                  />
                </div>
              </section>
            )}

            {globalStats && globalStats.playerStats.length > 0 && (
              <section>
                <SectionTitle>Oyuncu Karşılaştırma</SectionTitle>
                <div className="flex flex-col gap-2">
                  {globalStats.playerStats.map((player) => (
                    <button
                      key={player.name}
                      type="button"
                      onClick={() => navigateToPlayer(player.name)}
                      className="bg-[#16213e] border border-[#2d3748] rounded-xl p-4 flex items-center gap-3 text-left hover:border-[#e94560]/40 transition-colors w-full"
                    >
                      <PlayerAvatar
                        name={player.name}
                        avatarUrl={playerByName(player.name)?.avatar_url}
                        size={40}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{player.name}</p>
                        <p className="text-[#718096] text-xs">
                          {player.wins} kazanma • 🥇{player.firstPlaceCount} 🥈{player.secondPlaceCount} • Ort.{' '}
                          {player.averageGameScore > 0 ? '+' : ''}
                          {player.averageGameScore} puan • {player.okeyThrows} okey
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-[#718096] shrink-0" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionTitle>Son Oyunlar</SectionTitle>
              <div className="flex flex-col gap-2">
                {games.map((game, i) => (
                  <motion.button
                    key={game.id}
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setSelectedGameId(game.id)}
                    className="bg-[#16213e] border border-[#2d3748] rounded-xl p-4 text-left hover:border-[#e94560]/40 transition-colors w-full"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-white text-sm font-medium truncate">{game.players.join(', ')}</p>
                      <p className="text-[#718096] text-xs shrink-0 ml-2">
                        {formatGameDate(game.finished_at ?? game.created_at)}
                      </p>
                    </div>
                    <p className="text-[#718096] text-xs">
                      {getGameBadgeLabel(game)} • {game.players.length} oyuncu
                    </p>
                  </motion.button>
                ))}
              </div>
            </section>
              </>
            )}
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
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
      {children}
    </h2>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color?: 'gold' | 'red'
}) {
  const colorMap = {
    gold: 'text-[#f5a623] bg-[#f5a623]/10',
    red: 'text-red-400 bg-red-500/10',
    default: 'text-blue-400 bg-blue-500/10',
  }
  const c = color ? colorMap[color] : colorMap.default

  return (
    <div className="bg-[#16213e] border border-[#2d3748] rounded-xl p-4">
      <div className={`w-9 h-9 rounded-lg ${c} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-[#718096] text-xs mt-0.5">{label}</p>
    </div>
  )
}

function RecordRow({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode
  title: string
  value: string
}) {
  return (
    <div className="p-4 flex gap-3">
      <div className="w-8 h-8 rounded-lg bg-[#0f3460] text-[#a0aec0] flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[#a0aec0] text-xs font-semibold mb-1">{title}</p>
        <p className="text-white text-sm">{value}</p>
      </div>
    </div>
  )
}
