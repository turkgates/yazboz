import type { Game, GameSettings, Round, SayiliOkeySettings } from '@/types'
import { calculateTotals, getRanking } from '@/lib/calculations'

export type GameTypeFilter = 'all' | 'cezali' | 'sayili'

export function isCezaliSettings(settings: GameSettings): settings is import('@/types').CezaliGameSettings {
  return 'colorMultipliers' in settings && settings.colorMultipliers !== undefined
}

export function isSayiliSettings(settings: GameSettings): settings is SayiliOkeySettings {
  return 'startScore' in settings && settings.startScore !== undefined
}

export function isCezaliGame(game: Game): boolean {
  return game.game_type === 'cezali_okey' || game.game_type === 'cezali_esli'
}

export function isSayiliGame(game: Game): boolean {
  return game.game_type === 'sayili_okey'
}

export function isEsliGame(game: Game): boolean {
  return game.game_subtype === 'esli' || game.game_type === 'cezali_esli'
}

export function getTeams(game: Game): string[][] {
  if (game.teams && game.teams.length > 0) return game.teams
  if (game.game_type === 'cezali_esli' || (game.game_type === 'sayili_okey' && game.game_subtype === 'esli')) {
    if (game.players.length === 4) {
      return [[game.players[0], game.players[1]], [game.players[2], game.players[3]]]
    }
  }
  return []
}

export function teamLabel(team: string[]): string {
  return team.join(' & ')
}

export function getGameBadgeLabel(game: Game): string {
  if (game.game_type === 'cezali_okey') return 'Cezalı Okey - Herkes Tek'
  if (game.game_type === 'cezali_esli') return 'Cezalı Okey - Eşli'
  if (game.game_type === 'sayili_okey' && game.game_subtype === 'esli') return 'Sayılı Okey - Eşli'
  if (game.game_type === 'sayili_okey') return 'Sayılı Okey - Tekli'
  return 'Okey'
}

export function matchesGameFilter(game: Game, filter: GameTypeFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'cezali') return isCezaliGame(game)
  return isSayiliGame(game)
}

export const DEFAULT_SAYILI_SETTINGS: SayiliOkeySettings = {
  startScore: 21,
  showIndicator: true,
  indicatorValue: 1,
  normalFinish: 2,
  okeyOrDouble: 4,
  okeyAndDouble: 8,
}

export type SayiliFinishType = 'normal' | 'okey' | 'double' | 'okey_double'

export function getSayiliFinishValue(
  settings: SayiliOkeySettings,
  type: SayiliFinishType
): number {
  switch (type) {
    case 'normal':
      return settings.normalFinish
    case 'okey':
    case 'double':
      return settings.okeyOrDouble
    case 'okey_double':
      return settings.okeyAndDouble
  }
}

export function computeSayiliCurrentScores(
  game: Game,
  rounds: import('@/types').Round[]
): Record<string, number> {
  const settings = game.settings as SayiliOkeySettings
  const start = settings.startScore ?? 21
  const keys = isEsliGame(game)
    ? getTeams(game).map(teamLabel)
    : game.players

  const scores: Record<string, number> = {}
  for (const key of keys) scores[key] = start

  for (const round of rounds) {
    for (const key of keys) {
      scores[key] += round.scores[key] ?? 0
    }
  }
  return scores
}

export function getSayiliRanking(
  currentScores: Record<string, number>
): Array<{ name: string; score: number; rank: number }> {
  return Object.entries(currentScores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => a.score - b.score)
    .map((item, i) => ({ ...item, rank: i + 1 }))
}

export function getGameRanking(
  game: Game,
  rounds: Round[]
): Array<{ name: string; total: number; rank: number }> {
  if (isSayiliGame(game)) {
    const scores = computeSayiliCurrentScores(game, rounds)
    return getSayiliRanking(scores).map((r) => ({
      name: r.name,
      total: r.score,
      rank: r.rank,
    }))
  }
  const totals = calculateTotals(game.players, rounds.map((r) => r.scores))
  return getRanking(totals)
}

export function getSayiliEntityScore(
  game: Game,
  rounds: Round[],
  playerName: string
): number {
  const settings = game.settings as SayiliOkeySettings
  const start = settings.startScore ?? 21
  const scores = computeSayiliCurrentScores(game, rounds)
  if (isEsliGame(game)) {
    const team = getTeams(game).find((t) =>
      t.some((p) => p.toLowerCase() === playerName.toLowerCase())
    )
    if (!team) return start
    return scores[teamLabel(team)] ?? start
  }
  return scores[playerName] ?? start
}
