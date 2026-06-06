import type { Color, GameSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

export type PlayerStatus = 'winner' | 'loser' | 'okey_burned' | 'no_winner'
export type OkeyBurnType = 'normal_win' | 'okey_thrown' | 'double_okey'

export interface PlayerRoundInput {
  playerName: string
  status: PlayerStatus
  rawPoints?: number
  okeyThrown?: boolean
  doubleFinish?: boolean
  okeyBurnType?: OkeyBurnType
}

export function getSpecialMultiplier(okeyThrown: boolean, doubleFinish: boolean): number {
  let m = 1
  if (okeyThrown) m *= 2
  if (doubleFinish) m *= 2
  return m
}

export function getWinnerPenaltyMultiplier(okeyThrown: boolean, doubleFinish: boolean): number {
  if (okeyThrown && doubleFinish) return 20
  if (okeyThrown || doubleFinish) return 10
  return 1
}

export function getLoserMultiplier(
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  colorMultipliers: GameSettings['colorMultipliers']
): number {
  return colorMultipliers[color] * getSpecialMultiplier(okeyThrown, doubleFinish)
}

export function getOkeyBurnPenalty(
  burnType: OkeyBurnType,
  color: Color,
  settings: GameSettings = DEFAULT_SETTINGS
): number {
  const bonus = settings.winnerBonus[color]
  switch (burnType) {
    case 'normal_win':
      return bonus * 10
    case 'okey_thrown':
      return bonus * 20
    case 'double_okey':
      return bonus * 30
  }
}

export function calculatePlayerScore(
  input: PlayerRoundInput,
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  settings: GameSettings = DEFAULT_SETTINGS
): number {
  const baseMultiplier = settings.colorMultipliers[color]
  const bonus = settings.winnerBonus[color]

  if (input.status === 'no_winner') {
    return (input.rawPoints ?? 0) * baseMultiplier
  }

  if (input.status === 'winner') {
    const mult = getWinnerPenaltyMultiplier(okeyThrown, doubleFinish)
    return -(bonus * mult)
  }

  if (input.status === 'okey_burned') {
    return getOkeyBurnPenalty(input.okeyBurnType ?? 'normal_win', color, settings)
  }

  const loserMult = getLoserMultiplier(color, okeyThrown, doubleFinish, settings.colorMultipliers)
  return (input.rawPoints ?? 0) * loserMult
}

export function calculateAllScores(
  playerInputs: PlayerRoundInput[],
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  settings: GameSettings = DEFAULT_SETTINGS
): Record<string, number> {
  const scores: Record<string, number> = {}
  for (const input of playerInputs) {
    scores[input.playerName] = calculatePlayerScore(input, color, okeyThrown, doubleFinish, settings)
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

export function reverseNoWinnerRawPoints(
  score: number,
  color: Color,
  settings: GameSettings = DEFAULT_SETTINGS
): number {
  const baseMultiplier = settings.colorMultipliers[color]
  if (baseMultiplier === 0) return 0
  return Math.round(score / baseMultiplier)
}

export function detectOkeyBurnType(
  score: number,
  color: Color,
  settings: GameSettings = DEFAULT_SETTINGS
): OkeyBurnType | null {
  const types: OkeyBurnType[] = ['normal_win', 'okey_thrown', 'double_okey']
  for (const type of types) {
    if (score === getOkeyBurnPenalty(type, color, settings)) return type
  }
  return null
}

export interface InferredRoundState {
  noWinner: boolean
  winner: string | null
  playerStatuses: Record<string, 'normal' | 'okey_burned' | 'winner'>
  okeyBurnTypes: Record<string, OkeyBurnType>
  rawPoints: Record<string, string>
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
): InferredRoundState {
  const winner = players.find((p) => (round.scores[p] ?? 0) < 0) ?? null
  const playerStatuses: Record<string, 'normal' | 'okey_burned' | 'winner'> = {}
  const okeyBurnTypes: Record<string, OkeyBurnType> = {}
  const rawPoints: Record<string, string> = {}

  if (!winner) {
    const allNoWinner = players.every((p) => {
      const score = round.scores[p] ?? 0
      if (score <= 0) return false
      const raw = reverseNoWinnerRawPoints(score, round.color, settings)
      return score === raw * settings.colorMultipliers[round.color]
    })

    if (allNoWinner) {
      for (const player of players) {
        playerStatuses[player] = 'normal'
        const score = round.scores[player] ?? 0
        rawPoints[player] = String(reverseNoWinnerRawPoints(score, round.color, settings))
      }
      return { noWinner: true, winner: null, playerStatuses, okeyBurnTypes, rawPoints }
    }
  }

  for (const player of players) {
    if (player === winner) {
      playerStatuses[player] = 'winner'
      continue
    }

    const score = round.scores[player] ?? 0
    const burnType = detectOkeyBurnType(score, round.color, settings)

    if (burnType) {
      playerStatuses[player] = 'okey_burned'
      okeyBurnTypes[player] = burnType
    } else {
      playerStatuses[player] = 'normal'
      rawPoints[player] = String(
        reverseRawPoints(score, round.color, round.okey_thrown, round.double_finish, settings)
      )
    }
  }

  return { noWinner: false, winner, playerStatuses, okeyBurnTypes, rawPoints }
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
  input: PlayerRoundInput,
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  settings: GameSettings = DEFAULT_SETTINGS
): number {
  return calculatePlayerScore(input, color, okeyThrown, doubleFinish, settings)
}

export function getWinnerBonus(
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  settings: GameSettings = DEFAULT_SETTINGS
): number {
  const mult = getWinnerPenaltyMultiplier(okeyThrown, doubleFinish)
  return -(settings.winnerBonus[color] * mult)
}
