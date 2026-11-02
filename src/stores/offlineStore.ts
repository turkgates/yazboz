import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Game, Round } from '@/types'
import type { GameSnapshot, QueuedOp } from '@/lib/offlineOps'

const MAX_SNAPSHOTS = 12

interface OfflineStore {
  ops: QueuedOp[]
  failed: QueuedOp[]
  snapshots: Record<string, GameSnapshot>
  syncing: boolean
  networkDown: boolean

  enqueue: (op: QueuedOp) => void
  removeOp: (opId: string) => void
  replaceOp: (op: QueuedOp) => void
  markFailed: (opId: string) => void
  retryFailed: (userId: string) => void
  discardFailed: (userId: string) => void
  rememberGame: (game: Game, rounds: Round[]) => void
  setSyncing: (syncing: boolean) => void
  setNetworkDown: (down: boolean) => void
}

export const useOfflineStore = create<OfflineStore>()(
  persist(
    (set) => ({
      ops: [],
      failed: [],
      snapshots: {},
      syncing: false,
      networkDown: false,

      enqueue: (op) => set((s) => ({ ops: [...s.ops, op] })),

      removeOp: (opId) => set((s) => ({ ops: s.ops.filter((op) => op.id !== opId) })),

      replaceOp: (op) =>
        set((s) => ({ ops: s.ops.map((existing) => (existing.id === op.id ? op : existing)) })),

      markFailed: (opId) =>
        set((s) => ({
          ops: s.ops.filter((op) => op.id !== opId),
          failed: [...s.failed, ...s.ops.filter((op) => op.id === opId)],
        })),

      retryFailed: (userId) =>
        set((s) => ({
          ops: [...s.failed.filter((op) => op.userId === userId), ...s.ops],
          failed: s.failed.filter((op) => op.userId !== userId),
        })),

      discardFailed: (userId) =>
        set((s) => ({ failed: s.failed.filter((op) => op.userId !== userId) })),

      rememberGame: (game, rounds) =>
        set((s) => {
          const snapshots = {
            ...s.snapshots,
            [game.id]: { game, rounds, savedAt: new Date().toISOString() },
          }
          // Telefonun alanı sınırlı: gönderilmemiş işlemi olmayan eski oyunlar atılır
          const pending = new Set(s.ops.map((op) => op.gameId))
          const removable = Object.values(snapshots)
            .filter((snapshot) => !pending.has(snapshot.game.id))
            .sort((a, b) => a.savedAt.localeCompare(b.savedAt))
          let extra = Object.keys(snapshots).length - MAX_SNAPSHOTS
          for (const snapshot of removable) {
            if (extra <= 0) break
            delete snapshots[snapshot.game.id]
            extra--
          }
          return { snapshots }
        }),

      setSyncing: (syncing) => set({ syncing }),
      setNetworkDown: (networkDown) => set({ networkDown }),
    }),
    {
      name: 'yazboz-offline',
      partialize: (state) => ({
        ops: state.ops,
        failed: state.failed,
        snapshots: state.snapshots,
      }),
    }
  )
)
