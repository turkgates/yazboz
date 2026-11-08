import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ViewStore {
  hideTotals: boolean
  toggleTotals: () => void
}

// Toplamı masada göstermek istemeyenler için: telefona özeldir, tüm oyunlarda aynı kalır
export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      hideTotals: false,
      toggleTotals: () => set((s) => ({ hideTotals: !s.hideTotals })),
    }),
    {
      name: 'yazboz-view',
    }
  )
)
