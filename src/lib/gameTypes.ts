import type { Game, GameSettings, OkeyYuzbirSettings, Round, SayiliOkeySettings } from '@/types'
import { calculateTotals, getRanking } from '@/lib/calculations'
import { compute101Totals, get101Ranking } from '@/lib/101calculations'

export type GameFilterKey = 'cezali' | 'sayili' | '101' | 'solo' | 'esli'
export type GameTypeFilter = GameFilterKey[]

export function parseTeamLabel(label: string): string[] {
  return label.split(' & ').map((s) => s.trim()).filter(Boolean)
}

export function getTeamPlayers(game: Game, teamName: string): string[] {
  const teams = getTeams(game)
  const found = teams.find((t) => teamLabel(t) === teamName)
  if (found) return found
  return parseTeamLabel(teamName)
}

export function isCezaliSettings(settings: GameSettings): settings is import('@/types').CezaliGameSettings {
  return 'colorMultipliers' in settings && settings.colorMultipliers !== undefined
}

export function isSayiliSettings(settings: GameSettings): settings is SayiliOkeySettings {
  return 'startScore' in settings && settings.startScore !== undefined
}

export function is101Settings(settings: GameSettings): settings is OkeyYuzbirSettings {
  return 'katlamali' in settings && !('startScore' in settings) && !('colorMultipliers' in settings)
}

export const DEFAULT_101_SETTINGS: OkeyYuzbirSettings = {
  katlamali: false,
  defaultRounds: 11,
  winnersCount: 1,
}

export function getWinnersCount(settings: GameSettings): number {
  if ('winnersCount' in settings && typeof settings.winnersCount === 'number') {
    return Math.max(1, Math.min(3, settings.winnersCount))
  }
  return 1
}

export function isCezaliGame(game: Game): boolean {
  return game.game_type === 'cezali_okey' || game.game_type === 'cezali_esli'
}

export function is101Game(game: Game): boolean {
  return game.game_type === '101_okey'
}

export function isCezaliEsli(game: Game): boolean {
  return (
    (game.game_type === 'cezali_okey' && game.game_subtype === 'esli') ||
    game.game_type === 'cezali_esli'
  )
}

export function getGameTypeLabel(
  type: Game['game_type'],
  subtype: Game['game_subtype'] = 'solo'
): string {
  let typeLabel: string
  if (type === 'sayili_okey') typeLabel = 'Sayılı Okey'
  else if (type === '101_okey') typeLabel = '101 Okey'
  else typeLabel = 'Cezalı Okey'
  const subtypeLabel = subtype === 'esli' ? 'Eşli' : 'Tekli'
  return `${typeLabel} • ${subtypeLabel}`
}

export function isSayiliGame(game: Game): boolean {
  return game.game_type === 'sayili_okey'
}

export function isEsliGame(game: Game): boolean {
  return game.game_subtype === 'esli' || game.game_type === 'cezali_esli'
}

export function getTeams(game: Game): string[][] {
  if (game.teams && game.teams.length > 0) return game.teams
  if (
    isCezaliEsli(game) ||
    ((game.game_type === 'sayili_okey' || game.game_type === '101_okey') && game.game_subtype === 'esli')
  ) {
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
  const subtype = game.game_subtype ?? (game.game_type === 'cezali_esli' ? 'esli' : 'solo')
  const type = game.game_type === 'cezali_esli' ? 'cezali_okey' : game.game_type
  return getGameTypeLabel(type, subtype)
}

export function matchesGameFilter(game: Game, filters: GameTypeFilter): boolean {
  if (filters.length === 0) return true
  if (filters.includes('cezali') && !isCezaliGame(game)) return false
  if (filters.includes('sayili') && !isSayiliGame(game)) return false
  if (filters.includes('101') && !is101Game(game)) return false
  if (filters.includes('esli') && !isEsliGame(game)) return false
  if (filters.includes('solo') && isEsliGame(game)) return false
  return true
}

export function computeCezaliTeamTotals(
  game: Game,
  rounds: Round[]
): Record<string, number> {
  const teams = getTeams(game)
  const totals: Record<string, number> = {}
  for (const team of teams) {
    const label = teamLabel(team)
    totals[label] = rounds.reduce(
      (sum, r) => sum + (r.scores[label] ?? team.reduce((s, p) => s + (r.scores[p] ?? 0), 0)),
      0
    )
  }
  return totals
}

export const DEFAULT_SAYILI_SETTINGS: SayiliOkeySettings = {
  startScore: 21,
  showIndicator: true,
  indicatorValue: 1,
  normalFinish: 2,
  okeyOrDouble: 4,
  okeyAndDouble: 8,
  winnersCount: 1,
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
  if (is101Game(game)) {
    const keys = isEsliGame(game) ? getTeams(game).map(teamLabel) : game.players
    const totals = compute101Totals(keys, rounds.map((r) => r.scores))
    return get101Ranking(totals)
  }
  if (isSayiliGame(game) || isCezaliEsli(game)) {
    const scores = isSayiliGame(game)
      ? computeSayiliCurrentScores(game, rounds)
      : computeCezaliTeamTotals(game, rounds)
    return getSayiliRanking(scores).map((r) => ({
      name: r.name,
      total: r.score,
      rank: r.rank,
    }))
  }
  const totals = calculateTotals(game.players, rounds.map((r) => r.scores))
  return getRanking(totals)
}

export function getIndicatorUsedThisEl(
  rounds: Round[],
  entities: string[]
): Record<string, boolean> {
  const used: Record<string, boolean> = {}
  for (const e of entities) used[e] = false

  let elStart = 0
  for (let i = rounds.length - 1; i >= 0; i--) {
    if (!rounds[i].is_indicator_only) {
      elStart = i + 1
      break
    }
  }

  for (const round of rounds.slice(elStart)) {
    if (round.is_indicator_only) {
      for (const player of round.indicator_players ?? []) {
        used[player] = true
      }
    }
  }

  return used
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
