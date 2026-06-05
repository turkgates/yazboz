import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Game, Round, RoundInput, GameSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import { calculateAllScores, calculateTotals, getLeader } from '@/lib/calculations'

interface GameStore {
  currentGame: Game | null
  rounds: Round[]
  pendingSync: boolean

  startGame: (game: Game) => void
  addRound: (roundId: string, roundNumber: number, input: RoundInput) => void
  finishGame: () => void
  loadGame: (game: Game, rounds: Round[]) => void
  clearGame: () => void
  setPendingSync: (pending: boolean) => void

  getTotals: () => Record<string, number>
  getCurrentRoundNumber: () => number
  getLeader: () => string | null
  isGameFinished: () => boolean
}

interface SettingsStore {
  settings: GameSettings
  updateSettings: (updates: Partial<GameSettings>) => void
  resetSettings: () => void
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      currentGame: null,
      rounds: [],
      pendingSync: false,

      startGame: (game) => set({ currentGame: game, rounds: [], pendingSync: false }),

      addRound: (roundId, roundNumber, input) => {
        const state = get()
        if (!state.currentGame) return

        const scores = calculateAllScores(
          input.playerResults,
          input.color,
          input.okeyThrown,
          input.doubleFinish,
          state.currentGame.settings
        )

        const round: Round = {
          id: roundId,
          game_id: state.currentGame.id,
          round_number: roundNumber,
          color: input.color,
          okey_thrown: input.okeyThrown,
          double_finish: input.doubleFinish,
          scores,
          created_at: new Date().toISOString(),
        }

        set((s) => ({ rounds: [...s.rounds, round] }))
      },

      finishGame: () =>
        set((s) => ({
          currentGame: s.currentGame
            ? { ...s.currentGame, status: 'finished', finished_at: new Date().toISOString() }
            : null,
        })),

      loadGame: (game, rounds) => set({ currentGame: game, rounds }),

      clearGame: () => set({ currentGame: null, rounds: [], pendingSync: false }),

      setPendingSync: (pending) => set({ pendingSync: pending }),

      getTotals: () => {
        const { currentGame, rounds } = get()
        if (!currentGame) return {}
        return calculateTotals(
          currentGame.players,
          rounds.map((r) => r.scores)
        )
      },

      getCurrentRoundNumber: () => {
        const { rounds } = get()
        return rounds.length + 1
      },

      getLeader: () => {
        const totals = get().getTotals()
        return getLeader(totals)
      },

      isGameFinished: () => {
        const { currentGame, rounds } = get()
        if (!currentGame) return false
        return rounds.length >= currentGame.total_rounds || currentGame.status === 'finished'
      },
    }),
    {
      name: 'yazboz-current-game',
      partialize: (state) => ({
        currentGame: state.currentGame,
        rounds: state.rounds,
        pendingSync: state.pendingSync,
      }),
    }
  )
)

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,

      updateSettings: (updates) =>
        set((s) => ({ settings: { ...s.settings, ...updates } })),

      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'yazboz-settings',
    }
  )
)
