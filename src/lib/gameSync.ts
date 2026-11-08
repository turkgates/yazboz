import { v4 as uuidv4 } from 'uuid'
import { fetchGameWithRounds, readStoredUser, supabase, getLocalSession } from '@/lib/supabase'
import {
  applyPendingOps,
  isRetryableFailure,
  mergeGamesWithLocal,
  type GameUpdates,
  type NewGame,
  type NewRound,
  type QueuedOp,
  type RoundUpdates,
} from '@/lib/offlineOps'
import { useOfflineStore } from '@/stores/offlineStore'
import type { Game, Round } from '@/types'

const REQUEST_TIMEOUT_MS = 8000
// İnternet var görünüp çalışmıyorsa okumalar saniyelerce yeniden denenir: masada beklenmez
const READ_TIMEOUT_MS = 2500
const TIMED_OUT = Symbol('timed-out')
const DUPLICATE_KEY = '23505'
const NOT_FOUND = 'PGRST116'

interface SyncError {
  code?: string
  message: string
}

export interface SyncResult<T> {
  data: T | null
  error: SyncError | null
  queued: boolean
}

type ExecResult =
  | { kind: 'done'; data?: unknown }
  | { kind: 'retry' }
  | { kind: 'failed'; error: SyncError }

function withTimeout() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  return { signal: controller.signal, done: () => clearTimeout(timer) }
}

function classify(response: { data: unknown; error: unknown; status?: number }): ExecResult {
  const error = response.error as SyncError | null
  if (!error) return { kind: 'done', data: response.data }
  if (error.code === NOT_FOUND) return { kind: 'done' }
  if (isRetryableFailure(response.status, error.message)) return { kind: 'retry' }
  return { kind: 'failed', error }
}

async function executeOp(op: QueuedOp): Promise<ExecResult> {
  const { signal, done } = withTimeout()
  try {
    switch (op.type) {
      case 'game_upsert':
        return classify(
          await supabase
            .from('games')
            .upsert(op.game as Record<string, unknown>)
            .select()
            .abortSignal(signal)
            .single()
        )
      case 'game_update':
        return classify(
          await supabase
            .from('games')
            .update(op.updates as Record<string, unknown>)
            .eq('id', op.gameId)
            .select()
            .abortSignal(signal)
            .single()
        )
      case 'round_insert':
        return classify(
          await supabase
            .from('rounds')
            .insert(op.round as Record<string, unknown>)
            .select()
            .abortSignal(signal)
            .single()
        )
      case 'round_update':
        return classify(
          await supabase
            .from('rounds')
            .update(op.updates as Record<string, unknown>)
            .eq('id', op.roundId)
            .select()
            .abortSignal(signal)
            .single()
        )
      case 'round_delete':
        return classify(
          await supabase.from('rounds').delete().eq('id', op.roundId).abortSignal(signal)
        )
    }
  } catch {
    return { kind: 'retry' }
  } finally {
    done()
  }
}

function applyToSnapshot(op: QueuedOp) {
  const store = useOfflineStore.getState()
  const snapshot = store.snapshots[op.gameId]
  const { game, rounds } = applyPendingOps(snapshot?.game ?? null, snapshot?.rounds ?? [], [op])
  if (game) store.rememberGame(game, rounds)
}

function pendingOpsFor(userId: string) {
  return useOfflineStore.getState().ops.filter((op) => op.userId === userId)
}

async function runOrQueue<T>(op: QueuedOp, localResult: () => T): Promise<SyncResult<T>> {
  const store = useOfflineStore.getState()

  // Kuyrukta iş varken sıra bozulmasın: el numaraları ve bitiş sırası korunmalı
  if (navigator.onLine && pendingOpsFor(op.userId).length === 0) {
    const result = await executeOp(op)
    if (result.kind === 'done') {
      store.setNetworkDown(false)
      applyToSnapshot(op)
      return { data: (result.data as T) ?? localResult(), error: null, queued: false }
    }
    if (result.kind === 'failed') {
      return { data: null, error: result.error, queued: false }
    }
    store.setNetworkDown(true)
  }

  store.enqueue(op)
  applyToSnapshot(op)
  void flushQueue()
  return { data: localResult(), error: null, queued: true }
}

function makeOp<T extends Partial<QueuedOp>>(gameId: string, fields: T) {
  return {
    id: uuidv4(),
    userId: readStoredUser()?.id ?? '',
    gameId,
    createdAt: new Date().toISOString(),
    ...fields,
  } as unknown as QueuedOp
}

export function syncCreateGame(game: NewGame) {
  const op = makeOp(game.id, { type: 'game_upsert', game })
  return runOrQueue<Game>(op, () => ({ created_at: op.createdAt, ...game }))
}

export function syncUpdateGame(gameId: string, updates: GameUpdates) {
  const op = makeOp(gameId, { type: 'game_update', updates })
  return runOrQueue<Game>(op, () => {
    const snapshot = useOfflineStore.getState().snapshots[gameId]
    return { ...snapshot?.game, ...updates } as Game
  })
}

export function syncInsertRound(round: NewRound) {
  const op = makeOp(round.game_id, { type: 'round_insert', round })
  return runOrQueue<Round>(op, () => ({ created_at: op.createdAt, ...round }))
}

export function syncUpdateRound(gameId: string, roundId: string, updates: RoundUpdates) {
  const op = makeOp(gameId, { type: 'round_update', roundId, updates })
  return runOrQueue<Round>(op, () => {
    const snapshot = useOfflineStore.getState().snapshots[gameId]
    return { ...snapshot?.rounds.find((r) => r.id === roundId), ...updates } as Round
  })
}

export function syncDeleteRound(gameId: string, roundId: string) {
  const op = makeOp(gameId, { type: 'round_delete', roundId })
  return runOrQueue<null>(op, () => null)
}

// Silinen elden sonrakiler bir numara yukarı kayar, tabloda boşluk kalmaz.
// Küçükten büyüğe gidildiği için her numara bir önceki adımda boşalmış olur.
export async function deleteRoundAndRenumber(
  gameId: string,
  rounds: Round[],
  roundId: string
): Promise<{ rounds: Round[]; error: SyncError | null }> {
  const { error } = await syncDeleteRound(gameId, roundId)
  if (error) return { rounds, error }

  const remaining = rounds
    .filter((r) => r.id !== roundId)
    .sort((a, b) => a.round_number - b.round_number)

  const renumbered: Round[] = []
  for (const [index, round] of remaining.entries()) {
    const roundNumber = index + 1
    if (round.round_number !== roundNumber) {
      const { error: renumberError } = await syncUpdateRound(gameId, round.id, { round_number: roundNumber })
      if (renumberError) console.error('El numarası güncellenemedi:', renumberError)
    }
    renumbered.push({ ...round, round_number: roundNumber })
  }
  return { rounds: renumbered, error: null }
}

// Kuyruktaki el numarası başka kayıtla çakıştıysa veri kaybetmemek için sona eklenir
async function resolveDuplicateRound(op: Extract<QueuedOp, { type: 'round_insert' }>) {
  const { data: same } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', op.round.id)
    .maybeSingle()
  if (same) return true

  const { data: last } = await supabase
    .from('rounds')
    .select('round_number')
    .eq('game_id', op.gameId)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  useOfflineStore.getState().replaceOp({
    ...op,
    round: { ...op.round, round_number: (last?.round_number ?? 0) + 1 },
  })
  return false
}

let flushing: Promise<void> | null = null

export function flushQueue(): Promise<void> {
  if (flushing) return flushing
  flushing = runFlush().finally(() => {
    flushing = null
  })
  return flushing
}

// Bekleyen iş yokken de bağlantının döndüğü anlaşılmalı, yoksa uyarı ekranda kalır
async function probeNetwork() {
  const { signal, done } = withTimeout()
  try {
    const { status } = await supabase.from('games').select('id').limit(1).abortSignal(signal)
    if (status > 0) useOfflineStore.getState().setNetworkDown(false)
  } catch {
    // Bağlantı hâlâ yok
  } finally {
    done()
  }
}

async function runFlush() {
  const userId = readStoredUser()?.id
  if (!userId || !navigator.onLine) return

  const store = useOfflineStore.getState()
  if (pendingOpsFor(userId).length === 0) {
    if (store.networkDown) await probeNetwork()
    return
  }

  store.setSyncing(true)
  try {
    // Oturum yenilenemiyorsa istek anonim gider ve yetki hatası kalıcı sanılır
    const session = await getLocalSession()
    if (!session) return

    for (;;) {
      const op = pendingOpsFor(userId)[0]
      if (!op) {
        store.setNetworkDown(false)
        return
      }

      const result = await executeOp(op)

      if (result.kind === 'done') {
        store.removeOp(op.id)
        store.setNetworkDown(false)
        continue
      }

      if (result.kind === 'retry') {
        store.setNetworkDown(true)
        return
      }

      if (op.type === 'round_insert' && result.error.code === DUPLICATE_KEY) {
        if (await resolveDuplicateRound(op)) store.removeOp(op.id)
        continue
      }

      console.error('Kayıt gönderilemedi:', op.type, result.error)
      store.markFailed(op.id)
    }
  } finally {
    store.setSyncing(false)
  }
}

// Süre dolarsa null: çağıran telefondaki veriyle devam eder
export async function withReadTimeout<T>(promise: PromiseLike<T>): Promise<T | null> {
  const result = await Promise.race([
    promise,
    new Promise<typeof TIMED_OUT>((resolve) => setTimeout(() => resolve(TIMED_OUT), READ_TIMEOUT_MS)),
  ])
  return result === TIMED_OUT ? null : (result as T)
}

export function markNetworkDown(down: boolean) {
  useOfflineStore.getState().setNetworkDown(down)
}

export async function loadGameWithRounds(gameId: string) {
  const store = useOfflineStore.getState()
  const snapshot = store.snapshots[gameId]
  const ops = store.ops.filter((op) => op.gameId === gameId)

  if (!navigator.onLine) {
    const local = applyPendingOps(snapshot?.game ?? null, snapshot?.rounds ?? [], [])
    return { game: local.game, rounds: local.rounds, error: null }
  }

  // Telefonda kopyası varsa uzun süre beklemeye gerek yok
  const fetched = snapshot
    ? await withReadTimeout(fetchGameWithRounds(gameId))
    : await fetchGameWithRounds(gameId)

  if (fetched === null) {
    store.setNetworkDown(true)
    return { game: snapshot!.game, rounds: snapshot!.rounds, error: null }
  }

  const { game, rounds, error } = fetched
  if (!game) {
    if (/fetch|network|load failed/i.test(error?.message ?? '')) store.setNetworkDown(true)
    const local = applyPendingOps(snapshot?.game ?? null, snapshot?.rounds ?? [], [])
    return { game: local.game, rounds: local.rounds, error: local.game ? null : error }
  }

  store.setNetworkDown(false)
  const merged = applyPendingOps(game, rounds, ops)
  store.rememberGame(merged.game!, merged.rounds)
  return { game: merged.game, rounds: merged.rounds, error: null }
}

export function rememberLocalGame(game: Game, rounds: Round[]) {
  useOfflineStore.getState().rememberGame(game, rounds)
}

export function mergeLocalGames(userId: string, status: Game['status'], fetched: Game[]) {
  const { snapshots, ops } = useOfflineStore.getState()
  return mergeGamesWithLocal(fetched, Object.values(snapshots), ops, userId, status)
}
