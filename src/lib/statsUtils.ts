import type { CezaliGameSettings, Game, Round } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import { detectOkeyBurnType, getGameWinners, getLeader, getPlayerRank } from '@/lib/calculations'
import { isCezaliSettings } from '@/lib/gameTypes'

export function getScoreForPlayer(scores: Record<string, number>, playerName: string): number {
  if (playerName in scores) return scores[playerName] ?? 0
  const match = Object.entries(scores).find(([k]) => k.toLowerCase() === playerName.toLowerCase())
  return match ? match[1] : 0
}

export function groupRoundsByGame(rounds: Round[]): Record<string, Round[]> {
  const map: Record<string, Round[]> = {}
  for (const round of rounds) {
    if (!map[round.game_id]) map[round.game_id] = []
    map[round.game_id].push(round)
  }
  return map
}

export function getPlayerGameTotal(rounds: Round[], playerName: string): number {
  return rounds.reduce((sum, r) => sum + getScoreForPlayer(r.scores, playerName), 0)
}

export function computeGameTotals(game: Game, rounds: Round[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const player of game.players) {
    totals[player] = rounds.reduce((sum, r) => sum + getScoreForPlayer(r.scores, player), 0)
  }
  return totals
}

export function getRoundWinner(game: Game, round: Round): string | null {
  const negatives = Object.fromEntries(
    game.players
      .filter((p) => getScoreForPlayer(round.scores, p) < 0)
      .map((p) => [p, getScoreForPlayer(round.scores, p)])
  )
  return getLeader(negatives)
}

export function isOkeyBurn(
  game: Game,
  round: Round,
  playerName: string
): boolean {
  const score = getScoreForPlayer(round.scores, playerName)
  if (score <= 0) return false
  const settings: CezaliGameSettings = isCezaliSettings(game.settings)
    ? game.settings
    : DEFAULT_SETTINGS
  return detectOkeyBurnType(
    score,
    round.color,
    settings,
    round.fake_okey ?? false
  ) !== null
}

export interface PlayerProfileStats {
  totalGames: number
  wins: number
  winPercentage: number
  firstPlaceCount: number
  secondPlaceCount: number
  thirdPlaceCount: number
  averageGameScore: number
  totalRounds: number
  okeyCount: number
  burnedCount: number
  bestRound: number | null
  worstRound: number | null
  bestGame: number | null
  worstGame: number | null
}

export function computePlayerProfileStats(
  playerName: string,
  games: Game[],
  roundsByGame: Record<string, Round[]>,
  winnersCount: number
): PlayerProfileStats {
  let wins = 0
  let firstPlaceCount = 0
  let secondPlaceCount = 0
  let thirdPlaceCount = 0
  let totalScore = 0
  let totalRounds = 0
  let okeyCount = 0
  let burnedCount = 0
  let bestRound: number | null = null
  let worstRound: number | null = null
  let bestGame: number | null = null
  let worstGame: number | null = null

  for (const game of games) {
    const gameRounds = roundsByGame[game.id] ?? []
    const playerTotals = computeGameTotals(game, gameRounds)
    const gameTotal = playerTotals[playerName] ?? getPlayerGameTotal(gameRounds, playerName)
    totalScore += gameTotal

    if (bestGame === null || gameTotal < bestGame) bestGame = gameTotal
    if (worstGame === null || gameTotal > worstGame) worstGame = gameTotal

    const winners = getGameWinners(playerTotals, winnersCount)
    const rank = getPlayerRank(playerName, playerTotals)

    if (winners.some((w) => w.toLowerCase() === playerName.toLowerCase())) wins++
    if (rank === 1) firstPlaceCount++
    if (rank === 2) secondPlaceCount++
    if (rank === 3) thirdPlaceCount++

    for (const round of gameRounds) {
      const score = getScoreForPlayer(round.scores, playerName)
      totalRounds++

      if (bestRound === null || score < bestRound) bestRound = score
      if (worstRound === null || score > worstRound) worstRound = score

      const winner = getRoundWinner(game, round)
      if (winner && winner.toLowerCase() === playerName.toLowerCase() && round.okey_thrown) {
        okeyCount++
      }

      if (isOkeyBurn(game, round, playerName)) {
        burnedCount++
      }
    }
  }

  const totalGames = games.length
  return {
    totalGames,
    wins,
    winPercentage: totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0,
    firstPlaceCount,
    secondPlaceCount,
    thirdPlaceCount,
    averageGameScore: totalGames > 0 ? Math.round(totalScore / totalGames) : 0,
    totalRounds,
    okeyCount,
    burnedCount,
    bestRound,
    worstRound,
    bestGame,
    worstGame,
  }
}

export interface PlayerAggregateStats {
  name: string
  wins: number
  winPercentage: number
  gamesPlayed: number
  firstPlaceCount: number
  secondPlaceCount: number
  thirdPlaceCount: number
  totalScore: number
  averageGameScore: number
  okeyThrows: number
  okeyBurns: number
}

export interface GlobalRecords {
  highestPenalty: { player: string; score: number; date: string; gameId: string } | null
  lowestScore: { player: string; score: number; date: string; gameId: string; okeyThrown: boolean } | null
  mostOkeyThrows: { player: string; count: number } | null
  mostOkeyBurns: { player: string; count: number } | null
  longestGame: { rounds: number; date: string; gameId: string } | null
}

export interface GlobalStatsSummary {
  totalGames: number
  totalRounds: number
  totalOkeyThrows: number
  totalOkeyBurns: number
  playerStats: PlayerAggregateStats[]
  records: GlobalRecords
}

export function computeGlobalStats(
  games: Game[],
  rounds: Round[],
  winnersCount: number
): GlobalStatsSummary {
  const roundsByGame = groupRoundsByGame(rounds)
  const playerMap = new Map<string, PlayerAggregateStats>()

  let totalOkeyThrows = 0
  let totalOkeyBurns = 0
  let highestPenalty: GlobalRecords['highestPenalty'] = null
  let lowestScore: GlobalRecords['lowestScore'] = null
  const okeyThrowByPlayer = new Map<string, number>()
  const okeyBurnByPlayer = new Map<string, number>()
  let longestGame: GlobalRecords['longestGame'] = null

  const ensurePlayer = (name: string): PlayerAggregateStats => {
    let stats = playerMap.get(name)
    if (!stats) {
      stats = {
        name,
        wins: 0,
        winPercentage: 0,
        gamesPlayed: 0,
        firstPlaceCount: 0,
        secondPlaceCount: 0,
        thirdPlaceCount: 0,
        totalScore: 0,
        averageGameScore: 0,
        okeyThrows: 0,
        okeyBurns: 0,
      }
      playerMap.set(name, stats)
    }
    return stats
  }

  for (const game of games) {
    const gameRounds = roundsByGame[game.id] ?? []
    const gameDate = game.finished_at ?? game.created_at
    const playerTotals = computeGameTotals(game, gameRounds)
    const winners = getGameWinners(playerTotals, winnersCount)

    if (!longestGame || gameRounds.length > longestGame.rounds) {
      longestGame = { rounds: gameRounds.length, date: gameDate, gameId: game.id }
    }

    for (const player of game.players) {
      const stats = ensurePlayer(player)
      stats.gamesPlayed++
      const gameTotal = playerTotals[player] ?? 0
      stats.totalScore += gameTotal

      const rank = getPlayerRank(player, playerTotals)
      if (winners.includes(player)) stats.wins++
      if (rank === 1) stats.firstPlaceCount++
      if (rank === 2) stats.secondPlaceCount++
      if (rank === 3) stats.thirdPlaceCount++
    }

    for (const round of gameRounds) {
      const winner = getRoundWinner(game, round)
      if (winner && round.okey_thrown) {
        totalOkeyThrows++
        okeyThrowByPlayer.set(winner, (okeyThrowByPlayer.get(winner) ?? 0) + 1)
        ensurePlayer(winner).okeyThrows++
      }

      for (const player of game.players) {
        const score = getScoreForPlayer(round.scores, player)

        if (score > 0 && (!highestPenalty || score > highestPenalty.score)) {
          highestPenalty = { player, score, date: gameDate, gameId: game.id }
        }
        if (score < 0 && (!lowestScore || score < lowestScore.score)) {
          lowestScore = {
            player,
            score,
            date: gameDate,
            gameId: game.id,
            okeyThrown: round.okey_thrown,
          }
        }

        if (isOkeyBurn(game, round, player)) {
          totalOkeyBurns++
          okeyBurnByPlayer.set(player, (okeyBurnByPlayer.get(player) ?? 0) + 1)
          ensurePlayer(player).okeyBurns++
        }
      }
    }
  }

  const playerStats = [...playerMap.values()]
    .map((p) => ({
      ...p,
      winPercentage: p.gamesPlayed > 0 ? Math.round((p.wins / p.gamesPlayed) * 100) : 0,
      averageGameScore: p.gamesPlayed > 0 ? Math.round(p.totalScore / p.gamesPlayed) : 0,
    }))
    .sort((a, b) => b.wins - a.wins || a.averageGameScore - b.averageGameScore)

  const topOkeyThrow = [...okeyThrowByPlayer.entries()].sort((a, b) => b[1] - a[1])[0]
  const topOkeyBurn = [...okeyBurnByPlayer.entries()].sort((a, b) => b[1] - a[1])[0]

  return {
    totalGames: games.length,
    totalRounds: rounds.length,
    totalOkeyThrows,
    totalOkeyBurns,
    playerStats,
    records: {
      highestPenalty,
      lowestScore,
      mostOkeyThrows: topOkeyThrow ? { player: topOkeyThrow[0], count: topOkeyThrow[1] } : null,
      mostOkeyBurns: topOkeyBurn ? { player: topOkeyBurn[0], count: topOkeyBurn[1] } : null,
      longestGame,
    },
  }
}

export function getRankEmoji(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `${rank}.`
}
