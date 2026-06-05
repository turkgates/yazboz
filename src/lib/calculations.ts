import type { Color, ColorMultipliers, PlayerRoundResult, GameSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

export function getSpecialMultiplier(okeyThrown: boolean, doubleFinish: boolean): number {
  let m = 1
  if (okeyThrown) m *= 2
  if (doubleFinish) m *= 2
  return m
}

export function getLoserMultiplier(
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  colorMultipliers: ColorMultipliers
): number {
  return colorMultipliers[color] * getSpecialMultiplier(okeyThrown, doubleFinish)
}

export function getTotalMultiplier(
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  colorMultipliers: ColorMultipliers
): number {
  return getLoserMultiplier(color, okeyThrown, doubleFinish, colorMultipliers)
}

export function calculateRoundScore(
  result: PlayerRoundResult,
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  settings: GameSettings = DEFAULT_SETTINGS
): number {
  const { colorMultipliers, winnerBonus } = settings
  const baseMultiplier = colorMultipliers[color]
  const specialMultiplier = getSpecialMultiplier(okeyThrown, doubleFinish)

  if (result.isWinner) {
    return -(winnerBonus[color] * specialMultiplier)
  }
  return result.rawPoints * baseMultiplier * specialMultiplier
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

export function reverseRawPoints(
  score: number,
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  settings: GameSettings = DEFAULT_SETTINGS
): number {
  const multiplier = getLoserMultiplier(color, okeyThrown, doubleFinish, settings.colorMultipliers)
  if (multiplier === 0) return 0
  return Math.round(score / multiplier)
}

export function inferRoundInputFromScores(
  round: {
    color: Color
    okey_thrown: boolean
    double_finish: boolean
    scores: Record<string, number>
  },
  players: string[],
  settings: GameSettings = DEFAULT_SETTINGS
): { winner: string | null; rawPoints: Record<string, string> } {
  const winner = players.find((p) => (round.scores[p] ?? 0) < 0) ?? null
  const rawPoints: Record<string, string> = {}

  for (const player of players) {
    if (player === winner) continue
    const score = round.scores[player] ?? 0
    rawPoints[player] = String(reverseRawPoints(score, round.color, round.okey_thrown, round.double_finish, settings))
  }

  return { winner, rawPoints }
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
  const specialMultiplier = getSpecialMultiplier(okeyThrown, doubleFinish)
  return -(settings.winnerBonus[color] * specialMultiplier)
}
