import type { Color, ColorMultipliers, PlayerRoundResult, GameSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

export function calculateRoundScore(
  result: PlayerRoundResult,
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  settings: GameSettings = DEFAULT_SETTINGS
): number {
  const { colorMultipliers, winnerBonus } = settings
  const baseMultiplier = colorMultipliers[color]

  let specialMultiplier = 1
  if (okeyThrown) specialMultiplier *= 2
  if (doubleFinish) specialMultiplier *= 2

  const totalMultiplier = baseMultiplier * specialMultiplier

  if (result.isWinner) {
    return -(winnerBonus[color] * totalMultiplier)
  } else {
    return result.rawPoints * totalMultiplier
  }
}

export function calculateAllScores(
  playerResults: PlayerRoundResult[],
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  settings: GameSettings = DEFAULT_SETTINGS
): Record<string, number> {
  const scores: Record<string, number> = {}
  for (const result of playerResults) {
    scores[result.playerName] = calculateRoundScore(
      result,
      color,
      okeyThrown,
      doubleFinish,
      settings
    )
  }
  return scores
}

export function getSpecialMultiplier(okeyThrown: boolean, doubleFinish: boolean): number {
  let m = 1
  if (okeyThrown) m *= 2
  if (doubleFinish) m *= 2
  return m
}

export function getTotalMultiplier(
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  colorMultipliers: ColorMultipliers
): number {
  return colorMultipliers[color] * getSpecialMultiplier(okeyThrown, doubleFinish)
}

export function calculateTotals(
  players: string[],
  roundScores: Array<Record<string, number>>
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const player of players) {
    totals[player] = 0
  }
  for (const round of roundScores) {
    for (const player of players) {
      totals[player] = (totals[player] ?? 0) + (round[player] ?? 0)
    }
  }
  return totals
}

export function getLeader(totals: Record<string, number>): string | null {
  const entries = Object.entries(totals)
  if (entries.length === 0) return null
  return entries.reduce((min, curr) => (curr[1] < min[1] ? curr : min))[0]
}

export function getRanking(totals: Record<string, number>): Array<{ name: string; total: number; rank: number }> {
  return Object.entries(totals)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => a.total - b.total)
    .map((item, index) => ({ ...item, rank: index + 1 }))
}

export function previewRoundScore(
  playerName: string,
  isWinner: boolean,
  rawPoints: number,
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  settings: GameSettings = DEFAULT_SETTINGS
): number {
  return calculateRoundScore(
    { playerName, isWinner, rawPoints },
    color,
    okeyThrown,
    doubleFinish,
    settings
  )
}

export function getWinnerBonus(
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  settings: GameSettings = DEFAULT_SETTINGS
): number {
  const totalMultiplier = getTotalMultiplier(color, okeyThrown, doubleFinish, settings.colorMultipliers)
  return -(settings.winnerBonus[color] * totalMultiplier)
}
