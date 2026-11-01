import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  fetchFinishedGamesOf,
  fetchMergeRequest,
  fetchUserProfile,
  getSupabaseErrorMessage,
  respondPlayerMerge,
} from '@/lib/socialSupabase'
import { dispatchPlayersRefresh } from '@/lib/friendUtils'
import { filterGamesWithPlayer } from '@/lib/statsUtils'
import { BackButton } from '@/components/layout/BackButton'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { PlayerStats } from '@/components/PlayerStats'
import type { Game, MergeRequest, Profile, Round } from '@/types'

export const Route = createFileRoute('/merge-request/$requestId')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: MergeRequestPage,
})

function MergeRequestPage() {
  const { requestId } = Route.useParams()
  const navigate = useNavigate()

  const [request, setRequest] = useState<MergeRequest | null>(null)
  const [requester, setRequester] = useState<Profile | null>(null)
  const [myName, setMyName] = useState('')
  const [games, setGames] = useState<Game[]>([])
  const [roundsByGame, setRoundsByGame] = useState<Record<string, Round[]>>({})
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState(false)
  const [error, setError] = useState('')
  const [mergedGames, setMergedGames] = useState<number | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      try {
        const { data: row } = await fetchMergeRequest(requestId)
        if (!row || row.target_id !== user.id || row.status !== 'pending') return

        const [requesterRes, meRes, owned] = await Promise.all([
          fetchUserProfile(row.requester_id),
          fetchUserProfile(user.id),
          fetchFinishedGamesOf(row.requester_id),
        ])
        setRequest(row)
        setRequester(requesterRes.data)
        setMyName(meRes.data?.display_name ?? '')
        setGames(owned.games)
        setRoundsByGame(owned.roundsByGame)
      } catch (err: unknown) {
        console.error('Birleştirme isteği yüklenemedi:', err)
        setError(getSupabaseErrorMessage(err, 'İstek yüklenemedi'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [requestId])

  const localName = request?.local_player_name ?? ''

  // Sunucu da aynı kuralla atlar: iki isim aynı masadaysa birleştirmek skorlardan birini ezerdi
  const { mergeableGames, conflictCount } = useMemo(() => {
    const matching = filterGamesWithPlayer(games, localName)
    const sameName = localName.toLowerCase() === myName.toLowerCase()
    const conflicts = sameName ? [] : filterGamesWithPlayer(matching, myName)
    const conflictIds = new Set(conflicts.map((g) => g.id))
    return {
      mergeableGames: matching.filter((g) => !conflictIds.has(g.id)),
      conflictCount: conflicts.length,
    }
  }, [games, localName, myName])

  const respond = async (accept: boolean) => {
    if (!request) return
    setResponding(true)
    setError('')
    try {
      const result = await respondPlayerMerge(request.id, accept)
      dispatchPlayersRefresh()
      if (accept) setMergedGames(result.merged_games ?? 0)
      else navigate({ to: '/friends', replace: true })
    } catch (err: unknown) {
      console.error('Birleştirme yanıtı hatası:', err)
      setError(getSupabaseErrorMessage(err, 'İşlem başarısız'))
      setResponding(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (mergedGames !== null) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-5xl">🔗</div>
        <p className="text-white font-semibold text-lg">Birleştirme tamamlandı</p>
        <p className="text-[#a0aec0] text-sm">
          {mergedGames} oyun istatistiklerine eklendi.
        </p>
        <Link
          to="/profile"
          search={{ tab: 'stats' }}
          className="mt-2 bg-[#e94560] text-white font-bold px-5 py-3 rounded-xl text-sm"
        >
          İstatistiklerime Git
        </Link>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white">{error || 'Bu istek artık geçerli değil'}</p>
        <Link to="/friends" className="text-[#e94560] font-semibold">
          Arkadaşlarıma Dön
        </Link>
      </div>
    )
  }

  const requesterName = requester?.display_name ?? requester?.username ?? 'Arkadaşın'

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col pb-28">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-3 max-w-lg mx-auto">
          <BackButton className="w-9 h-9 justify-center" />
          <h1 className="text-white font-bold">Birleştirme Onayı</h1>
          <div className="w-9" />
        </div>
      </div>

      <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full flex flex-col gap-4">
        <div className="bg-gradient-to-br from-[#0f3460] to-[#16213e] border border-[#2d3748] rounded-2xl p-4 flex items-center gap-3">
          <PlayerAvatar name={requesterName} avatarUrl={requester?.avatar_url} size={48} />
          <p className="text-white text-sm leading-snug min-w-0">
            <span className="font-semibold">{requesterName}</span>, kayıtlarındaki{' '}
            <span className="font-semibold">"{localName}"</span> oyuncusunun sen olduğunu söylüyor.
          </p>
        </div>

        <p className="text-[#a0aec0] text-sm">
          Aşağıda {requesterName} kayıtlarında bu oyuncunun istatistikleri var. Onaylarsan bu oyunlar senin istatistiklerine eklenir.
        </p>

        {conflictCount > 0 && (
          <p className="bg-[#f5a623]/10 border border-[#f5a623]/40 rounded-xl p-3 text-sm text-white">
            {conflictCount} oyunda iki isim de var, o oyunlar birleştirilmez ve aşağıda sayılmaz.
          </p>
        )}

        {mergeableGames.length > 0 ? (
          <PlayerStats
            playerName={localName}
            games={mergeableGames}
            roundsByGame={roundsByGame}
            showHistory
          />
        ) : (
          <p className="text-[#718096] text-sm text-center py-8">
            Bu oyuncunun tamamlanmış oyunu yok.
          </p>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-[#16213e] border-t border-[#2d3748] safe-bottom z-40">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-3">
          {error && <p className="text-red-400 text-sm text-center mb-2">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => respond(false)}
              disabled={responding}
              className="flex-1 h-12 bg-[#0f3460] disabled:opacity-50 text-[#a0aec0] font-semibold rounded-xl"
            >
              Reddet
            </button>
            <button
              type="button"
              onClick={() => respond(true)}
              disabled={responding}
              className="flex-[2] h-12 bg-green-600 disabled:opacity-50 text-white font-bold rounded-xl"
            >
              {responding ? '...' : 'Onayla ve Birleştir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
