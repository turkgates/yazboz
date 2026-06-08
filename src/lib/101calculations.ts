// 101 Okey puan hesaplama

export type OkeyYuzbirFinishType = 'normal' | 'elden' | 'okey_ile' | 'elden_okey'

export const OKEY_YUZBIR_FINISH_SCORES: Record<OkeyYuzbirFinishType, number> = {
  normal: -101,
  elden: -202,
  okey_ile: -202,
  elden_okey: -303,
}

export const OKEY_YUZBIR_NOT_OPENED_PENALTY = 202
export const OKEY_YUZBIR_WRONG_OPEN_PENALTY = 101
export const OKEY_YUZBIR_OKEY_IN_HAND_PENALTY = 101

export interface OkeyYuzbirPlayerInput {
  playerName: string
  isWinner: boolean
  finishType?: OkeyYuzbirFinishType
  hasOpened: boolean
  tileSum?: number
  wrongOpen?: boolean
  okeyInHand?: boolean
}

export function calculate101Score(input: OkeyYuzbirPlayerInput): number {
  if (input.isWinner) {
    return OKEY_YUZBIR_FINISH_SCORES[input.finishType ?? 'normal']
  }

  let score = input.hasOpened
    ? (input.tileSum ?? 0)
    : OKEY_YUZBIR_NOT_OPENED_PENALTY

  if (input.wrongOpen) score += OKEY_YUZBIR_WRONG_OPEN_PENALTY
  if (input.okeyInHand) score += OKEY_YUZBIR_OKEY_IN_HAND_PENALTY

  return score
}

export function calculate101Scores(
  inputs: OkeyYuzbirPlayerInput[]
): Record<string, number> {
  const scores: Record<string, number> = {}
  for (const input of inputs) {
    scores[input.playerName] = calculate101Score(input)
  }
  return scores
}

export function compute101Totals(
  keys: string[],
  roundScores: Record<string, number>[]
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const key of keys) {
    totals[key] = roundScores.reduce((sum, s) => sum + (s[key] ?? 0), 0)
  }
  return totals
}

export function get101Ranking(
  totals: Record<string, number>
): Array<{ name: string; total: number; rank: number }> {
  return Object.entries(totals)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => a.total - b.total)
    .map((item, i) => ({ ...item, rank: i + 1 }))
}

export function isSpecialFinish(score: number): boolean {
  return score === OKEY_YUZBIR_FINISH_SCORES.elden ||
    score === OKEY_YUZBIR_FINISH_SCORES.okey_ile ||
    score === OKEY_YUZBIR_FINISH_SCORES.elden_okey
}
