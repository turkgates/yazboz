import type { Game, Round, SayiliOkeySettings } from '@/types'
import {
  getGameRanking,
  getTeams,
  isEsliGame,
  teamLabel,
  parseTeamLabel,
} from '@/lib/gameTypes'

export function teamKey(players: string[]): string {
  return [...players].sort().join(' & ')
}

export function getTeamRoundScore(round: Round, team: string[], label: string): number {
  if (label in round.scores) return round.scores[label] ?? 0
  return team.reduce((sum, p) => sum + (round.scores[p] ?? 0), 0)
}

export function getTeamGameTotal(rounds: Round[], team: string[]): number {
  const label = teamLabel(team)
  return rounds.reduce((sum, r) => sum + getTeamRoundScore(r, team, label), 0)
}

export function getWinnerTeamLabel(game: Game, rounds: Round[]): string {
  const ranking = getGameRanking(game, rounds)
  return ranking[0]?.name ?? ''
}

export interface TeamWinStats {
  teamKey: string
  players: string[]
  wins: number
  gamesPlayed: number
  winRate: number
}

export interface EsliTeamStatsSummary {
  topTeams: TeamWinStats[]
  mostCompatible: TeamWinStats | null
  leastCompatible: TeamWinStats | null
  personalWins: Array<{ name: string; wins: number; gamesPlayed: number; winRate: number }>
}

export function computeEsliTeamStats(
  games: Game[],
  roundsByGame: Record<string, Round[]>
): EsliTeamStatsSummary {
  const esliGames = games.filter(isEsliGame)
  const teamWins: Record<string, number> = {}
  const teamGames: Record<string, number> = {}
  const teamPlayers: Record<string, string[]> = {}
  const playerWins: Record<string, number> = {}
  const playerEsliGames: Record<string, number> = {}

  for (const game of esliGames) {
    const rounds = roundsByGame[game.id] ?? []
    const teams = getTeams(game)
    const winnerLabel = getWinnerTeamLabel(game, rounds)
    const winnerPlayers = parseTeamLabel(winnerLabel)

    for (const team of teams) {
      const key = teamKey(team)
      teamGames[key] = (teamGames[key] ?? 0) + 1
      teamPlayers[key] = team

      for (const p of team) {
        playerEsliGames[p] = (playerEsliGames[p] ?? 0) + 1
      }

      if (winnerLabel === teamLabel(team) || teamKey(winnerPlayers) === key) {
        teamWins[key] = (teamWins[key] ?? 0) + 1
        for (const p of team) {
          playerWins[p] = (playerWins[p] ?? 0) + 1
        }
      }
    }
  }

  const allTeams: TeamWinStats[] = Object.keys(teamGames).map((key) => ({
    teamKey: key,
    players: teamPlayers[key],
    wins: teamWins[key] ?? 0,
    gamesPlayed: teamGames[key],
    winRate: teamGames[key] > 0 ? Math.round(((teamWins[key] ?? 0) / teamGames[key]) * 100) : 0,
  }))

  const topTeams = [...allTeams].sort((a, b) => b.wins - a.wins || b.winRate - a.winRate)
  const withGames = allTeams.filter((t) => t.gamesPlayed > 0)
  const mostCompatible = withGames.length
    ? [...withGames].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins)[0]
    : null
  const leastCompatible = withGames.length
    ? [...withGames].sort((a, b) => a.winRate - b.winRate || a.wins - b.wins)[0]
    : null

  const personalWins = Object.keys(playerEsliGames)
    .map((name) => ({
      name,
      wins: playerWins[name] ?? 0,
      gamesPlayed: playerEsliGames[name],
      winRate:
        playerEsliGames[name] > 0
          ? Math.round(((playerWins[name] ?? 0) / playerEsliGames[name]) * 100)
          : 0,
    }))
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate)

  return { topTeams, mostCompatible, leastCompatible, personalWins }
}

export interface PlayerEsliStats {
  totalEsliGames: number
  esliWins: number
  winRate: number
  mostFrequentPartner: string | null
  bestPartner: { name: string; wins: number; total: number; winRate: number } | null
}

export function computePlayerEsliStats(
  playerName: string,
  games: Game[],
  roundsByGame: Record<string, Round[]>
): PlayerEsliStats | null {
  const esliGames = games.filter(
    (g) => isEsliGame(g) && g.players.some((p) => p.toLowerCase() === playerName.toLowerCase())
  )
  if (esliGames.length === 0) return null

  let esliWins = 0
  const partnerGames: Record<string, number> = {}
  const partnerWins: Record<string, number> = {}

  for (const game of esliGames) {
    const rounds = roundsByGame[game.id] ?? []
    const teams = getTeams(game)
    const myTeam = teams.find((t) =>
      t.some((p) => p.toLowerCase() === playerName.toLowerCase())
    )
    if (!myTeam) continue

    const partner = myTeam.find((p) => p.toLowerCase() !== playerName.toLowerCase())
    if (partner) {
      partnerGames[partner] = (partnerGames[partner] ?? 0) + 1
    }

    const winnerLabel = getWinnerTeamLabel(game, rounds)
    const won = winnerLabel === teamLabel(myTeam)
    if (won) {
      esliWins++
      if (partner) partnerWins[partner] = (partnerWins[partner] ?? 0) + 1
    }
  }

  const mostFrequentPartner = Object.entries(partnerGames).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  let bestPartner: PlayerEsliStats['bestPartner'] = null
  for (const [partner, total] of Object.entries(partnerGames)) {
    const wins = partnerWins[partner] ?? 0
    const winRate = Math.round((wins / total) * 100)
    if (!bestPartner || wins > bestPartner.wins || (wins === bestPartner.wins && winRate > bestPartner.winRate)) {
      bestPartner = { name: partner, wins, total, winRate }
    }
  }

  return {
    totalEsliGames: esliGames.length,
    esliWins,
    winRate: Math.round((esliWins / esliGames.length) * 100),
    mostFrequentPartner,
    bestPartner,
  }
}

export function getSayiliStartScore(game: Game): number {
  return (game.settings as SayiliOkeySettings).startScore ?? 21
}
