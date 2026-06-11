import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { Game, Round } from '@/types'
import { fetchPlayerGamesWithRounds } from '@/lib/supabase'
import { getGameWinners } from '@/lib/calculations'
import {
  computePlayerProfileStats,
  computePlayer101Stats,
  computeGameTotals,
  getPlayerGameTotal,
  getScoreForPlayer,
  getRankEmoji,
} from '@/lib/statsUtils'
import {
  getWinnersCount,
  is101Game,
  isBankoluGame,
  isCezaliGame,
  isSayiliGame,
  getSayiliEntityScore,
  getGameBadgeLabel,
} from '@/lib/gameTypes'
import { computePlayerBankoluStats } from '@/lib/bankoluStatsUtils'
import { OKEY_YUZBIR_FINISH_SCORES } from '@/lib/101calculations'
import { formatGameDate } from '@/lib/dateUtils'
import { GameResultModal } from '@/components/GameResultModal'

export interface PlayerStatsProps {
  playerName: string
  ownerUserId: string
  showHistory?: boolean
}

type GameTypeFilterKey = 'all' | 'cezali' | 'bankolu' | 'sayili' | '101'
type SubtypeFilterKey = 'all' | 'solo' | 'esli'

function matchesGameType(game: Game, filter: GameTypeFilterKey): boolean {
  if (filter === 'all') return true
  if (filter === 'cezali') {
    return game.game_type === 'cezali_okey' || game.game_type === 'cezali_esli'
  }
  if (filter === 'bankolu') return game.game_type === 'bankolu_cezali_okey'
  if (filter === 'sayili') return game.game_type === 'sayili_okey'
  if (filter === '101') return game.game_type === '101_okey'
  return true
}

function filterGames(
  games: Game[],
  gameTypeFilter: GameTypeFilterKey,
  subtypeFilter: SubtypeFilterKey
): Game[] {
  return games.filter((g) => {
    const typeMatch = matchesGameType(g, gameTypeFilter)
    const subtypeMatch = subtypeFilter === 'all' || g.game_subtype === subtypeFilter
    return typeMatch && subtypeMatch
  })
}

function computeRoundWinStats(
  playerName: string,
  games: Game[],
  roundsByGame: Record<string, Round[]>
) {
  let totalRounds = 0
  let winnerRounds = 0
  let roundScoreTotal = 0

  for (const game of games) {
    const gameRounds = roundsByGame[game.id] ?? []
    for (const round of gameRounds) {
      if (round.is_indicator_only) continue
      totalRounds++
      const score = getScoreForPlayer(round.scores, playerName)
      roundScoreTotal += score

      const scores = game.players
        .map((p) => getScoreForPlayer(round.scores, p))
        .filter((s) => s !== 0 || Object.keys(round.scores).length > 0)
      if (scores.length === 0) continue
      const minScore = Math.min(...scores)
      if (score === minScore) winnerRounds++
    }
  }

  return {
    totalRounds,
    winnerRounds,
    roundWinRate: totalRounds > 0 ? Math.round((winnerRounds / totalRounds) * 100) : 0,
    averageRoundScore:
      totalRounds > 0 ? Math.round((roundScoreTotal / totalRounds) * 10) / 10 : 0,
  }
}

function computeSpecialStats(
  playerName: string,
  games: Game[],
  roundsByGame: Record<string, Round[]>,
  gameTypeFilter: GameTypeFilterKey
) {
  let fakeOkeyCount = 0
  let bankoCount = 0
  let indicatorCount = 0
  let sayiliFinishTotal = 0
  let sayiliGameCount = 0
  let acmadanFinishCount = 0

  const showCezali =
    gameTypeFilter === 'all' || gameTypeFilter === 'cezali' || gameTypeFilter === 'bankolu'
  const showSayili = gameTypeFilter === 'all' || gameTypeFilter === 'sayili'
  const show101 = gameTypeFilter === 'all' || gameTypeFilter === '101'

  for (const game of games) {
    const gameRounds = roundsByGame[game.id] ?? []

    if (showSayili && isSayiliGame(game)) {
      sayiliGameCount++
      sayiliFinishTotal += getSayiliEntityScore(game, gameRounds, playerName)
    }

    for (const round of gameRounds) {
      if (showCezali && (isCezaliGame(game) || isBankoluGame(game))) {
        if (round.fake_okey && getScoreForPlayer(round.scores, playerName) > 0) {
          fakeOkeyCount++
        }
        if (isBankoluGame(game) && (round.banko_players ?? []).includes(playerName)) {
          bankoCount++
        }
      }

      if (showSayili && isSayiliGame(game)) {
        if ((round.indicator_players ?? []).some(
          (p) => p.toLowerCase() === playerName.toLowerCase()
        )) {
          indicatorCount++
        }
      }

      if (show101 && is101Game(game)) {
        const score = getScoreForPlayer(round.scores, playerName)
        if (score === OKEY_YUZBIR_FINISH_SCORES.normal) acmadanFinishCount++
      }
    }
  }

  const stats101 = show101 ? computePlayer101Stats(playerName, games, roundsByGame) : null
  const statsBankolu =
    showCezali && (gameTypeFilter === 'all' || gameTypeFilter === 'bankolu')
      ? computePlayerBankoluStats(playerName, games.filter(isBankoluGame), roundsByGame)
      : null

  return {
    fakeOkeyCount,
    bankoCount,
    indicatorCount,
    sayiliAvgFinish:
      sayiliGameCount > 0 ? Math.round(sayiliFinishTotal / sayiliGameCount) : null,
    stats101,
    statsBankolu,
    acmadanFinishCount,
  }
}

function formatScore(score: number): string {
  if (score > 0) return `+${score}`
  return String(score)
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
        active
          ? 'bg-[#e94560] text-white'
          : 'bg-[#0f3460] text-[#a0aec0] hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-[#16213e] border border-[#2d3748] rounded-xl p-3">
      <p className="text-[#718096] text-xs mb-1">{label}</p>
      <p className={`font-bold text-lg ${accent ?? 'text-white'}`}>{value}</p>
    </div>
  )
}

export function PlayerStats({ playerName, ownerUserId, showHistory = true }: PlayerStatsProps) {
  const [loading, setLoading] = useState(true)
  const [allGames, setAllGames] = useState<Game[]>([])
  const [allRoundsByGame, setAllRoundsByGame] = useState<Record<string, Round[]>>({})
  const [gameTypeFilter, setGameTypeFilter] = useState<GameTypeFilterKey>('all')
  const [subtypeFilter, setSubtypeFilter] = useState<SubtypeFilterKey>('all')
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)

  useEffect(() => {
    if (!playerName || !ownerUserId) return
    setLoading(true)
    fetchPlayerGamesWithRounds(ownerUserId, playerName).then(({ games, roundsByGame }) => {
      setAllGames(games)
      setAllRoundsByGame(roundsByGame)
      setLoading(false)
    })
  }, [playerName, ownerUserId])

  const filteredGames = useMemo(
    () => filterGames(allGames, gameTypeFilter, subtypeFilter),
    [allGames, gameTypeFilter, subtypeFilter]
  )

  const filteredRoundsByGame = useMemo(() => {
    const map: Record<string, Round[]> = {}
    for (const game of filteredGames) {
      map[game.id] = allRoundsByGame[game.id] ?? []
    }
    return map
  }, [filteredGames, allRoundsByGame])

  const profileStats = useMemo(
    () => computePlayerProfileStats(playerName, filteredGames, filteredRoundsByGame),
    [playerName, filteredGames, filteredRoundsByGame]
  )

  const roundStats = useMemo(
    () => computeRoundWinStats(playerName, filteredGames, filteredRoundsByGame),
    [playerName, filteredGames, filteredRoundsByGame]
  )

  const specialStats = useMemo(
    () => computeSpecialStats(playerName, filteredGames, filteredRoundsByGame, gameTypeFilter),
    [playerName, filteredGames, filteredRoundsByGame, gameTypeFilter]
  )

  const fourthPlaceCount = useMemo(() => {
    let count = 0
    for (const game of filteredGames) {
      const totals = computeGameTotals(game, filteredRoundsByGame[game.id] ?? [])
      const sorted = Object.entries(totals).sort(([, a], [, b]) => a - b)
      const idx = sorted.findIndex(([name]) => name.toLowerCase() === playerName.toLowerCase())
      if (idx === 3) count++
    }
    return count
  }, [filteredGames, filteredRoundsByGame, playerName])

  const history = useMemo(() => {
    return filteredGames.slice(0, 10).map((game) => {
      const rounds = filteredRoundsByGame[game.id] ?? []
      const playerTotals = computeGameTotals(game, rounds)
      const winners = getGameWinners(playerTotals, getWinnersCount(game.settings))
      const sorted = Object.entries(playerTotals).sort(([, a], [, b]) => a - b)
      const rank = sorted.findIndex(([name]) => name.toLowerCase() === playerName.toLowerCase()) + 1
      const total = isSayiliGame(game)
        ? getSayiliEntityScore(game, rounds, playerName)
        : getPlayerGameTotal(rounds, playerName)
      return {
        game,
        total,
        rank: rank || 1,
        isWinner: winners.some((w) => w.toLowerCase() === playerName.toLowerCase()),
      }
    })
  }, [filteredGames, filteredRoundsByGame, playerName])

  const showCezaliStats =
    gameTypeFilter === 'all' || gameTypeFilter === 'cezali' || gameTypeFilter === 'bankolu'
  const showSayiliStats = gameTypeFilter === 'all' || gameTypeFilter === 'sayili'
  const show101Stats = gameTypeFilter === 'all' || gameTypeFilter === '101'

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-3 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!allGames.length) {
    return <p className="text-[#718096] text-center py-8">Henüz oyun kaydı yok</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters row 1 */}
      <div>
        <p className="text-[#718096] text-[10px] font-semibold uppercase tracking-wider mb-2">Oyun Türü</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ['all', 'Tümü'],
              ['cezali', 'Cezalı'],
              ['bankolu', 'Bankolu'],
              ['sayili', 'Sayılı'],
              ['101', '101'],
            ] as const
          ).map(([key, label]) => (
            <FilterChip
              key={key}
              label={label}
              active={gameTypeFilter === key}
              onClick={() => {
                setGameTypeFilter(key)
                if (key === 'all') setSubtypeFilter('all')
              }}
            />
          ))}
        </div>
      </div>

      {/* Filters row 2 */}
      <div>
        <p className="text-[#718096] text-[10px] font-semibold uppercase tracking-wider mb-2">Alt Tür</p>
        <div className="flex gap-2">
          {(
            [
              ['all', 'Tümü'],
              ['solo', 'Tekli'],
              ['esli', 'Eşli'],
            ] as const
          ).map(([key, label]) => (
            <FilterChip
              key={key}
              label={label}
              active={subtypeFilter === key}
              onClick={() => setSubtypeFilter(key)}
            />
          ))}
        </div>
      </div>

      {/* Summary 2x2 */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="🎮 Toplam Oyun" value={profileStats.totalGames} />
        <StatCard label="🏆 Kazanma Sayısı" value={profileStats.wins} accent="text-[#f5a623]" />
        <StatCard label="🃏 Oyun Kazanma" value={`%${profileStats.winPercentage}`} accent="text-green-400" />
        <StatCard label="🎯 El Kazanma" value={`%${roundStats.roundWinRate}`} accent="text-blue-400" />
      </div>

      {/* General stats */}
      <div>
        <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">Genel</p>
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Toplam Oyun" value={profileStats.totalGames} />
          <StatCard label="Kazanma" value={`${profileStats.wins} (%${profileStats.winPercentage})`} />
          <StatCard label="🥇 1. Olma" value={profileStats.firstPlaceCount} />
          <StatCard label="🥈 2. Olma" value={profileStats.secondPlaceCount} />
          <StatCard label="🥉 3. Olma" value={profileStats.thirdPlaceCount} />
          <StatCard label="4. Olma" value={fourthPlaceCount} />
          <StatCard label="Ort. Oyun Puanı" value={formatScore(profileStats.averageGameScore)} />
          <StatCard
            label="En İyi Oyun"
            value={profileStats.bestGame !== null ? formatScore(profileStats.bestGame) : '—'}
            accent="text-green-400"
          />
          <StatCard
            label="En Kötü Oyun"
            value={profileStats.worstGame !== null ? formatScore(profileStats.worstGame) : '—'}
            accent="text-red-400"
          />
        </div>
      </div>

      {/* Round stats */}
      <div>
        <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">El Bazlı</p>
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Toplam El" value={roundStats.totalRounds} />
          <StatCard
            label="En İyi El"
            value={profileStats.bestRound !== null ? formatScore(profileStats.bestRound) : '—'}
            accent="text-green-400"
          />
          <StatCard
            label="En Kötü El"
            value={profileStats.worstRound !== null ? formatScore(profileStats.worstRound) : '—'}
            accent="text-red-400"
          />
          <StatCard label="Ort. El Puanı" value={formatScore(roundStats.averageRoundScore)} />
        </div>
      </div>

      {/* Special stats by type */}
      {showCezaliStats && (
        <div>
          <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">Cezalı / Bankolu</p>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Okey Atma" value={profileStats.okeyCount} />
            <StatCard label="Okeyi Yakma" value={profileStats.burnedCount} />
            <StatCard label="Sahte Okey" value={specialStats.fakeOkeyCount} />
            {(gameTypeFilter === 'all' || gameTypeFilter === 'bankolu') && specialStats.statsBankolu && (
              <StatCard label="Banko Sayısı" value={specialStats.statsBankolu.totalBankos} />
            )}
          </div>
        </div>
      )}

      {showSayiliStats && (
        <div>
          <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">Sayılı Okey</p>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Gösterge Sayısı" value={specialStats.indicatorCount} />
            <StatCard
              label="Ort. Bitiş Sayısı"
              value={specialStats.sayiliAvgFinish ?? '—'}
            />
          </div>
        </div>
      )}

      {show101Stats && specialStats.stats101 && (
        <div>
          <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">101 Okey</p>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Elden Bitirme" value={specialStats.stats101.eldenCount} />
            <StatCard label="Açmadan Bitirme" value={specialStats.acmadanFinishCount} />
            <StatCard label="Elden + Okey" value={specialStats.stats101.eldenOkeyCount} />
            <StatCard label="Ort. El Puanı" value={specialStats.stats101.avgRoundScore} />
          </div>
        </div>
      )}

      {/* History */}
      {showHistory && (
        <div>
          <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">Son 10 Oyun</p>
          {history.length === 0 ? (
            <p className="text-[#718096] text-sm text-center py-6">Bu filtrede oyun yok</p>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map((item, i) => (
                <motion.button
                  key={item.game.id}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => setSelectedGameId(item.game.id)}
                  className="bg-[#16213e] border border-[#2d3748] rounded-xl p-3 text-left hover:border-[#e94560]/40 transition-colors w-full"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold ${item.isWinner ? 'text-[#f5a623]' : 'text-[#718096]'}`}>
                      {item.isWinner ? '🏆 Kazandı' : 'Kaybetti'} {getRankEmoji(item.rank)}
                    </span>
                    <span className="text-[#718096] text-xs">
                      {formatGameDate(item.game.finished_at ?? item.game.created_at)}
                    </span>
                  </div>
                  <p className="text-[#718096] text-xs mb-1">{getGameBadgeLabel(item.game)}</p>
                  <p className={`text-sm font-bold ${item.total < 0 ? 'text-green-400' : item.total > 0 ? 'text-red-400' : 'text-white'}`}>
                    Toplam: {isSayiliGame(item.game) ? item.total : formatScore(item.total)}
                  </p>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      )}

      <GameResultModal
        gameId={selectedGameId ?? ''}
        isOpen={!!selectedGameId}
        onClose={() => setSelectedGameId(null)}
        onViewScoreboard={() => setSelectedGameId(null)}
      />
    </div>
  )
}
