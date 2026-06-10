import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase, fetchPlayers } from '@/lib/supabase'
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
import { computeGlobalStats, computeGlobal101Stats, type GlobalStatsSummary } from '@/lib/statsUtils'
import { matchesGameFilter, getGameTypeLabel, is101Game, isBankoluGame, type GameTypeFilter } from '@/lib/gameTypes'
import { computeGlobalBankoluStats } from '@/lib/bankoluStatsUtils'
import { GameTypeFilterTabs } from '@/components/GameTypeFilterTabs'
import { TeamAvatars } from '@/components/TeamAvatars'
import { computeEsliTeamStats } from '@/lib/teamStatsUtils'
import { groupRoundsByGame } from '@/lib/statsUtils'

export const Route = createFileRoute('/stats')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: StatsPage,
})

const MEDALS = ['🥇', '🥈', '🥉']
const PAGE_SIZE = 5

function StatsPage() {
  const navigate = useNavigate()
  const [allGames, setAllGames] = useState<Game[]>([])
  const [allRounds, setAllRounds] = useState<Round[]>([])
  const [globalStats, setGlobalStats] = useState<GlobalStatsSummary | null>(null)
  const [savedPlayers, setSavedPlayers] = useState<SavedPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [gameFilter, setGameFilter] = useState<GameTypeFilter>([])
  const [listVisibleCount, setListVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [gamesRes, playersRes] = await Promise.all([
      supabase
        .from('games')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'finished')
        .order('created_at', { ascending: false })
        .returns<Game[]>(),
      fetchPlayers(user.id),
    ])

    const finishedGames = gamesRes.data ?? []

    setAllGames(finishedGames)
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
      setGlobalStats(computeGlobalStats(filteredGames, filteredRounds))
    } else {
      setGlobalStats(null)
    }
  }, [allGames, allRounds, gameFilter])

  useEffect(() => {
    setListVisibleCount(PAGE_SIZE)
  }, [gameFilter])

  const games = allGames.filter((g) => matchesGameFilter(g, gameFilter))
  const listGames = games.slice(0, listVisibleCount)
  const hasMoreList = listVisibleCount < games.length

  const showEsliStats = gameFilter.includes('esli')
  const esliTeamStats = showEsliStats
    ? computeEsliTeamStats(games, groupRoundsByGame(allRounds))
    : null

  const show101Stats = games.some((g) => is101Game(g))
  const stats101 = show101Stats
    ? computeGlobal101Stats(games, groupRoundsByGame(allRounds))
    : null

  const showBankoluStats = games.some((g) => isBankoluGame(g))
  const statsBankolu = showBankoluStats
    ? computeGlobalBankoluStats(games, groupRoundsByGame(allRounds))
    : null

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

            {showEsliStats && esliTeamStats && esliTeamStats.topTeams.length > 0 && (
              <>
                <section>
                  <SectionTitle>🏆 En Başarılı Takımlar</SectionTitle>
                  <div className="flex flex-col gap-2">
                    {esliTeamStats.topTeams.slice(0, 5).map((team, i) => (
                      <div
                        key={team.teamKey}
                        className="bg-[#16213e] border border-[#2d3748] rounded-xl p-3 flex items-center gap-3"
                      >
                        <span className="text-lg w-6 shrink-0">{i < 3 ? MEDALS[i] : `${i + 1}.`}</span>
                        <TeamAvatars
                          players={team.players}
                          avatarUrls={team.players.map((p) => playerByName(p)?.avatar_url ?? null)}
                          size={36}
                          ringColor="yellow"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">{team.teamKey}</p>
                          <p className="text-[#718096] text-xs">{team.wins} kazanma</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {(esliTeamStats.mostCompatible || esliTeamStats.leastCompatible) && (
                  <section>
                    <SectionTitle>Çift Uyumu</SectionTitle>
                    <div className="bg-[#16213e] border border-[#2d3748] rounded-xl overflow-hidden divide-y divide-[#2d3748]">
                      {esliTeamStats.mostCompatible && (
                        <div className="p-4 flex items-center gap-3">
                          <span className="text-xl">💑</span>
                          <TeamAvatars
                            players={esliTeamStats.mostCompatible.players}
                            avatarUrls={esliTeamStats.mostCompatible.players.map((p) => playerByName(p)?.avatar_url ?? null)}
                            size={32}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[#a0aec0] text-xs font-semibold">En Uyumlu Çift</p>
                            <p className="text-white text-sm">{esliTeamStats.mostCompatible.teamKey}</p>
                            <p className="text-[#f5a623] text-xs">%{esliTeamStats.mostCompatible.winRate} kazanma</p>
                          </div>
                        </div>
                      )}
                      {esliTeamStats.leastCompatible && esliTeamStats.leastCompatible.teamKey !== esliTeamStats.mostCompatible?.teamKey && (
                        <div className="p-4 flex items-center gap-3">
                          <span className="text-xl">💔</span>
                          <TeamAvatars
                            players={esliTeamStats.leastCompatible.players}
                            avatarUrls={esliTeamStats.leastCompatible.players.map((p) => playerByName(p)?.avatar_url ?? null)}
                            size={32}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[#a0aec0] text-xs font-semibold">En Uyumsuz Çift</p>
                            <p className="text-white text-sm">{esliTeamStats.leastCompatible.teamKey}</p>
                            <p className="text-[#718096] text-xs">%{esliTeamStats.leastCompatible.winRate} kazanma</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {esliTeamStats.personalWins.length > 0 && (
                  <section>
                    <SectionTitle>👤 Kişisel Kazanma (Eşli)</SectionTitle>
                    <div className="flex flex-col gap-2">
                      {esliTeamStats.personalWins.map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => navigateToPlayer(p.name)}
                          className="bg-[#16213e] border border-[#2d3748] rounded-xl p-3 flex items-center gap-3 text-left hover:border-[#e94560]/40 w-full"
                        >
                          <PlayerAvatar
                            name={p.name}
                            avatarUrl={playerByName(p.name)?.avatar_url}
                            size={36}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold">{p.name}</p>
                            <p className="text-[#718096] text-xs">
                              {p.wins} kazanma (%{p.winRate})
                            </p>
                          </div>
                          <ChevronRight size={16} className="text-[#718096] shrink-0" />
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {showBankoluStats && statsBankolu && (
              <section>
                <SectionTitle>💥 Bankolu Okey Rekorları</SectionTitle>
                <div className="bg-[#16213e] border border-[#2d3748] rounded-xl overflow-hidden divide-y divide-[#2d3748]">
                  {statsBankolu.mostBankos && (
                    <RecordRow
                      icon={<Zap size={18} />}
                      title="En Fazla Banko"
                      value={`${statsBankolu.mostBankos.player} — ${statsBankolu.mostBankos.count} kez`}
                    />
                  )}
                  {statsBankolu.highestBankoPenalty && (
                    <RecordRow
                      icon={<Flame size={18} />}
                      title="En Yüksek Banko Cezası"
                      value={`${statsBankolu.highestBankoPenalty.player} — +${statsBankolu.highestBankoPenalty.score}`}
                    />
                  )}
                </div>
              </section>
            )}

            {show101Stats && stats101 && (
              <section>
                <SectionTitle>💯 101 Okey Rekorları</SectionTitle>
                <div className="bg-[#16213e] border border-[#2d3748] rounded-xl overflow-hidden divide-y divide-[#2d3748]">
                  {stats101.mostElden && (
                    <RecordRow
                      icon={<Zap size={18} />}
                      title="En Fazla Elden Biten"
                      value={`${stats101.mostElden.player} — ${stats101.mostElden.count} kez`}
                    />
                  )}
                  {stats101.most303 && (
                    <RecordRow
                      icon={<Skull size={18} />}
                      title="En Fazla -303 (Elden + Okey)"
                      value={`${stats101.most303.player} — ${stats101.most303.count} kez`}
                    />
                  )}
                  {stats101.highestRound && (
                    <RecordRow
                      icon={<Flame size={18} />}
                      title="En Yüksek Tek El (ceza)"
                      value={`${stats101.highestRound.player} — +${stats101.highestRound.score} (${formatGameDate(stats101.highestRound.date)})`}
                    />
                  )}
                  {stats101.lowestRound && (
                    <RecordRow
                      icon={<Star size={18} />}
                      title="En Düşük Tek El (bitiş)"
                      value={`${stats101.lowestRound.player} — ${stats101.lowestRound.score} (${formatGameDate(stats101.lowestRound.date)})`}
                    />
                  )}
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
                {listGames.map((game, i) => {
                  const subtype = game.game_subtype ?? (game.game_type === 'cezali_esli' ? 'esli' : 'solo')
                  const type = game.game_type === 'cezali_esli' ? 'cezali_okey' : game.game_type
                  return (
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
                        {getGameTypeLabel(type, subtype)} • {game.players.length} oyuncu
                      </p>
                    </motion.button>
                  )
                })}
              </div>
              {hasMoreList && (
                <button
                  type="button"
                  onClick={() => setListVisibleCount((c) => c + PAGE_SIZE)}
                  className="w-full mt-3 py-3 text-[#a0aec0] hover:text-white text-sm font-semibold transition-colors"
                >
                  Daha Eski →
                </button>
              )}
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
