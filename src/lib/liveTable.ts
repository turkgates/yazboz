import { supabase } from '@/lib/supabase'
import type { Game, Profile } from '@/types'

// Giriş yapmamış biri masa bağlantısını açarsa kod girişten sonra kullanılır
export const PENDING_TABLE_KEY = 'yazboz-pending-table'

export interface LiveParticipant {
  id: string
  game_id: string
  user_id: string
  player_name: string | null
  joined_at: string
  profile?: Pick<Profile, 'username' | 'display_name' | 'avatar_url'>
}

export async function openLiveTable(gameId: string): Promise<string> {
  const { data, error } = await supabase.rpc('open_live_table', { p_game_id: gameId })
  if (error) throw new Error(error.message)
  return data as string
}

export async function joinLiveTable(code: string) {
  const { data, error } = await supabase.rpc('join_live_table', { p_code: code })
  if (error) throw new Error(error.message)
  return data as { game_id: string; player_name?: string | null; is_owner?: boolean }
}

export async function claimLiveSeat(gameId: string, playerName: string | null) {
  const { error } = await supabase.rpc('claim_live_seat', {
    p_game_id: gameId,
    p_player_name: playerName,
  })
  if (error) throw new Error(error.message)
}

export async function fetchLiveParticipants(gameId: string): Promise<LiveParticipant[]> {
  const { data, error } = await supabase
    .from('game_participants')
    .select('id, game_id, user_id, player_name, joined_at')
    .eq('game_id', gameId)
    .order('joined_at')

  if (error) {
    console.error('Masadakiler yüklenemedi:', error)
    return []
  }

  const rows = (data ?? []) as LiveParticipant[]
  if (rows.length === 0) return rows

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', rows.map((r) => r.user_id))
  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

  return rows.map((r) => ({ ...r, profile: profileMap[r.user_id] }))
}

export async function removeLiveParticipant(participantId: string) {
  const { error } = await supabase.from('game_participants').delete().eq('id', participantId)
  if (error) throw new Error(error.message)
}

export async function fetchMyLiveTables(userId: string): Promise<Game[]> {
  const { data: rows } = await supabase
    .from('game_participants')
    .select('game_id')
    .eq('user_id', userId)

  const gameIds = (rows ?? []).map((r) => r.game_id)
  if (gameIds.length === 0) return []

  const { data: games } = await supabase
    .from('games')
    .select('*')
    .in('id', gameIds)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  return (games ?? []) as Game[]
}
