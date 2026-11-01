import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Link2, UserMinus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  areFriends,
  countLocalPlayers,
  fetchMyMergeRequestTo,
  fetchPlayerLinks,
  fetchUserProfile,
  fetchVisibleFinishedGames,
  getSupabaseErrorMessage,
  removeFriend,
  type PlayerLinks,
} from '@/lib/socialSupabase'
import { dispatchPlayersRefresh } from '@/lib/friendUtils'
import {
  computeComparisonStats,
  computeHeadToHead,
  intersectGames,
  selectFriendGames,
  selectMyGames,
  type ComparisonStats,
  type HeadToHeadOutcome,
} from '@/lib/statsUtils'
import { getGameBadgeLabel } from '@/lib/gameTypes'
import { formatDistanceToNow } from '@/lib/dateUtils'
import { BackButton } from '@/components/layout/BackButton'
import { GameResultModal } from '@/components/GameResultModal'
import { MergeRequestModal } from '@/components/MergeRequestModal'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { PlayerStats } from '@/components/PlayerStats'
import type { Game, MergeRequest, Profile, Round } from '@/types'

export const Route = createFileRoute('/friend/$friendId')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: FriendDetailPage,
})

type Tab = 'compare' | 'stats'
type Scope = 'shared' | 'overall'

const RECENT_GAMES = 5

function FriendDetailPage() {
  const { friendId } = Route.useParams()
  const navigate = useNavigate()

  const [myId, setMyId] = useState('')
  const [me, setMe] = useState<Profile | null>(null)
  const [friend, setFriend] = useState<Profile | null>(null)
  const [isFriend, setIsFriend] = useState(false)
  const [games, setGames] = useState<Game[]>([])
  const [roundsByGame, setRoundsByGame] = useState<Record<string, Round[]>>({})
  const [links, setLinks] = useState<PlayerLinks>({ linkedOwnerIds: new Set(), myLinkedFriendIds: new Set() })
  const [localPlayerCount, setLocalPlayerCount] = useState(0)
  const [mergeRequest, setMergeRequest] = useState<MergeRequest | null>(null)
  const [showMerge, setShowMerge] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState<Tab>('compare')
  const [scope, setScope] = useState<Scope | null>(null)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')

  const loadMergeState = async (uid: string) => {
    const [count, request] = await Promise.all([
      countLocalPlayers(uid),
      fetchMyMergeRequestTo(uid, friendId),
    ])
    setLocalPlayerCount(count)
    setMergeRequest(request)
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setLoadError(false)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setMyId(user.id)

      try {
        const [meRes, friendRes, friendship, visible, playerLinks] = await Promise.all([
          fetchUserProfile(user.id),
          fetchUserProfile(friendId),
          areFriends(user.id, friendId),
          fetchVisibleFinishedGames(),
          fetchPlayerLinks(user.id),
        ])
        await loadMergeState(user.id)
        setLinks(playerLinks)
        setMe(meRes.data)
        setFriend(friendRes.data)
        setIsFriend(friendship)
        setGames(visible.games)
        setRoundsByGame(visible.roundsByGame)
      } catch (err: unknown) {
        console.error('Arkadaş sayfası yüklenemedi:', err)
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [friendId])

  const myName = me?.display_name ?? ''
  const friendName = friend?.display_name ?? friend?.username ?? 'Arkadaş'

  const friendGames = useMemo(
    () => selectFriendGames(games, friendId, friendName, myId, links.myLinkedFriendIds),
    [games, friendId, friendName, myId, links]
  )
  const myGames = useMemo(
    () => selectMyGames(games, myId, myName, links.linkedOwnerIds),
    [games, myId, myName, links]
  )
  const headToHead = useMemo(
    () => computeHeadToHead(myName, friendName, intersectGames(myGames, friendGames), roundsByGame),
    [myName, friendName, myGames, friendGames, roundsByGame]
  )
  const sharedGames = useMemo(() => headToHead.games.map((g) => g.game), [headToHead])

  const activeScope: Scope = scope ?? (sharedGames.length > 0 ? 'shared' : 'overall')

  const comparison = useMemo(() => {
    return {
      mine: computeComparisonStats(myName, activeScope === 'shared' ? sharedGames : myGames, roundsByGame),
      theirs: computeComparisonStats(friendName, activeScope === 'shared' ? sharedGames : friendGames, roundsByGame),
    }
  }, [activeScope, myName, friendName, sharedGames, myGames, friendGames, roundsByGame])

  const handleRemove = async () => {
    setRemoving(true)
    setRemoveError('')
    try {
      await removeFriend(friendId)
      dispatchPlayersRefresh()
      navigate({ to: '/friends', replace: true })
    } catch (err: unknown) {
      setRemoveError(getSupabaseErrorMessage(err, 'Arkadaş çıkarılamadı'))
      setRemoving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadError || !friend || !isFriend) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white">
          {loadError ? 'Bilgiler yüklenemedi. Bağlantını kontrol edip tekrar dene.' : 'Bu kişi arkadaş listende değil'}
        </p>
        <Link to="/friends" className="text-[#e94560] font-semibold">
          Arkadaşlarıma Dön
        </Link>
      </div>
    )
  }

  const { myWins, friendWins, ties, sameTeam } = headToHead
  const together = headToHead.games.length
  const verdict =
    together === 0
      ? 'Henüz birlikte oyununuz yok'
      : myWins > friendWins
        ? 'Sen öndesin'
        : myWins < friendWins
          ? `${friendName} önde`
          : 'Eşitsiniz'
  const details = [
    `Birlikte ${together} oyun`,
    ties > 0 && `${ties} beraberlik`,
    sameTeam > 0 && `${sameTeam} aynı takım`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col pb-24">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-3 max-w-lg mx-auto gap-2">
          <BackButton className="w-9 h-9 justify-center shrink-0" />
          <h1 className="text-white font-bold truncate">{friendName}</h1>
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            aria-label="Arkadaşlıktan çıkar"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0] shrink-0"
          >
            <UserMinus size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full flex flex-col gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-[#0f3460] to-[#16213e] border border-[#2d3748] rounded-2xl p-4"
        >
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <PlayerAvatar name={myName || '?'} avatarUrl={me?.avatar_url} size={56} />
              <p className="text-white text-sm font-semibold">Sen</p>
            </div>
            <div className="text-center px-1">
              <p className="text-white text-3xl font-bold tabular-nums whitespace-nowrap">
                <span className={myWins > friendWins ? 'text-green-400' : ''}>{myWins}</span>
                <span className="text-[#4a5568] mx-1.5">–</span>
                <span className={friendWins > myWins ? 'text-green-400' : ''}>{friendWins}</span>
              </p>
              <p className="text-[#a0aec0] text-xs font-medium mt-1">{verdict}</p>
            </div>
            <div className="flex flex-col items-center gap-1.5 min-w-0 w-full">
              <PlayerAvatar name={friendName} avatarUrl={friend.avatar_url} size={56} />
              <p className="text-white text-sm font-semibold truncate max-w-full">{friendName}</p>
            </div>
          </div>
          {together > 0 && <p className="text-[#718096] text-xs text-center mt-3">{details}</p>}
        </motion.div>

        <div className="flex bg-[#16213e] border border-[#2d3748] rounded-xl p-1">
          {(
            [
              ['compare', 'Karşılaştırma'],
              ['stats', 'İstatistikler'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === key ? 'bg-[#e94560] text-white' : 'text-[#718096]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'compare' ? (
          <>
            {mergeRequest?.status === 'pending' && (
              <p className="bg-[#f5a623]/10 border border-[#f5a623]/40 rounded-xl p-3 text-sm text-white">
                "{mergeRequest.local_player_name}" oyuncun için {friendName} onayı bekleniyor.
              </p>
            )}
            {mergeRequest?.status === 'rejected' && (
              <p className="bg-[#0f3460]/40 border border-[#2d3748] rounded-xl p-3 text-sm text-[#a0aec0]">
                {friendName}, "{mergeRequest.local_player_name}" oyuncunla birleştirmeyi reddetti.
              </p>
            )}

            <section className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-4">
              <div className="flex bg-[#0f3460]/50 rounded-lg p-0.5 mb-3">
                {(
                  [
                    ['shared', `Birlikte (${together})`],
                    ['overall', 'Genel'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setScope(key)}
                    aria-pressed={activeScope === key}
                    className={`flex-1 h-8 rounded-md text-xs font-semibold transition-colors ${
                      activeScope === key ? 'bg-[#2d3748] text-white' : 'text-[#718096]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 text-[#718096] text-xs font-medium pb-1.5 border-b border-[#2d3748]">
                <span className="text-left">Sen</span>
                <span />
                <span className="text-right truncate">{friendName}</span>
              </div>
              <ComparisonRows mine={comparison.mine} theirs={comparison.theirs} />

              <p className="text-[#718096] text-xs mt-3">
                {activeScope === 'shared'
                  ? 'Yalnızca birlikte oynadığınız oyunlar.'
                  : 'Kendi kayıtların ve arkadaşlarının seni oyuncu olarak bağladığı kayıtlar.'}
              </p>
            </section>

            {together > 0 && (
              <section>
                <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">
                  Son Birlikte Oyunlar
                </h2>
                <div className="flex flex-col gap-2">
                  {headToHead.games.slice(0, RECENT_GAMES).map(({ game, myRank, friendRank, outcome }) => (
                    <button
                      key={game.id}
                      type="button"
                      onClick={() => setSelectedGameId(game.id)}
                      className="bg-[#16213e] border border-[#2d3748] hover:border-[#e94560]/40 rounded-xl p-3 flex items-center gap-3 text-left transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          Sen {myRank}. · {friendName} {friendRank}.
                        </p>
                        <p className="text-[#718096] text-xs truncate">
                          {getGameBadgeLabel(game)} · {formatDistanceToNow(game.finished_at ?? game.created_at)}
                        </p>
                      </div>
                      <OutcomeBadge outcome={outcome} />
                      <ChevronRight size={16} className="text-[#718096] shrink-0" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {localPlayerCount > 0 && (
              <button
                type="button"
                onClick={() => setShowMerge(true)}
                className="bg-[#16213e] border border-[#2d3748] hover:border-[#e94560]/40 rounded-xl p-3 flex items-center gap-3 text-left transition-colors"
              >
                <span className="w-10 h-10 rounded-full bg-[#0f3460] flex items-center justify-center shrink-0">
                  <Link2 size={18} className="text-[#e94560]" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-white text-sm font-medium">Yerel oyuncumla birleştir</span>
                  <span className="block text-[#718096] text-xs">{friendName} onaylarsa eski oyunlar ona geçer</span>
                </span>
                <ChevronRight size={16} className="text-[#718096] shrink-0" />
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-[#718096] text-xs -mb-1">Arkadaşının kendi kayıtları ve senin ona bağladığın kayıtlar sayılır.</p>
            <PlayerStats
              playerName={friendName}
              games={friendGames}
              roundsByGame={roundsByGame}
              showHistory
            />
          </>
        )}
      </div>

      <GameResultModal
        gameId={selectedGameId ?? ''}
        isOpen={!!selectedGameId}
        onClose={() => setSelectedGameId(null)}
        onViewScoreboard={() => setSelectedGameId(null)}
      />

      {showMerge && (
        <MergeRequestModal
          friendUserId={friendId}
          friendName={friendName}
          friendAvatarUrl={friend.avatar_url}
          onComplete={async () => {
            setShowMerge(false)
            await loadMergeState(myId)
          }}
          onSkip={async () => {
            setShowMerge(false)
            await loadMergeState(myId)
          }}
          onCancel={() => setShowMerge(false)}
        />
      )}

      <AnimatePresence>
        {confirmRemove && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
          >
            <div
              className="absolute inset-0 bg-black/70"
              onClick={() => !removing && setConfirmRemove(false)}
            />
            <div className="relative bg-[#16213e] border border-[#2d3748] rounded-2xl p-5 max-w-sm w-full">
              <h3 className="text-white font-bold mb-2">Arkadaşlıktan çıkar</h3>
              <p className="text-[#a0aec0] text-sm mb-4">
                {friendName} iki taraftan da listeden çıkar ve kendisine bildirim gider. Kayıtlı oyunlar silinmez.
              </p>
              {removeError && <p className="text-red-400 text-sm mb-3">{removeError}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  disabled={removing}
                  className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3 rounded-xl"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={removing}
                  className="flex-1 bg-red-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl"
                >
                  {removing ? '...' : 'Çıkar'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ComparisonRows({ mine, theirs }: { mine: ComparisonStats; theirs: ComparisonStats }) {
  const rows: {
    label: string
    mine: number | null
    theirs: number | null
    format?: (value: number) => string
    better?: 'high' | 'low'
  }[] = [
    { label: 'Oyun', mine: mine.games, theirs: theirs.games },
    { label: 'Kazanma', mine: mine.wins, theirs: theirs.wins, better: 'high' },
    { label: 'Kazanma oranı', mine: mine.winRate, theirs: theirs.winRate, format: (v) => `%${v}`, better: 'high' },
    { label: 'Ort. sıra (tekli)', mine: mine.avgRank, theirs: theirs.avgRank, format: (v) => v.toLocaleString('tr-TR'), better: 'low' },
    { label: 'El kazanma', mine: mine.roundWinRate, theirs: theirs.roundWinRate, format: (v) => `%${v}`, better: 'high' },
    { label: 'Okey atma', mine: mine.okeyThrows, theirs: theirs.okeyThrows, better: 'high' },
    { label: 'Okey yakma', mine: mine.okeyBurns, theirs: theirs.okeyBurns, better: 'low' },
  ]

  return (
    <div className="divide-y divide-[#2d3748]/60">
      {rows.map((row) => {
        const comparable = row.better && row.mine !== null && row.theirs !== null && row.mine !== row.theirs
        const mineBetter =
          comparable && (row.better === 'high' ? row.mine! > row.theirs! : row.mine! < row.theirs!)
        const theirsBetter = comparable && !mineBetter
        const show = (value: number | null) =>
          value === null ? '—' : row.format ? row.format(value) : String(value)

        return (
          <div key={row.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 h-10">
            <span className={`text-left tabular-nums ${mineBetter ? 'text-green-400 font-bold' : 'text-white'}`}>
              {show(row.mine)}
            </span>
            <span className="text-[#a0aec0] text-xs text-center">{row.label}</span>
            <span className={`text-right tabular-nums ${theirsBetter ? 'text-green-400 font-bold' : 'text-white'}`}>
              {show(row.theirs)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function OutcomeBadge({ outcome }: { outcome: HeadToHeadOutcome }) {
  const { label, tone } = {
    me: { label: 'Öndesin', tone: 'bg-green-500/15 text-green-400' },
    friend: { label: 'Geride', tone: 'bg-red-500/15 text-red-400' },
    tie: { label: 'Beraber', tone: 'bg-[#0f3460] text-[#a0aec0]' },
    same_team: { label: 'Aynı takım', tone: 'bg-[#0f3460] text-[#a0aec0]' },
  }[outcome]

  return (
    <span className={`shrink-0 px-2 py-1 rounded-lg text-xs font-semibold ${tone}`}>{label}</span>
  )
}
