import { createFileRoute, useNavigate, redirect, Link } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { fetchGamesPaginated, signOut, getSessionUser, getLocalSession } from '@/lib/supabase'
import {
  countPendingMergeApprovals,
  countPendingRequests,
  fetchFriends,
  fetchMyGroupSummaries,
  fetchUserProfile,
  PENDING_INVITE_KEY,
  type GroupSummary,
} from '@/lib/socialSupabase'
import type { Friend, Game } from '@/types'
import { Plus, LogOut, ChevronRight, Trophy, Clock, Dices, Radio, UserPlus, Users } from 'lucide-react'
import { fetchMyLiveTables, PENDING_TABLE_KEY } from '@/lib/liveTable'
import { markNetworkDown, mergeLocalGames, withReadTimeout } from '@/lib/gameSync'
import { formatDistanceToNow } from '@/lib/dateUtils'
import { GameResultModal } from '@/components/GameResultModal'
import { getGameTypeLabel } from '@/lib/gameTypes'
import { NotificationBell } from '@/components/NotificationBell'
import { PlayerAvatar } from '@/components/PlayerAvatar'

const PAGE_SIZE = 5
const HOME_GROUP_LIMIT = 3
const HOME_AVATAR_LIMIT = 4
const DISPLAY_NAME_KEY = 'yazboz-display-name'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Günaydın'
  if (hour >= 12 && hour < 17) return 'İyi günler'
  if (hour >= 17 && hour < 22) return 'İyi akşamlar'
  return 'İyi geceler'
}

export const Route = createFileRoute('/home')({
  beforeLoad: async () => {
    const session = await getLocalSession()
    if (!session) {
      throw redirect({ to: '/auth' })
    }
  },
  component: HomePage,
})

function HomePage() {
  const navigate = useNavigate()
  const [activeGames, setActiveGames] = useState<Game[]>([])
  const [finishedGames, setFinishedGames] = useState<Game[]>([])
  const [activeOffset, setActiveOffset] = useState(0)
  const [finishedOffset, setFinishedOffset] = useState(0)
  const [hasMoreActive, setHasMoreActive] = useState(false)
  const [hasMoreFinished, setHasMoreFinished] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMoreActive, setLoadingMoreActive] = useState(false)
  const [loadingMoreFinished, setLoadingMoreFinished] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [pendingRequests, setPendingRequests] = useState(0)
  const [pendingMerges, setPendingMerges] = useState(0)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [liveTables, setLiveTables] = useState<Game[]>([])

  useEffect(() => {
    const inviteCode = sessionStorage.getItem(PENDING_INVITE_KEY)
    if (inviteCode) {
      sessionStorage.removeItem(PENDING_INVITE_KEY)
      navigate({ to: '/join-group', search: { code: inviteCode }, replace: true })
      return
    }
    const tableCode = sessionStorage.getItem(PENDING_TABLE_KEY)
    if (tableCode) {
      sessionStorage.removeItem(PENDING_TABLE_KEY)
      navigate({ to: '/join-table', search: { code: tableCode }, replace: true })
      return
    }
    loadData()

    const reload = () => loadData()
    window.addEventListener('online', reload)
    return () => window.removeEventListener('online', reload)
  }, [])

  const loadData = async () => {
    const { data: { user } } = await getSessionUser()
    if (!user) return
    setUserId(user.id)

    const showLocal = () => {
      setOffline(true)
      setDisplayName(localStorage.getItem(DISPLAY_NAME_KEY) ?? user.email?.split('@')[0] ?? '')
      setActiveGames(mergeLocalGames(user.id, 'active', []))
      setFinishedGames(mergeLocalGames(user.id, 'finished', []))
      setHasMoreActive(false)
      setHasMoreFinished(false)
      setLoading(false)
    }

    // İnternet yokken yalnızca telefonda duran oyunlar gösterilir
    if (!navigator.onLine) {
      showLocal()
      return
    }

    const gamesResult = await withReadTimeout(
      Promise.all([
        fetchUserProfile(user.id),
        fetchGamesPaginated(user.id, 'active', 0, PAGE_SIZE),
        fetchGamesPaginated(user.id, 'finished', 0, PAGE_SIZE),
      ])
    )

    if (!gamesResult || gamesResult[1].status === 0) {
      markNetworkDown(true)
      showLocal()
      return
    }

    markNetworkDown(false)
    setOffline(false)

    const [profileRes, activeRes, finishedRes] = gamesResult
    const name = profileRes.data?.display_name ?? user.email?.split('@')[0] ?? ''
    setDisplayName(name)
    if (profileRes.data?.display_name) localStorage.setItem(DISPLAY_NAME_KEY, name)

    const [groupList, friendsRes, pendingCount, mergeCount, tables] = await Promise.all([
      fetchMyGroupSummaries(user.id),
      fetchFriends(user.id),
      countPendingRequests(user.id),
      countPendingMergeApprovals(user.id),
      fetchMyLiveTables(user.id),
    ])

    const active = mergeLocalGames(user.id, 'active', activeRes.data ?? [])
    const finished = mergeLocalGames(user.id, 'finished', finishedRes.data ?? [])

    setLiveTables(tables)
    setGroups(groupList)
    setFriends(friendsRes.data ?? [])
    setPendingRequests(pendingCount)
    setPendingMerges(mergeCount)
    setActiveGames(active)
    setFinishedGames(finished)
    setActiveOffset(PAGE_SIZE)
    setFinishedOffset(PAGE_SIZE)
    setHasMoreActive((activeRes.data ?? []).length === PAGE_SIZE)
    setHasMoreFinished((finishedRes.data ?? []).length === PAGE_SIZE)
    setLoading(false)
  }

  const loadMoreActive = async () => {
    if (!userId || loadingMoreActive) return
    setLoadingMoreActive(true)
    const { data } = await fetchGamesPaginated(userId, 'active', activeOffset, PAGE_SIZE)
    const batch = data ?? []
    setActiveGames((prev) => [...prev, ...batch])
    setActiveOffset((prev) => prev + PAGE_SIZE)
    setHasMoreActive(batch.length === PAGE_SIZE)
    setLoadingMoreActive(false)
  }

  const loadMoreFinished = async () => {
    if (!userId || loadingMoreFinished) return
    setLoadingMoreFinished(true)
    const { data } = await fetchGamesPaginated(userId, 'finished', finishedOffset, PAGE_SIZE)
    const batch = data ?? []
    setFinishedGames((prev) => [...prev, ...batch])
    setFinishedOffset((prev) => prev + PAGE_SIZE)
    setHasMoreFinished(batch.length === PAGE_SIZE)
    setLoadingMoreFinished(false)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate({ to: '/auth' })
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-3 max-w-lg mx-auto">
          <h1 className="text-xl font-bold text-white">Okey Yazboz</h1>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <span className="text-sm text-gray-300 hidden sm:inline">
              {getGreeting()}, {displayName}
            </span>
            <button
              onClick={handleSignOut}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-gray-400 hover:text-white transition-colors"
              title="Çıkış Yap"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
        {displayName && (
          <p className="text-sm text-[#718096] pb-3 max-w-lg mx-auto sm:hidden">
            {getGreeting()}, {displayName}
          </p>
        )}
      </div>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full pb-20">
        <div className="grid grid-cols-3 gap-2 mb-6">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate({ to: '/new-game' })}
            className="col-span-3 mb-1 bg-[#e94560] hover:bg-[#c73652] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 text-lg shadow-lg shadow-[#e94560]/20 transition-colors"
          >
            <Plus size={24} />
            Yeni Oyun Başlat
          </motion.button>

          <Link
            to="/join-table"
            className="bg-[#16213e] border border-[#2d3748] hover:border-[#e94560]/40 rounded-2xl h-[72px] flex flex-col items-center justify-center gap-1 transition-colors"
          >
            <Radio size={20} className="text-green-400" />
            <span className="text-white text-xs font-semibold">Masaya Katıl</span>
          </Link>

          <Link
            to="/tracker"
            className="bg-[#16213e] border border-[#2d3748] hover:border-[#e94560]/40 rounded-2xl h-[72px] flex flex-col items-center justify-center gap-1 transition-colors"
          >
            <span className="text-lg leading-5">🀄</span>
            <span className="text-white text-xs font-semibold">Oyun Takip</span>
          </Link>

          <Link
            to="/dice"
            className="bg-[#16213e] border border-[#2d3748] hover:border-[#e94560]/40 rounded-2xl h-[72px] flex flex-col items-center justify-center gap-1 transition-colors"
          >
            <Dices size={20} className="text-[#e94560]" />
            <span className="text-white text-xs font-semibold">Zar At</span>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {pendingRequests + pendingMerges > 0 && (
              <Link
                to="/friends"
                className="mb-6 bg-[#f5a623]/10 border border-[#f5a623]/40 rounded-xl p-3 flex items-center gap-3"
              >
                <UserPlus size={18} className="text-[#f5a623] shrink-0" />
                <span className="flex-1 min-w-0 text-white text-sm font-medium">
                  {[
                    pendingRequests > 0 && `${pendingRequests} arkadaşlık isteği`,
                    pendingMerges > 0 && `${pendingMerges} birleştirme onayı`,
                  ].filter(Boolean).join(', ')} bekliyor
                </span>
                <ChevronRight size={16} className="text-[#f5a623] shrink-0" />
              </Link>
            )}

            {!offline && liveTables.length > 0 && (
              <section className="mb-6">
                <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Radio size={14} />
                  Katıldığın Masalar
                </h2>
                <div className="flex flex-col gap-2">
                  {liveTables.map((game) => (
                    <Link
                      key={game.id}
                      to="/live/$gameId"
                      params={{ gameId: game.id }}
                      className="bg-[#16213e] border border-green-500/40 rounded-xl p-4 flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-white text-sm font-medium truncate">{game.players.join(', ')}</span>
                        <span className="block text-[#718096] text-xs">Canlı izle</span>
                      </span>
                      <ChevronRight size={16} className="text-[#718096] shrink-0" />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {activeGames.length > 0 && (
              <section className="mb-6">
                <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Clock size={14} />
                  Devam Eden Oyunlar ({activeGames.length})
                </h2>
                <div className="flex flex-col gap-2">
                  {activeGames.map((game, i) => (
                    <motion.div
                      key={game.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <GameCard game={game} isActive />
                    </motion.div>
                  ))}
                </div>
                {hasMoreActive && (
                  <button
                    type="button"
                    onClick={loadMoreActive}
                    disabled={loadingMoreActive}
                    className="w-full mt-3 py-3 text-[#a0aec0] hover:text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {loadingMoreActive ? 'Yükleniyor...' : 'Daha Eski →'}
                  </button>
                )}
              </section>
            )}

            {!offline && (
              <>
                <GroupsSection groups={groups} />
                <FriendsSection friends={friends} />
              </>
            )}

            {finishedGames.length > 0 && (
              <section>
                <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Trophy size={14} />
                  Tamamlanan Oyunlar ({finishedGames.length})
                </h2>
                <div className="flex flex-col gap-2">
                  {finishedGames.map((game, i) => (
                    <motion.div
                      key={game.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <GameCard game={game} onFinishedClick={setSelectedGameId} />
                    </motion.div>
                  ))}
                </div>
                {hasMoreFinished && (
                  <button
                    type="button"
                    onClick={loadMoreFinished}
                    disabled={loadingMoreFinished}
                    className="w-full mt-3 py-3 text-[#a0aec0] hover:text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {loadingMoreFinished ? 'Yükleniyor...' : 'Daha Eski →'}
                  </button>
                )}
              </section>
            )}

            {activeGames.length === 0 && finishedGames.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="text-6xl mb-4">🃏</div>
                <p className="text-white font-medium mb-2">Henüz oyun yok</p>
                <p className="text-[#718096] text-sm">Yukarıdaki butona basarak ilk oyununuzu başlatın!</p>
              </div>
            )}
          </>
        )}
      </div>

      <GameResultModal
        gameId={selectedGameId ?? ''}
        isOpen={!!selectedGameId}
        onClose={() => setSelectedGameId(null)}
        onViewScoreboard={(gameId) => {
          setSelectedGameId(null)
          navigate({ to: '/game/$gameId', params: { gameId } })
        }}
      />
    </div>
  )
}

function SectionHeader({
  icon,
  title,
  linkTo,
}: {
  icon: ReactNode
  title: string
  linkTo: '/groups' | '/friends'
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <Link to={linkTo} className="text-[#e94560] text-xs font-semibold">
        Tümü
      </Link>
    </div>
  )
}

function GroupsSection({ groups }: { groups: GroupSummary[] }) {
  if (groups.length === 0) {
    return (
      <section className="mb-6 bg-gradient-to-br from-[#e94560]/15 to-[#0f3460]/40 border border-[#2d3748] rounded-2xl p-4">
        <p className="text-white font-semibold">Masanı grup yap</p>
        <p className="text-[#a0aec0] text-sm mt-0.5">
          Birlikte oynadığın oyunlar ve kazanma sıralaması tek yerde toplansın.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Link
            to="/groups"
            search={{ create: true }}
            className="h-10 rounded-xl bg-[#e94560] text-white text-sm font-bold flex items-center justify-center"
          >
            Grup Kur
          </Link>
          <Link
            to="/join-group"
            className="h-10 rounded-xl bg-[#0f3460] text-white text-sm font-semibold flex items-center justify-center"
          >
            Koda Katıl
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="mb-6">
      <SectionHeader icon={<Users size={14} />} title={`Gruplarım (${groups.length})`} linkTo="/groups" />
      <div className="flex flex-col gap-2">
        {groups.slice(0, HOME_GROUP_LIMIT).map((group) => (
          <Link
            key={group.id}
            to="/group/$groupId"
            params={{ groupId: group.id }}
            className="bg-[#16213e] border border-[#2d3748] hover:border-[#e94560]/40 rounded-xl p-3 flex items-center gap-3 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold truncate">{group.name}</p>
              <p className="text-[#718096] text-xs mt-0.5">
                {group.members.length} üye · {group.gamesCount} oyun
              </p>
            </div>
            <div className="flex shrink-0">
              {group.members.slice(0, HOME_AVATAR_LIMIT).map((member, i) => (
                <PlayerAvatar
                  key={member.user_id}
                  name={member.name}
                  avatarUrl={member.avatar_url}
                  size={30}
                  className={i > 0 ? '-ml-2' : ''}
                />
              ))}
            </div>
            <ChevronRight size={16} className="text-[#718096] shrink-0" />
          </Link>
        ))}
      </div>
    </section>
  )
}

function FriendsSection({ friends }: { friends: Friend[] }) {
  if (friends.length === 0) {
    return (
      <Link
        to="/friends"
        className="mb-6 bg-[#16213e] border border-[#2d3748] rounded-xl p-3 flex items-center gap-3"
      >
        <span className="w-10 h-10 rounded-full bg-[#0f3460] flex items-center justify-center shrink-0">
          <UserPlus size={18} className="text-[#e94560]" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-white text-sm font-semibold">Arkadaşlarını ekle</span>
          <span className="block text-[#718096] text-xs">İstatistiklerinizi karşılaştırın</span>
        </span>
        <ChevronRight size={16} className="text-[#718096] shrink-0" />
      </Link>
    )
  }

  return (
    <section className="mb-6">
      <SectionHeader icon={<UserPlus size={14} />} title={`Arkadaşlarım (${friends.length})`} linkTo="/friends" />
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4">
        {friends.map((friend) => {
          const name = friend.friend_profile?.display_name ?? '?'
          return (
            <Link
              key={friend.id}
              to="/friend/$friendId"
              params={{ friendId: friend.friend_id }}
              className="flex flex-col items-center gap-1 w-14 shrink-0"
            >
              <PlayerAvatar name={name} avatarUrl={friend.friend_profile?.avatar_url} size={48} />
              <span className="text-white text-xs truncate w-full text-center">{name}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function GameCard({
  game,
  isActive,
  onFinishedClick,
}: {
  game: Game
  isActive?: boolean
  onFinishedClick?: (gameId: string) => void
}) {
  const navigate = useNavigate()
  const subtype = game.game_subtype ?? (game.game_type === 'cezali_esli' ? 'esli' : 'solo')
  const type = game.game_type === 'cezali_esli' ? 'cezali_okey' : game.game_type

  const handleClick = () => {
    if (isActive) {
      navigate({ to: '/game/$gameId', params: { gameId: game.id } })
    } else {
      onFinishedClick?.(game.id)
    }
  }

  return (
    <button
      onClick={handleClick}
      className="w-full bg-[#16213e] border border-[#2d3748] rounded-xl p-4 flex items-center justify-between text-left hover:border-[#e94560]/50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {isActive && (
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          )}
          <p className="text-white text-sm font-medium truncate">
            {game.players.join(', ')}
          </p>
        </div>
        <p className="text-[#718096] text-xs">
          {getGameTypeLabel(type, subtype)} • {game.players.length} oyuncu •{' '}
          {formatDistanceToNow(game.created_at)}
        </p>
      </div>
      <ChevronRight size={16} className="text-[#718096] shrink-0 ml-2" />
    </button>
  )
}
