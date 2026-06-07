import type { Color, CezaliGameSettings } from '@/types'
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
  fakeOkey?: boolean
}

const FAKE_OKEY_BASE = 10

export function getFakeOkeyLoserMultiplier(okeyThrown: boolean, doubleFinish: boolean): number {
  if (okeyThrown) return 20
  if (doubleFinish) return 40
  return FAKE_OKEY_BASE
}

export function getFakeOkeyWinnerScore(okeyThrown: boolean, doubleFinish: boolean): number {
  if (okeyThrown && doubleFinish) return -2000
  if (okeyThrown) return -1000
  if (doubleFinish) return -2000
  return -100
}

export function getFakeOkeyBurnPenalty(burnType: OkeyBurnType): number {
  switch (burnType) {
    case 'normal_win':
      return 1000
    case 'okey_thrown':
      return 2000
    case 'double_okey':
      return 3000
  }
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
  colorMultipliers: CezaliGameSettings['colorMultipliers']
): number {
  return colorMultipliers[color] * getSpecialMultiplier(okeyThrown, doubleFinish)
}

export function deriveOkeyBurnType(okeyThrown: boolean, doubleFinish: boolean): OkeyBurnType {
  if (doubleFinish) return 'double_okey'
  if (okeyThrown) return 'okey_thrown'
  return 'normal_win'
}

export function getOkeyBurnPenalty(
  burnType: OkeyBurnType,
  color: Color,
  settings: CezaliGameSettings = DEFAULT_SETTINGS
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
  settings: CezaliGameSettings = DEFAULT_SETTINGS,
  fakeOkey = false
): number {
  if (fakeOkey) {
    if (input.status === 'no_winner') {
      return (input.rawPoints ?? 0) * FAKE_OKEY_BASE
    }
    if (input.status === 'winner') {
      return getFakeOkeyWinnerScore(okeyThrown, doubleFinish)
    }
    if (input.status === 'okey_burned') {
      return getFakeOkeyBurnPenalty(input.okeyBurnType ?? 'normal_win')
    }
    const fakeMultiplier = getFakeOkeyLoserMultiplier(okeyThrown, doubleFinish)
    return (input.rawPoints ?? 0) * fakeMultiplier
  }

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
  settings: CezaliGameSettings = DEFAULT_SETTINGS,
  fakeOkey = false
): Record<string, number> {
  const scores: Record<string, number> = {}
  for (const input of playerInputs) {
    scores[input.playerName] = calculatePlayerScore(input, color, okeyThrown, doubleFinish, settings, fakeOkey)
  }
  return scores
}

export function reverseRawPoints(
  score: number,
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  settings: CezaliGameSettings = DEFAULT_SETTINGS
): number {
  const multiplier = getLoserMultiplier(color, okeyThrown, doubleFinish, settings.colorMultipliers)
  if (multiplier === 0) return 0
  return Math.round(score / multiplier)
}

export function reverseNoWinnerRawPoints(
  score: number,
  color: Color,
  settings: CezaliGameSettings = DEFAULT_SETTINGS
): number {
  const baseMultiplier = settings.colorMultipliers[color]
  if (baseMultiplier === 0) return 0
  return Math.round(score / baseMultiplier)
}

export function detectOkeyBurnType(
  score: number,
  color: Color,
  settings: CezaliGameSettings = DEFAULT_SETTINGS,
  fakeOkey = false
): OkeyBurnType | null {
  const types: OkeyBurnType[] = ['normal_win', 'okey_thrown', 'double_okey']
  for (const type of types) {
    const penalty = fakeOkey
      ? getFakeOkeyBurnPenalty(type)
      : getOkeyBurnPenalty(type, color, settings)
    if (score === penalty) return type
  }
  return null
}

export function isFakeOkeyWinnerScore(score: number): boolean {
  return score === -100 || score === -1000 || score === -2000
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
    fake_okey?: boolean
    scores: Record<string, number>
  },
  players: string[],
  settings: CezaliGameSettings = DEFAULT_SETTINGS
): InferredRoundState & { fakeOkey: boolean } {
  const fakeOkey = round.fake_okey ?? players.some((p) => isFakeOkeyWinnerScore(round.scores[p] ?? 0))
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
        rawPoints[player] = fakeOkey
          ? String(Math.round(score / FAKE_OKEY_BASE))
          : String(reverseNoWinnerRawPoints(score, round.color, settings))
      }
      return { noWinner: true, winner: null, playerStatuses, okeyBurnTypes, rawPoints, fakeOkey }
    }
  }

  for (const player of players) {
    if (player === winner) {
      playerStatuses[player] = 'winner'
      continue
    }

    const score = round.scores[player] ?? 0
    const burnType = detectOkeyBurnType(score, round.color, settings, fakeOkey)

    if (burnType) {
      playerStatuses[player] = 'okey_burned'
      okeyBurnTypes[player] = burnType
    } else {
      playerStatuses[player] = 'normal'
      rawPoints[player] = fakeOkey
        ? String(Math.round(score / getFakeOkeyLoserMultiplier(round.okey_thrown, round.double_finish)))
        : String(reverseRawPoints(score, round.color, round.okey_thrown, round.double_finish, settings))
    }
  }

  return { noWinner: false, winner, playerStatuses, okeyBurnTypes, rawPoints, fakeOkey }
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

export function getGameWinners(
  playerTotals: Record<string, number>,
  winnersCount: number
): string[] {
  const sorted = Object.entries(playerTotals).sort(([, a], [, b]) => a - b)
  return sorted.slice(0, winnersCount).map(([name]) => name)
}

export function getPlayerRank(
  playerName: string,
  playerTotals: Record<string, number>
): number {
  const sorted = Object.entries(playerTotals).sort(([, a], [, b]) => a - b)
  const index = sorted.findIndex(
    ([name]) => name.toLowerCase() === playerName.toLowerCase()
  )
  return index === -1 ? sorted.length : index + 1
}

export function previewRoundScore(
  input: PlayerRoundInput,
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  settings: CezaliGameSettings = DEFAULT_SETTINGS,
  fakeOkey = false
): number {
  return calculatePlayerScore(input, color, okeyThrown, doubleFinish, settings, fakeOkey)
}

export function getWinnerBonus(
  color: Color,
  okeyThrown: boolean,
  doubleFinish: boolean,
  settings: CezaliGameSettings = DEFAULT_SETTINGS
): number {
  const mult = getWinnerPenaltyMultiplier(okeyThrown, doubleFinish)
  return -(settings.winnerBonus[color] * mult)
}
