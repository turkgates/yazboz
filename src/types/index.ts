export type Color = 'black' | 'red' | 'yellow' | 'green'

export type GameStatus = 'active' | 'finished'

export type GameType = 'cezali_okey'

export interface ColorMultipliers {
  black: number
  red: number
  yellow: number
  green: number
}

export interface WinnerBonus {
  black: number
  red: number
  yellow: number
  green: number
}

export interface GameSettings {
  colorMultipliers: ColorMultipliers
  winnerBonus: WinnerBonus
  defaultRounds: number
  note?: string
}

export const DEFAULT_SETTINGS: GameSettings = {
  colorMultipliers: {
    black: 5,
    red: 4,
    yellow: 3,
    green: 2,
  },
  winnerBonus: {
    black: 50,
    red: 40,
    yellow: 30,
    green: 20,
  },
  defaultRounds: 11,
}

export interface Game {
  id: string
  user_id: string
  game_type: GameType
  status: GameStatus
  total_rounds: number
  players: string[]
  settings: GameSettings
  created_at: string
  finished_at?: string | null
}

export interface Round {
  id: string
  game_id: string
  round_number: number
  color: Color
  okey_thrown: boolean
  double_finish: boolean
  scores: Record<string, number>
  created_at: string
}

export type { PlayerRoundInput, PlayerStatus, OkeyBurnType } from '@/lib/calculations'

export interface RoundInput {
  color: Color
  okeyThrown: boolean
  doubleFinish: boolean
  noWinner?: boolean
  playerResults: import('@/lib/calculations').PlayerRoundInput[]
}

export interface Profile {
  id: string
  username: string | null
  created_at: string
}

export interface SavedPlayer {
  id: string
  user_id: string
  name: string
  avatar_url: string | null
  created_at: string
}

export interface GameSummary {
  game: Game
  rounds: Round[]
  totals: Record<string, number>
  winner: string | null
}

export const COLOR_LABELS: Record<Color, string> = {
  black: 'Siyah',
  red: 'Kırmızı',
  yellow: 'Sarı',
  green: 'Yeşil',
}

export const COLOR_HEX: Record<Color, string> = {
  black: '#374151',
  red: '#e74c3c',
  yellow: '#f39c12',
  green: '#27ae60',
}
