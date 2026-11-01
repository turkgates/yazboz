import type { Game } from '@/types'
import { getTeams, teamLabel } from '@/lib/gameTypes'

// Eşli oyunlarda skor ve banko kayıtları "A & B" etiketiyle tutulur:
// oyuncunun adı değişince takım etiketinin de taşınması gerekir.
export function buildPlayerRename(game: Game, oldName: string, newName: string) {
  const rename = (name: string) => (name === oldName ? newName : name)

  const keyMap: Record<string, string> = { [oldName]: newName }
  for (const team of getTeams(game)) {
    if (team.includes(oldName)) keyMap[teamLabel(team)] = teamLabel(team.map(rename))
  }

  return {
    players: game.players.map(rename),
    teams: game.teams?.map((team) => team.map(rename)) ?? null,
    keyMap,
  }
}

export function renameKeys<T>(
  record: Record<string, T>,
  keyMap: Record<string, string>
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [keyMap[key] ?? key, value])
  )
}

export function renameValues(values: string[], keyMap: Record<string, string>): string[] {
  return values.map((value) => keyMap[value] ?? value)
}
