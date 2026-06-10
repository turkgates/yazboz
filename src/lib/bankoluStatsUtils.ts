import type { Game, Round } from '@/types'
import { getTeams, isBankoluEsli, isBankoluGame, teamLabel } from '@/lib/gameTypes'
import { getBankoHistory } from '@/lib/bankoluUtils'
import { getScoreForPlayer } from '@/lib/statsUtils'

export interface PlayerBankoluStats {
  totalGames: number
  totalBankos: number
  bankoWins: number
  bankoLosses: number
  highestBankoPenalty: number | null
}

export interface GlobalBankoluStats {
  mostBankos: { player: string; count: number } | null
  highestBankoPenalty: { player: string; score: number } | null
}

export function computePlayerBankoluStats(
  playerName: string,
  games: Game[],
  roundsByGame: Record<string, Round[]>
): PlayerBankoluStats {
  const bankoluGames = games.filter((g) => isBankoluGame(g))
  let totalBankos = 0
  let bankoWins = 0
  let bankoLosses = 0
  let highestBankoPenalty: number | null = null

  for (const game of bankoluGames) {
    const history = getBankoHistory(game)
    const esli = isBankoluEsli(game)
    const entityKey = esli
      ? (() => {
          const team = getTeams(game).find((t) =>
            t.some((p) => p.toLowerCase() === playerName.toLowerCase())
          )
          return team ? teamLabel(team) : playerName
        })()
      : playerName

    totalBankos += history[entityKey]?.length ?? 0

    const gameRounds = roundsByGame[game.id] ?? []
    for (const round of gameRounds) {
      if (!(round.banko_players ?? []).includes(entityKey)) continue
      const score = getScoreForPlayer(round.scores, entityKey)
      if (score > 0) {
        bankoLosses++
        if (highestBankoPenalty === null || score > highestBankoPenalty) {
          highestBankoPenalty = score
        }
      } else if (score < 0) {
        bankoWins++
      }
    }
  }

  return {
    totalGames: bankoluGames.length,
    totalBankos,
    bankoWins,
    bankoLosses,
    highestBankoPenalty,
  }
}

export function computeGlobalBankoluStats(
  games: Game[],
  roundsByGame: Record<string, Round[]>
): GlobalBankoluStats {
  const bankoluGames = games.filter((g) => isBankoluGame(g))
  const bankoCounts: Record<string, number> = {}
  let highestBankoPenalty: GlobalBankoluStats['highestBankoPenalty'] = null

  for (const game of bankoluGames) {
    const history = getBankoHistory(game)
    for (const [player, rounds] of Object.entries(history)) {
      bankoCounts[player] = (bankoCounts[player] ?? 0) + rounds.length
    }

    const gameRounds = roundsByGame[game.id] ?? []
    for (const round of gameRounds) {
      for (const player of round.banko_players ?? []) {
        const score = getScoreForPlayer(round.scores, player)
        if (score > 0 && (!highestBankoPenalty || score > highestBankoPenalty.score)) {
          highestBankoPenalty = { player, score }
        }
      }
    }
  }

  const topBanko = Object.entries(bankoCounts).sort((a, b) => b[1] - a[1])[0]

  return {
    mostBankos: topBanko ? { player: topBanko[0], count: topBanko[1] } : null,
    highestBankoPenalty,
  }
}

export function getBankoSummaryLines(game: Game): string[] {
  const history = getBankoHistory(game)
  return Object.entries(history)
    .filter(([, rounds]) => rounds.length > 0)
    .map(([name, rounds]) => `${name} ${rounds.length} kez banko dedi`)
}
