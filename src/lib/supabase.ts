import { createClient } from '@supabase/supabase-js'
import type { Game, Round, Profile } from '@/types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const isValidUrl = (url: string) => {
  if (!url) return false
  try {
    new URL(url)
    return url.startsWith('http://') || url.startsWith('https://')
  } catch {
    return false
  }
}

const FALLBACK_URL = 'https://placeholder.supabase.co'
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.ZodTkPlaceholder'

if (!isValidUrl(supabaseUrl)) {
  console.warn('⚠️ Supabase URL eksik. .env.local dosyasına VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY ekleyin.')
}

export const supabase = createClient(
  isValidUrl(supabaseUrl) ? supabaseUrl : FALLBACK_URL,
  supabaseAnonKey || FALLBACK_KEY
)

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

export async function fetchProfile(userId: string) {
  return supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single<Profile>()
}
