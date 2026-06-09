export type Color = 'black' | 'red' | 'yellow' | 'green'

export type GameStatus = 'active' | 'finished'

export type GameType = 'cezali_okey' | 'cezali_esli' | 'sayili_okey' | '101_okey'

export type GameSubtype = 'solo' | 'esli'

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

export interface CezaliGameSettings {
  colorMultipliers: ColorMultipliers
  winnerBonus: WinnerBonus
  defaultRounds: number
  winnersCount?: number
  note?: string
}

export interface SayiliOkeySettings {
  startScore: number
  showIndicator: boolean
  indicatorValue: number
  normalFinish: number
  okeyOrDouble: number
  okeyAndDouble: number
  winnersCount?: number
  note?: string
}

export interface OkeyYuzbirSettings {
  katlamali: boolean
  defaultRounds: number
  winnersCount?: number
}

export type GameSettings = CezaliGameSettings | SayiliOkeySettings | OkeyYuzbirSettings

export const DEFAULT_SETTINGS: CezaliGameSettings = {
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
  game_subtype?: GameSubtype
  status: GameStatus
  total_rounds: number
  players: string[]
  teams?: string[][] | null
  settings: GameSettings
  katlamali?: boolean
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
  fake_okey?: boolean
  scores: Record<string, number>
  indicator_players?: string[]
  is_indicator_only?: boolean
  created_at: string
}

export type { PlayerRoundInput, PlayerStatus, OkeyBurnType } from '@/lib/calculations'

export interface RoundInput {
  color: Color
  okeyThrown: boolean
  doubleFinish: boolean
  fakeOkey?: boolean
  noWinner?: boolean
  playerResults: import('@/lib/calculations').PlayerRoundInput[]
}

export interface Profile {
  id: string
  username: string | null
  winners_count?: number
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
