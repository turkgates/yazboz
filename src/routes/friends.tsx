import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  fetchFriends,
  fetchPendingRequests,
  fetchSentRequests,
  fetchUserProfile,
  fetchVisibleFinishedGames,
  getSupabaseErrorMessage,
  respondToFriendRequest,
} from '@/lib/socialSupabase'
import {
  acceptFriendRequest,
  dispatchPlayersRefresh,
  type MergePromptTarget,
} from '@/lib/friendUtils'
import { markFriendRequestNotificationsRead } from '@/lib/notificationUtils'
import {
  computeComparisonStats,
  computeHeadToHead,
  filterGamesWithPlayer,
} from '@/lib/statsUtils'
import { AddFriendSheet } from '@/components/friends/AddFriendSheet'
import { MergeRequestModal } from '@/components/MergeRequestModal'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { BackButton } from '@/components/layout/BackButton'
import type { Friend, FriendRequest, Game, Profile, Round } from '@/types'

export const Route = createFileRoute('/friends')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: FriendsPage,
})

function FriendsPage() {
  const [userId, setUserId] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [friends, setFriends] = useState<Friend[]>([])
  const [pending, setPending] = useState<FriendRequest[]>([])
  const [sent, setSent] = useState<FriendRequest[]>([])
  const [games, setGames] = useState<Game[] | null>(null)
  const [roundsByGame, setRoundsByGame] = useState<Record<string, Round[]>>({})
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [mergeTarget, setMergeTarget] = useState<(MergePromptTarget & { requestId: string }) | null>(null)

  const loadFriends = async (uid: string) => {
    const [friendsRes, pendingRes, sentRes] = await Promise.all([
      fetchFriends(uid),
      fetchPendingRequests(uid),
      fetchSentRequests(uid),
    ])
    setFriends(friendsRes.data ?? [])
    setPending(pendingRes.data ?? [])
    setSent(sentRes.data ?? [])
    dispatchPlayersRefresh()
  }

  // Yeni arkadaşın oyunları ancak arkadaşlıktan sonra okunabilir
  const loadGames = async () => {
    try {
      const visible = await fetchVisibleFinishedGames()
      setGames(visible.games)
      setRoundsByGame(visible.roundsByGame)
    } catch (err: unknown) {
      console.error('Arkadaş istatistikleri yüklenemedi:', err)
      setGames([])
    }
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const [profileRes] = await Promise.all([fetchUserProfile(user.id), loadFriends(user.id)])
      setProfile(profileRes.data)
      setLoading(false)
      // Liste istatistikleri beklemesin
      loadGames()
    }
    load()
  }, [])

  const myName = profile?.display_name ?? ''

  const summaries = useMemo(() => {
    const map: Record<string, { played: number; winRate: number; myWins: number; friendWins: number; together: number }> = {}
    if (!games) return map
    for (const friend of friends) {
      const name = friend.friend_profile?.display_name
      if (!name) continue
      const stats = computeComparisonStats(name, filterGamesWithPlayer(games, name), roundsByGame)
      const h2h = computeHeadToHead(myName, name, games, roundsByGame)
      map[friend.friend_id] = {
        played: stats.games,
        winRate: stats.winRate,
        myWins: h2h.myWins,
        friendWins: h2h.friendWins,
        together: h2h.games.length,
      }
    }
    return map
  }, [friends, games, roundsByGame, myName])

  const sortedFriends = useMemo(() => {
    return [...friends].sort((a, b) => {
      const diff = (summaries[b.friend_id]?.together ?? 0) - (summaries[a.friend_id]?.together ?? 0)
      if (diff !== 0) return diff
      return (a.friend_profile?.display_name ?? '').localeCompare(b.friend_profile?.display_name ?? '', 'tr')
    })
  }, [friends, summaries])

  const handleRespond = async (req: FriendRequest, accept: boolean) => {
    setRespondingId(req.id)
    setError('')
    try {
      if (accept) {
        const target = await acceptFriendRequest(
          req.id,
          req.sender_id,
          req.sender_profile?.display_name ?? 'Arkadaş',
          req.sender_profile?.avatar_url ?? null
        )
        if (target) setMergeTarget({ ...target, requestId: req.id })
      } else {
        await respondToFriendRequest(req.id, false)
      }
      await markFriendRequestNotificationsRead(userId, req.sender_id)
      await loadFriends(userId)
      if (accept) await loadGames()
    } catch (err: unknown) {
      console.error('İstek yanıtlama hatası:', err)
      setError(getSupabaseErrorMessage(err, 'İşlem başarısız'))
    } finally {
      setRespondingId(null)
    }
  }

  const handleAddChanged = async () => {
    await loadFriends(userId)
    await loadGames()
  }

  const closeMerge = () => setMergeTarget(null)

  const friendIds = useMemo(() => new Set(friends.map((f) => f.friend_id)), [friends])
  const sentIds = useMemo(() => new Set(sent.map((r) => r.receiver_id)), [sent])
  const incomingIds = useMemo(() => new Set(pending.map((r) => r.sender_id)), [pending])

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col pb-24">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-3 max-w-lg mx-auto">
          <BackButton className="w-9 h-9 justify-center" />
          <h1 className="text-white font-bold">Arkadaşlarım</h1>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            aria-label="Arkadaş Ekle"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#e94560] text-white"
          >
            <UserPlus size={17} />
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full flex flex-col gap-5">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            {pending.length > 0 && (
              <section>
                <h2 className="text-[#f5a623] text-xs font-semibold uppercase tracking-wider mb-2">
                  Bekleyen İstekler ({pending.length})
                </h2>
                <div className="flex flex-col gap-2">
                  {pending.map((req) => (
                    <div
                      key={req.id}
                      className="bg-[#16213e] border border-[#f5a623]/30 rounded-xl p-3 flex items-center gap-3"
                    >
                      <PlayerAvatar
                        name={req.sender_profile?.display_name ?? '?'}
                        avatarUrl={req.sender_profile?.avatar_url}
                        size={40}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {req.sender_profile?.display_name}
                        </p>
                        <p className="text-[#718096] text-xs truncate">@{req.sender_profile?.username}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRespond(req, false)}
                        disabled={!!respondingId}
                        className="h-9 px-3 bg-[#0f3460] disabled:opacity-50 rounded-lg text-xs text-[#a0aec0] font-semibold"
                      >
                        Reddet
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRespond(req, true)}
                        disabled={!!respondingId}
                        className="h-9 px-3 bg-green-600 disabled:opacity-50 rounded-lg text-xs text-white font-bold"
                      >
                        Kabul Et
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {friends.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-3 py-10 text-center"
              >
                <div className="text-5xl">🤝</div>
                <p className="text-white font-semibold">Henüz arkadaşın yok</p>
                <p className="text-[#718096] text-sm max-w-64">
                  Arkadaşlarını ekle, oyunlarınızı ve istatistiklerinizi karşılaştır.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  className="mt-1 bg-[#e94560] text-white font-bold px-5 py-3 rounded-xl text-sm"
                >
                  Arkadaş Ekle
                </button>
              </motion.div>
            ) : (
              <section>
                <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">
                  Arkadaşlar ({friends.length})
                </h2>
                <div className="flex flex-col gap-2">
                  {sortedFriends.map((friend, i) => {
                    const summary = summaries[friend.friend_id]
                    return (
                      <motion.div
                        key={friend.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                      >
                        <Link
                          to="/friend/$friendId"
                          params={{ friendId: friend.friend_id }}
                          className="bg-[#16213e] border border-[#2d3748] hover:border-[#e94560]/40 rounded-xl p-3 flex items-center gap-3 transition-colors"
                        >
                          <PlayerAvatar
                            name={friend.friend_profile?.display_name ?? '?'}
                            avatarUrl={friend.friend_profile?.avatar_url}
                            size={44}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate">
                              {friend.friend_profile?.display_name ?? 'İsimsiz'}
                            </p>
                            <p className="text-[#718096] text-xs truncate">
                              {!games
                                ? `@${friend.friend_profile?.username ?? ''}`
                                : summary?.played
                                  ? `${summary.played} oyun · %${summary.winRate} kazanma`
                                  : 'Henüz oyun yok'}
                            </p>
                          </div>
                          {!!summary?.together && (
                            <HeadToHeadPill myWins={summary.myWins} friendWins={summary.friendWins} />
                          )}
                          <ChevronRight size={16} className="text-[#718096] shrink-0" />
                        </Link>
                      </motion.div>
                    )
                  })}
                </div>
              </section>
            )}

            {sent.length > 0 && (
              <section>
                <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">
                  Gönderilen İstekler ({sent.length})
                </h2>
                <div className="flex flex-col gap-2">
                  {sent.map((req) => (
                    <div
                      key={req.id}
                      className="bg-[#16213e] border border-[#2d3748] rounded-xl p-3 flex items-center gap-3 opacity-70"
                    >
                      <PlayerAvatar
                        name={req.receiver_profile?.display_name ?? '?'}
                        avatarUrl={req.receiver_profile?.avatar_url}
                        size={36}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{req.receiver_profile?.display_name}</p>
                        <p className="text-[#718096] text-xs">Yanıt bekleniyor</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <Link
              to="/players"
              className="bg-[#16213e] border border-[#2d3748] rounded-xl p-3 flex items-center gap-3"
            >
              <span className="w-10 h-10 rounded-full bg-[#0f3460] flex items-center justify-center text-lg shrink-0">👤</span>
              <span className="flex-1 min-w-0">
                <span className="block text-white text-sm font-medium">Kayıtlı oyuncular</span>
                <span className="block text-[#718096] text-xs truncate">Uygulamayı kullanmayan oyuncular</span>
              </span>
              <ChevronRight size={16} className="text-[#718096] shrink-0" />
            </Link>
          </>
        )}
      </div>

      <AnimatePresence>
        {showAdd && (
          <AddFriendSheet
            userId={userId}
            username={profile?.username ?? null}
            friendIds={friendIds}
            sentIds={sentIds}
            incomingIds={incomingIds}
            onClose={() => setShowAdd(false)}
            onChanged={handleAddChanged}
          />
        )}
      </AnimatePresence>

      {mergeTarget && (
        <MergeRequestModal
          friendUserId={mergeTarget.userId}
          friendName={mergeTarget.name}
          friendAvatarUrl={mergeTarget.avatarUrl}
          friendRequestId={mergeTarget.requestId}
          onComplete={closeMerge}
          onSkip={closeMerge}
        />
      )}
    </div>
  )
}

function HeadToHeadPill({ myWins, friendWins }: { myWins: number; friendWins: number }) {
  const tone =
    myWins > friendWins
      ? 'bg-green-500/15 text-green-400'
      : myWins < friendWins
        ? 'bg-red-500/15 text-red-400'
        : 'bg-[#0f3460] text-[#a0aec0]'

  return (
    <span
      title="Birlikte oynadığınız oyunlarda sen - o"
      className={`shrink-0 px-2 h-7 rounded-lg flex items-center text-sm font-bold tabular-nums ${tone}`}
    >
      {myWins}–{friendWins}
    </span>
  )
}
