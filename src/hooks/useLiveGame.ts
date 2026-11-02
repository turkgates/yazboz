import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchGameWithRounds, supabase } from '@/lib/supabase'
import { fetchLiveParticipants, type LiveParticipant } from '@/lib/liveTable'
import type { Game, Round } from '@/types'

const REFRESH_DEBOUNCE_MS = 250
// Anlık bağlantı koparsa skor yine de güncel kalsın
const FALLBACK_POLL_MS = 20000

export function useLiveGame(gameId: string) {
  const [game, setGame] = useState<Game | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [participants, setParticipants] = useState<LiveParticipant[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    const [{ game: g, rounds: r, error }, people] = await Promise.all([
      fetchGameWithRounds(gameId),
      fetchLiveParticipants(gameId),
    ])
    if (g) {
      setGame(g)
      setRounds(r)
      setParticipants(people)
      setUpdatedAt(new Date())
    } else if (error) {
      console.error('Masa yüklenemedi:', error)
    }
    setLoading(false)
  }, [gameId])

  useEffect(() => {
    refresh()

    const scheduleRefresh = () => {
      if (debounce.current) clearTimeout(debounce.current)
      debounce.current = setTimeout(refresh, REFRESH_DEBOUNCE_MS)
    }

    const channel = supabase
      .channel(`live-game-${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        scheduleRefresh
      )
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))

    const onForeground = () => {
      if (document.visibilityState === 'visible') scheduleRefresh()
    }
    document.addEventListener('visibilitychange', onForeground)
    window.addEventListener('online', scheduleRefresh)
    const poll = setInterval(onForeground, FALLBACK_POLL_MS)

    return () => {
      if (debounce.current) clearTimeout(debounce.current)
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onForeground)
      window.removeEventListener('online', scheduleRefresh)
      clearInterval(poll)
    }
  }, [gameId, refresh])

  return { game, rounds, participants, loading, connected, updatedAt, refresh }
}
