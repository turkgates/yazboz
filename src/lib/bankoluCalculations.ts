export type BankoluColor = 'black' | 'red' | 'yellow' | 'green' | 'fake'

export interface BankoluPlayerInput {
  name: string
  isBanko: boolean
  isWinner: boolean
  isFakeOkeyOpener: boolean
  isOkeyBurned: boolean
  rawPoints: number
}

export interface BankoluRoundInput {
  color: BankoluColor
  okeyThrown: boolean
  doubleFinish: boolean
  players: BankoluPlayerInput[]
}

const COLOR_MULT: Record<'black' | 'red' | 'yellow' | 'green', number> = {
  black: 5,
  red: 4,
  yellow: 3,
  green: 2,
}

export function getBankoluMultiplier(
  color: BankoluColor,
  okeyThrown: boolean,
  doubleFinish: boolean,
  isBanko: boolean
): number {
  const colorMultiplier = color === 'fake' ? 10 : COLOR_MULT[color]
  let specialMult = 1
  if (okeyThrown) specialMult *= 2
  if (doubleFinish) specialMult *= 2
  const bankoMult = isBanko ? 2 : 1
  return colorMultiplier * specialMult * bankoMult
}

export function calculateBankoluScore(
  player: BankoluPlayerInput,
  round: BankoluRoundInput,
  winnerIsBanko: boolean
): number {
  const isFake = round.color === 'fake'

  if (player.isOkeyBurned) {
    if (!round.okeyThrown && !winnerIsBanko) return 100
    if (round.okeyThrown && !winnerIsBanko) return 200
    if (isFake) return 200
    if (round.okeyThrown && winnerIsBanko && !player.isBanko) return 400
    if (round.okeyThrown && winnerIsBanko && player.isBanko) return 800
    return 100
  }

  if (player.isWinner) {
    if (isFake) {
      if (player.isFakeOkeyOpener) return 0
      let drop = 100
      if (round.okeyThrown) drop = 200
      if (winnerIsBanko) drop *= 2
      if (player.isFakeOkeyOpener && winnerIsBanko) drop -= 100
      return -drop
    }

    let drop = 50
    if (round.okeyThrown || round.doubleFinish) drop = 100
    if (round.okeyThrown && round.doubleFinish) drop = 200
    if (player.isBanko) drop *= 2
    if (player.isFakeOkeyOpener) drop -= 100
    return -drop
  }

  if (isFake) {
    let mult = 10
    if (round.okeyThrown) mult *= 2
    if (round.doubleFinish) mult *= 2
    if (winnerIsBanko) mult *= 2
    if (player.isBanko) mult *= 2
    let score = player.rawPoints * mult
    if (player.isFakeOkeyOpener) score += 100
    return score
  }

  const colorMult = COLOR_MULT[round.color as keyof typeof COLOR_MULT]
  let specialMult = 1
  if (round.okeyThrown) specialMult *= 2
  if (round.doubleFinish) specialMult *= 2
  if (winnerIsBanko) specialMult *= 2
  if (player.isBanko) specialMult *= 2

  let score = player.rawPoints * colorMult * specialMult
  if (player.isFakeOkeyOpener) score += 100
  return score
}

export function calculateBankoluScores(
  input: BankoluRoundInput
): Record<string, number> {
  const winner = input.players.find((p) => p.isWinner)
  const winnerIsBanko = winner?.isBanko ?? false
  const scores: Record<string, number> = {}
  for (const player of input.players) {
    scores[player.name] = calculateBankoluScore(player, input, winnerIsBanko)
  }
  return scores
}
