import type { Game } from '@/types'
import { getTeams, isBankoluEsli, teamLabel } from '@/lib/gameTypes'

export type BankoHistory = Record<string, number[]>

export function getBankoHistory(game: Game): BankoHistory {
  return game.banko_history ?? {}
}

export function getBankoEntities(game: Game): string[] {
  if (isBankoluEsli(game)) return getTeams(game).map(teamLabel)
  return game.players
}

export function getBankoCount(history: BankoHistory, entity: string): number {
  return history[entity]?.length ?? 0
}

export function mustForceBanko(
  history: BankoHistory,
  entity: string,
  currentRound: number,
  totalRounds: number
): boolean {
  return currentRound === totalRounds && getBankoCount(history, entity) === 0
}

export function applyBankoToHistory(
  history: BankoHistory,
  entities: string[],
  roundNumber: number
): BankoHistory {
  const next = { ...history }
  for (const entity of entities) {
    const existing = next[entity] ?? []
    if (!existing.includes(roundNumber)) {
      next[entity] = [...existing, roundNumber].sort((a, b) => a - b)
    }
  }
  return next
}

export function getForcedBankos(
  game: Game,
  currentRound: number
): string[] {
  const history = getBankoHistory(game)
  const entities = getBankoEntities(game)
  return entities.filter((e) =>
    mustForceBanko(history, e, currentRound, game.total_rounds)
  )
}

export function playerIsBanko(
  playerName: string,
  currentBankos: string[],
  game: Game
): boolean {
  if (isBankoluEsli(game)) {
    const team = getTeams(game).find((t) =>
      t.some((p) => p.toLowerCase() === playerName.toLowerCase())
    )
    if (!team) return false
    return currentBankos.includes(teamLabel(team))
  }
  return currentBankos.includes(playerName)
}
