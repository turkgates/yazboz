import { createClient } from '@supabase/supabase-js'
import type { Game, Round, Profile, SavedPlayer } from '@/types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY .env.local dosyasında tanımlı olmalı')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function resetPassword(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
}

export async function fetchActiveGames(userId: string) {
  return supabase
    .from('games')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .returns<Game[]>()
}

export async function fetchFinishedGames(userId: string) {
  return supabase
    .from('games')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'finished')
    .order('finished_at', { ascending: false })
    .limit(20)
    .returns<Game[]>()
}

export async function fetchGameWithRounds(gameId: string) {
  const [gameResult, roundsResult] = await Promise.all([
    supabase.from('games').select('*').eq('id', gameId).single<Game>(),
    supabase.from('rounds').select('*').eq('game_id', gameId).order('round_number').returns<Round[]>(),
  ])
  return {
    game: gameResult.data,
    rounds: roundsResult.data ?? [],
    error: gameResult.error || roundsResult.error,
  }
}

export async function createGame(gameData: Omit<Game, 'created_at'>) {
  return supabase
    .from('games')
    .upsert(gameData as Record<string, unknown>)
    .select()
    .single<Game>()
}

export async function updateGame(gameId: string, updates: Partial<Omit<Game, 'id' | 'user_id' | 'created_at'>>) {
  return supabase
    .from('games')
    .update(updates as Record<string, unknown>)
    .eq('id', gameId)
    .select()
    .single<Game>()
}

export async function insertRound(roundData: Omit<Round, 'created_at'>) {
  return supabase
    .from('rounds')
    .upsert(roundData as Record<string, unknown>)
    .select()
    .single<Round>()
}

export async function updateRound(roundId: string, updates: Partial<Omit<Round, 'id' | 'game_id' | 'created_at'>>) {
  return supabase
    .from('rounds')
    .update(updates as Record<string, unknown>)
    .eq('id', roundId)
    .select()
    .single<Round>()
}

export async function deleteRound(roundId: string) {
  return supabase.from('rounds').delete().eq('id', roundId)
}

export async function fetchProfile(userId: string) {
  return supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single<Profile>()
}

export async function fetchPlayers(userId: string) {
  return supabase
    .from('players')
    .select('*')
    .eq('user_id', userId)
    .order('name')
    .returns<SavedPlayer[]>()
}

export async function searchPlayersByName(userId: string, query: string, limit = 5) {
  if (!query.trim()) return { data: [] as SavedPlayer[], error: null }
  return supabase
    .from('players')
    .select('id, name, avatar_url')
    .eq('user_id', userId)
    .ilike('name', `${query}%`)
    .limit(limit)
    .returns<Pick<SavedPlayer, 'id' | 'name' | 'avatar_url'>[]>()
}

export async function createPlayer(player: Omit<SavedPlayer, 'created_at'>) {
  return supabase
    .from('players')
    .insert(player as Record<string, unknown>)
    .select()
    .single<SavedPlayer>()
}

export async function updatePlayer(playerId: string, updates: Partial<Pick<SavedPlayer, 'name' | 'avatar_url'>>) {
  return supabase
    .from('players')
    .update(updates as Record<string, unknown>)
    .eq('id', playerId)
    .select()
    .single<SavedPlayer>()
}

export async function deletePlayer(playerId: string) {
  return supabase.from('players').delete().eq('id', playerId)
}

export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const filePath = `${userId}/${Date.now()}.${ext}`

  const { data: buckets } = await supabase.storage.listBuckets()
  const avatarBucket = buckets?.find((b) => b.name === 'avatars')

  if (!avatarBucket) {
    await supabase.storage.createBucket('avatars', { public: true })
  }

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true })

  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
  return data.publicUrl
}

export async function fetchPlayerIdByName(userId: string, playerName: string) {
  return supabase
    .from('players')
    .select('id')
    .eq('user_id', userId)
    .eq('name', playerName)
    .maybeSingle<{ id: string }>()
}

export async function fetchPlayerById(playerId: string) {
  return supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single<SavedPlayer>()
}

export async function fetchPlayerGamesWithRounds(userId: string, playerName: string) {
  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select('*')
    .eq('user_id', userId)
    .contains('players', [playerName])
    .order('created_at', { ascending: false })
    .returns<Game[]>()

  if (gamesError || !games?.length) {
    return { games: games ?? [], roundsByGame: {} as Record<string, Round[]>, error: gamesError }
  }

  const gameIds = games.map((g) => g.id)
  const { data: rounds, error: roundsError } = await supabase
    .from('rounds')
    .select('*')
    .in('game_id', gameIds)
    .order('round_number')
    .returns<Round[]>()

  const roundsByGame: Record<string, Round[]> = {}
  for (const round of rounds ?? []) {
    if (!roundsByGame[round.game_id]) roundsByGame[round.game_id] = []
    roundsByGame[round.game_id].push(round)
  }

  return { games, roundsByGame, error: roundsError }
}
