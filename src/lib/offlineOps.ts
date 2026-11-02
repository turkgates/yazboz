import type { Game, Round } from '@/types'

export type NewGame = Omit<Game, 'created_at'>
export type NewRound = Omit<Round, 'created_at'>
export type GameUpdates = Partial<Omit<Game, 'id' | 'user_id' | 'created_at'>>
export type RoundUpdates = Partial<Omit<Round, 'id' | 'game_id' | 'created_at'>>

interface OpBase {
  id: string
  userId: string
  gameId: string
  createdAt: string
}

export type QueuedOp = OpBase & (
  | { type: 'game_upsert'; game: NewGame }
  | { type: 'game_update'; updates: GameUpdates }
  | { type: 'round_insert'; round: NewRound }
  | { type: 'round_update'; roundId: string; updates: RoundUpdates }
  | { type: 'round_delete'; roundId: string }
)

export interface GameSnapshot {
  game: Game
  rounds: Round[]
  savedAt: string
}

// Henüz sunucuya gitmemiş işlemleri okunan verinin üstüne uygular
export function applyPendingOps(
  game: Game | null,
  rounds: Round[],
  ops: QueuedOp[]
): { game: Game | null; rounds: Round[] } {
  let nextGame = game
  let nextRounds = rounds

  for (const op of ops) {
    switch (op.type) {
      case 'game_upsert':
        nextGame = { ...(nextGame ?? { created_at: op.createdAt }), ...op.game } as Game
        break
      case 'game_update':
        if (nextGame) nextGame = { ...nextGame, ...op.updates }
        break
      case 'round_insert':
        if (!nextRounds.some((r) => r.id === op.round.id)) {
          nextRounds = [...nextRounds, { created_at: op.createdAt, ...op.round }]
        }
        break
      case 'round_update':
        nextRounds = nextRounds.map((r) => (r.id === op.roundId ? { ...r, ...op.updates } : r))
        break
      case 'round_delete':
        nextRounds = nextRounds.filter((r) => r.id !== op.roundId)
        break
    }
  }

  return {
    game: nextGame,
    rounds: [...nextRounds].sort((a, b) => a.round_number - b.round_number),
  }
}

// Ağ hatası ve geçici sunucu hatası: işlem kuyrukta kalır. Yetki ve veri hataları kalıcıdır.
export function isRetryableFailure(status: number | undefined, message?: string): boolean {
  if (status === undefined || status === 0) return true
  if (status === 401 || status === 408 || status === 429 || status >= 500) return true
  return /failed to fetch|networkerror|load failed|aborterror/i.test(message ?? '')
}

export function mergeGamesWithLocal(
  fetched: Game[],
  snapshots: GameSnapshot[],
  ops: QueuedOp[],
  userId: string,
  status: Game['status']
): Game[] {
  const byId = new Map<string, Game>()
  for (const game of fetched) byId.set(game.id, game)

  // Sunucuya henüz gitmemiş oyunlar yalnızca yerel kopyada vardır
  const pendingGameIds = new Set(ops.map((op) => op.gameId))
  for (const snapshot of snapshots) {
    if (
      snapshot.game.user_id === userId &&
      (fetched.length === 0 || pendingGameIds.has(snapshot.game.id)) &&
      !byId.has(snapshot.game.id)
    ) {
      byId.set(snapshot.game.id, snapshot.game)
    }
  }

  const merged = [...byId.values()].map((game) => {
    const gameOps = ops.filter((op) => op.gameId === game.id)
    return gameOps.length > 0 ? applyPendingOps(game, [], gameOps).game! : game
  })

  const sortKey = (game: Game) =>
    new Date(status === 'finished' ? game.finished_at ?? game.created_at : game.created_at).getTime()

  return merged.filter((game) => game.status === status).sort((a, b) => sortKey(b) - sortKey(a))
}
