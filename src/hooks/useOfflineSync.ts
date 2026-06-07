import { useEffect, useRef } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { supabase, createGame, insertRound } from '@/lib/supabase'

export function useOfflineSync() {
  const { currentGame, rounds, pendingSync, setPendingSync } = useGameStore()
  const syncingRef = useRef(false)

  useEffect(() => {
    const handleOnline = () => {
      if (pendingSync && !syncingRef.current) {
        syncToSupabase()
      }
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [pendingSync, currentGame, rounds])

  const syncToSupabase = async () => {
    if (!currentGame || syncingRef.current) return
    syncingRef.current = true

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await createGame({
        id: currentGame.id,
        user_id: user.id,
        game_type: currentGame.game_type,
        status: currentGame.status,
        total_rounds: currentGame.total_rounds,
        players: currentGame.players,
        settings: currentGame.settings,
        finished_at: currentGame.finished_at ?? null,
      })

      for (const round of rounds) {
        const { error } = await insertRound({
          id: round.id,
          game_id: round.game_id,
          round_number: round.round_number,
          color: round.color,
          okey_thrown: round.okey_thrown,
          double_finish: round.double_finish,
          fake_okey: round.fake_okey ?? false,
          scores: round.scores,
        })
        if (error) throw error
      }

      setPendingSync(false)
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      syncingRef.current = false
    }
  }

  return { isOnline: navigator.onLine, pendingSync }
}
