import type { PlayerRoundInput, OkeyBurnType, PlayerStatus } from '@/lib/calculations'
import type { OkeyYuzbirFinishType, OkeyYuzbirPlayerInput } from '@/lib/101calculations'
import type { BankoluPlayerInput } from '@/lib/bankoluCalculations'
import type { SayiliFinishType } from '@/lib/gameTypes'

// Elin ham girişi. Anahtarlar puandaki adlarla aynıdır: eşli oyunda takım etiketi,
// bankolu eşlide oyuncu adı. Oyuncu adı değişirse sunucu "players" anahtarlarını da taşır.
export interface CezaliRoundDetails {
  kind: 'cezali'
  no_winner: boolean
  players: Record<string, { status: PlayerStatus; raw?: number; burn?: OkeyBurnType }>
}

export interface BankoluRoundDetails {
  kind: 'bankolu'
  players: Record<string, {
    banko: boolean
    winner: boolean
    burned: boolean
    fake_opener: boolean
    raw: number
  }>
}

export interface YuzbirRoundDetails {
  kind: '101'
  max_open?: number
  players: Record<string, {
    winner: boolean
    finish?: OkeyYuzbirFinishType
    opened: boolean
    tile_sum?: number
    wrong_open: boolean
    okey_in_hand: boolean
  }>
}

export interface SayiliRoundDetails {
  kind: 'sayili'
  indicator: boolean
  players: Record<string, { finish?: SayiliFinishType; drop: number }>
}

export type RoundDetails =
  | CezaliRoundDetails
  | BankoluRoundDetails
  | YuzbirRoundDetails
  | SayiliRoundDetails

export function buildCezaliDetails(
  noWinner: boolean,
  results: PlayerRoundInput[]
): CezaliRoundDetails {
  return {
    kind: 'cezali',
    no_winner: noWinner,
    players: Object.fromEntries(
      results.map((r) => [
        r.playerName,
        {
          status: r.status,
          ...(r.status === 'okey_burned' ? { burn: r.okeyBurnType } : {}),
          ...(r.status === 'loser' || r.status === 'no_winner' ? { raw: r.rawPoints ?? 0 } : {}),
        },
      ])
    ),
  }
}

export function buildBankoluDetails(players: BankoluPlayerInput[]): BankoluRoundDetails {
  return {
    kind: 'bankolu',
    players: Object.fromEntries(
      players.map((p) => [
        p.name,
        {
          banko: p.isBanko,
          winner: p.isWinner,
          burned: p.isOkeyBurned,
          fake_opener: p.isFakeOkeyOpener,
          raw: p.rawPoints,
        },
      ])
    ),
  }
}

export function build101Details(
  inputs: OkeyYuzbirPlayerInput[],
  maxOpen?: number
): YuzbirRoundDetails {
  return {
    kind: '101',
    ...(maxOpen !== undefined ? { max_open: maxOpen } : {}),
    players: Object.fromEntries(
      inputs.map((p) => [
        p.playerName,
        {
          winner: p.isWinner,
          ...(p.finishType ? { finish: p.finishType } : {}),
          opened: p.hasOpened,
          ...(p.tileSum !== undefined ? { tile_sum: p.tileSum } : {}),
          wrong_open: p.wrongOpen ?? false,
          okey_in_hand: p.okeyInHand ?? false,
        },
      ])
    ),
  }
}

export function buildSayiliDetails(
  entity: string,
  drop: number,
  finish: SayiliFinishType | null
): SayiliRoundDetails {
  return {
    kind: 'sayili',
    indicator: finish === null,
    players: { [entity]: { ...(finish ? { finish } : {}), drop } },
  }
}

// null: bu el için ham giriş yok, eski kayıt
export function getBurnFromDetails(
  details: RoundDetails | null | undefined,
  playerName: string
): boolean | null {
  if (!details) return null
  if (details.kind !== 'cezali' && details.kind !== 'bankolu') return false

  const lower = playerName.toLowerCase()
  if (details.kind === 'cezali') {
    const key = Object.keys(details.players).find((k) => k.toLowerCase() === lower)
    return key ? details.players[key].status === 'okey_burned' : false
  }
  const key = Object.keys(details.players).find((k) => k.toLowerCase() === lower)
  return key ? details.players[key].burned : false
}

export function renameDetailsKeys(
  details: RoundDetails | null | undefined,
  keyMap: Record<string, string>
): RoundDetails | null {
  if (!details) return null
  return {
    ...details,
    players: Object.fromEntries(
      Object.entries(details.players).map(([key, value]) => [keyMap[key] ?? key, value])
    ),
  } as RoundDetails
}
