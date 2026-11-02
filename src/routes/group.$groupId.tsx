import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, LogOut, Play, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { supabase, getSessionUser, getLocalSession } from '@/lib/supabase'
import {
  fetchFriends,
  fetchGroupById,
  fetchGroupGamesWithRounds,
  fetchGroupMembers,
  leaveGroup,
  removeGroupMember,
  syncGroupGames,
} from '@/lib/socialSupabase'
import {
  computeGroupStats,
  getGroupGameWinners,
  type GroupMemberStats,
  type GroupRecord,
} from '@/lib/groupStatsUtils'
import { formatDistanceToNow } from '@/lib/dateUtils'
import { getGameBadgeLabel, matchesGameFilter, type GameFilterKey } from '@/lib/gameTypes'
import type { Friend, Game, Group, GroupMember, Round } from '@/types'
import { BackButton } from '@/components/layout/BackButton'
import { GameResultModal } from '@/components/GameResultModal'
import { InviteSheet } from '@/components/groups/InviteSheet'
import { PlayerAvatar } from '@/components/PlayerAvatar'

export const Route = createFileRoute('/group/$groupId')({
  beforeLoad: async () => {
    const session = await getLocalSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: GroupDetailPage,
})

type Tab = 'ranking' | 'records' | 'games' | 'members'
type TypeFilter = GameFilterKey | 'all'

const TABS: { key: Tab; label: string }[] = [
  { key: 'ranking', label: 'Sıralama' },
  { key: 'records', label: 'Enler' },
  { key: 'games', label: 'Oyunlar' },
  { key: 'members', label: 'Üyeler' },
]

const TYPE_FILTERS: { key: GameFilterKey; label: string }[] = [
  { key: 'cezali', label: 'Cezalı' },
  { key: 'bankolu', label: 'Bankolu' },
  { key: 'sayili', label: 'Sayılı' },
  { key: '101', label: '101' },
]

const MEDALS = ['🥇', '🥈', '🥉']
const GAMES_PAGE_SIZE = 10
const MAX_GROUP_MEMBERS = 10
const HERO_AVATAR_LIMIT = 6

interface ConfirmAction {
  title: string
  body: string
  label: string
  run: () => Promise<void>
}

function GroupDetailPage() {
  const { groupId } = Route.useParams()
  const navigate = useNavigate()

  const [userId, setUserId] = useState('')
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [roundsByGame, setRoundsByGame] = useState<Record<string, Round[]>>({})
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState<Tab>('ranking')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [visibleGames, setVisibleGames] = useState(GAMES_PAGE_SIZE)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [actionError, setActionError] = useState('')

  const load = async () => {
    const { data: { user } } = await getSessionUser()
    if (!user) return
    setUserId(user.id)
    setLoadError(false)

    try {
      await syncGroupGames(groupId)

      const [groupRes, membersRes, groupGames, friendsRes] = await Promise.all([
        fetchGroupById(groupId),
        fetchGroupMembers(groupId),
        fetchGroupGamesWithRounds(groupId),
        fetchFriends(user.id),
      ])

      setGroup(groupRes.data)
      setMembers(membersRes.data ?? [])
      setGames(groupGames.games)
      setRoundsByGame(groupGames.roundsByGame)
      setFriendIds(new Set(((friendsRes.data ?? []) as Friend[]).map((f) => f.friend_id)))
    } catch (err: unknown) {
      console.error('Grup yüklenemedi:', err)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [groupId])

  const memberInputs = useMemo(
    () =>
      members.map((m) => ({
        userId: m.user_id,
        name: m.profiles?.display_name ?? 'İsimsiz',
        avatarUrl: m.profiles?.avatar_url ?? null,
      })),
    [members]
  )

  const availableTypes = useMemo(
    () => TYPE_FILTERS.filter((t) => games.some((g) => matchesGameFilter(g, [t.key]))),
    [games]
  )

  const filteredGames = useMemo(
    () => (typeFilter === 'all' ? games : games.filter((g) => matchesGameFilter(g, [typeFilter]))),
    [games, typeFilter]
  )

  const stats = useMemo(
    () => computeGroupStats(memberInputs, filteredGames, roundsByGame),
    [memberInputs, filteredGames, roundsByGame]
  )

  const runConfirm = async () => {
    if (!confirm) return
    setConfirming(true)
    setActionError('')
    try {
      await confirm.run()
      setConfirm(null)
    } catch (err: unknown) {
      console.error('Grup işlemi hatası:', err)
      setActionError(err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setConfirming(false)
    }
  }

  const askLeave = () => {
    setActionError('')
    setConfirm({
      title: 'Gruptan ayrıl',
      body: `${group?.name} grubundan ayrılmak istediğine emin misin? Diğer üyelere bildirim gider.`,
      label: 'Ayrıl',
      run: async () => {
        const { error } = await leaveGroup(groupId, userId)
        if (error) throw new Error(error.message)
        navigate({ to: '/groups' })
      },
    })
  }

  const askRemove = (member: GroupMember) => {
    setActionError('')
    setConfirm({
      title: 'Üyeyi çıkar',
      body: `${member.profiles?.display_name ?? 'Bu üye'} gruptan çıkarılacak ve kendisine bildirim gidecek.`,
      label: 'Çıkar',
      run: async () => {
        await removeGroupMember(member.id)
        await load()
      },
    })
  }

  const askDelete = () => {
    setActionError('')
    setConfirm({
      title: 'Grubu sil',
      body: `${group?.name} grubu herkes için silinecek. Oyunlar silinmez ama grup sıralaması kaybolur. Bu işlem geri alınamaz.`,
      label: 'Sil',
      run: async () => {
        const { error } = await supabase
          .from('groups')
          .delete()
          .eq('id', groupId)
          .eq('owner_id', userId)
        if (error) throw new Error(error.message)
        navigate({ to: '/groups' })
      },
    })
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white">
          {loadError ? 'Grup yüklenemedi. Bağlantını kontrol edip tekrar dene.' : 'Grup bulunamadı'}
        </p>
        <Link to="/groups" className="text-[#e94560] font-semibold">
          Gruplara Dön
        </Link>
      </div>
    )
  }

  const isOwner = group.owner_id === userId
  const hasGames = games.length > 0

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col pb-24">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-3 max-w-lg mx-auto gap-2">
          <BackButton className="w-9 h-9 justify-center shrink-0" />
          <h1 className="text-white font-bold truncate">{group.name}</h1>
          <div className="w-9 shrink-0" />
        </div>
      </div>

      <div className="flex-1 px-4 py-4 max-w-lg mx-auto w-full flex flex-col gap-4">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-[#e94560]/20 via-[#0f3460] to-[#16213e] border border-[#2d3748] rounded-2xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex shrink-0">
              {memberInputs.slice(0, HERO_AVATAR_LIMIT).map((member, i) => (
                <PlayerAvatar
                  key={member.userId}
                  name={member.name}
                  avatarUrl={member.avatarUrl}
                  size={36}
                  className={i > 0 ? '-ml-2.5' : ''}
                />
              ))}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold">
                {members.length} üye · {games.length} oyun
              </p>
              <p className="text-[#a0aec0] text-xs truncate">
                {hasGames && stats.lastPlayedAt
                  ? `Son oyun ${formatDistanceToNow(games[0].finished_at ?? games[0].created_at)}`
                  : 'Henüz oyun yok'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 mt-3">
            <Link
              to="/new-game"
              search={{ group: group.id }}
              className="h-11 rounded-xl bg-[#e94560] text-white text-sm font-bold flex items-center justify-center gap-2"
            >
              <Play size={16} />
              Grupla Oyun Başlat
            </Link>
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="h-11 px-4 rounded-xl bg-white/10 text-white text-sm font-semibold flex items-center justify-center gap-2"
            >
              <UserPlus size={16} />
              Davet Et
            </button>
          </div>
        </motion.section>

        <div className="flex bg-[#16213e] border border-[#2d3748] rounded-xl p-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={`flex-1 h-9 rounded-lg text-sm font-semibold transition-colors ${
                tab === key ? 'bg-[#e94560] text-white' : 'text-[#718096]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab !== 'members' && availableTypes.length > 1 && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-0.5">
            {[{ key: 'all' as TypeFilter, label: 'Tümü' }, ...availableTypes].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={typeFilter === key}
                onClick={() => {
                  setTypeFilter(key)
                  setVisibleGames(GAMES_PAGE_SIZE)
                }}
                className={`px-3 h-8 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  typeFilter === key ? 'bg-[#2d3748] text-white' : 'bg-[#16213e] text-[#718096]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {tab === 'ranking' &&
          (hasGames ? (
            <>
              <div className="grid grid-cols-4 gap-2">
                <SummaryTile label="Oyun" value={stats.games} />
                <SummaryTile label="El" value={stats.rounds} />
                <SummaryTile label="Okey" value={stats.okeyThrows} />
                <SummaryTile label="Yakma" value={stats.okeyBurns} />
              </div>
              <div className="flex flex-col gap-2">
                {stats.members.map((member, index) => (
                  <RankingRow
                    key={member.userId}
                    member={member}
                    index={index}
                    maxWins={stats.members[0]?.wins ?? 0}
                    isMe={member.userId === userId}
                    isFriend={friendIds.has(member.userId)}
                    isOwner={member.userId === group.owner_id}
                  />
                ))}
              </div>
            </>
          ) : (
            <NoGames />
          ))}

        {tab === 'records' &&
          (hasGames ? (
            <div className="flex flex-col gap-5">
              <RecordSection title="En iyiler" records={stats.bestRecords} onOpenGame={setSelectedGameId} />
              <RecordSection title="En kötüler" records={stats.worstRecords} onOpenGame={setSelectedGameId} />
              <RecordSection title="Grup" records={stats.gameRecords} onOpenGame={setSelectedGameId} />
            </div>
          ) : (
            <NoGames />
          ))}

        {tab === 'games' &&
          (hasGames ? (
            <div className="flex flex-col gap-2">
              {filteredGames.slice(0, visibleGames).map((game) => (
                <GameRow
                  key={game.id}
                  game={game}
                  rounds={roundsByGame[game.id] ?? []}
                  onClick={() => setSelectedGameId(game.id)}
                />
              ))}
              {visibleGames < filteredGames.length && (
                <button
                  type="button"
                  onClick={() => setVisibleGames((v) => v + GAMES_PAGE_SIZE)}
                  className="h-11 text-[#a0aec0] text-sm font-semibold"
                >
                  Daha Eski
                </button>
              )}
            </div>
          ) : (
            <NoGames />
          ))}

        {tab === 'members' && (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="bg-[#16213e] border border-[#2d3748] rounded-xl p-3 flex items-center justify-between gap-3 text-left"
            >
              <span className="min-w-0">
                <span className="block text-[#718096] text-xs">Davet kodu</span>
                <span className="block text-white font-mono text-xl font-bold tracking-widest">{group.invite_code}</span>
              </span>
              <span className="flex items-center gap-1 text-[#e94560] text-sm font-semibold shrink-0">
                QR ve paylaş
                <ChevronRight size={16} />
              </span>
            </button>

            <section>
              <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">
                Üyeler ({members.length}/{MAX_GROUP_MEMBERS})
              </h2>
              <div className="bg-[#16213e] border border-[#2d3748] rounded-xl overflow-hidden">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-3 border-b border-[#2d3748] last:border-b-0"
                  >
                    <PlayerAvatar
                      name={member.profiles?.display_name ?? '?'}
                      avatarUrl={member.profiles?.avatar_url}
                      size={40}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {member.profiles?.display_name ?? 'İsimsiz'}
                        {member.user_id === userId && <span className="text-[#718096] font-normal"> · Sen</span>}
                      </p>
                      <p className="text-[#718096] text-xs truncate">
                        {member.user_id === group.owner_id ? 'Grup sahibi' : `@${member.profiles?.username ?? ''}`}
                      </p>
                    </div>
                    {isOwner && member.user_id !== userId && (
                      <button
                        type="button"
                        aria-label={`${member.profiles?.display_name ?? 'Üyeyi'} çıkar`}
                        onClick={() => askRemove(member)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#0f3460] text-[#a0aec0] shrink-0"
                      >
                        <UserMinus size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {isOwner ? (
              <button
                type="button"
                onClick={askDelete}
                className="h-11 rounded-xl border border-red-500/40 text-red-400 text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Trash2 size={16} />
                Grubu Sil
              </button>
            ) : (
              <button
                type="button"
                onClick={askLeave}
                className="h-11 rounded-xl border border-red-500/40 text-red-400 text-sm font-semibold flex items-center justify-center gap-2"
              >
                <LogOut size={16} />
                Gruptan Ayrıl
              </button>
            )}
          </div>
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

      <AnimatePresence>
        {showInvite && <InviteSheet group={group} onClose={() => setShowInvite(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {confirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
          >
            <div
              className="absolute inset-0 bg-black/70"
              onClick={() => !confirming && setConfirm(null)}
            />
            <div className="relative bg-[#16213e] border border-[#2d3748] rounded-2xl p-5 max-w-sm w-full">
              <h3 className="text-white font-bold mb-2">{confirm.title}</h3>
              <p className="text-[#a0aec0] text-sm mb-4">{confirm.body}</p>
              {actionError && <p className="text-red-400 text-sm mb-3">{actionError}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirm(null)}
                  disabled={confirming}
                  className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3 rounded-xl"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={runConfirm}
                  disabled={confirming}
                  className="flex-1 bg-red-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl"
                >
                  {confirming ? '...' : confirm.label}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function NoGames() {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="text-5xl">🎲</div>
      <p className="text-white font-semibold">Henüz grup oyunu yok</p>
      <p className="text-[#718096] text-sm max-w-72">
        Üyelerden en az ikisinin oynadığı oyunlar burada toplanır ve sıralama oluşur.
      </p>
    </div>
  )
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#16213e] border border-[#2d3748] rounded-xl py-2.5 text-center">
      <p className="text-white font-bold text-lg leading-tight tabular-nums">{value}</p>
      <p className="text-[#718096] text-[11px]">{label}</p>
    </div>
  )
}

function RankingRow({
  member,
  index,
  maxWins,
  isMe,
  isFriend,
  isOwner,
}: {
  member: GroupMemberStats
  index: number
  maxWins: number
  isMe: boolean
  isFriend: boolean
  isOwner: boolean
}) {
  const played = member.games > 0
  const content = (
    <>
      <div className="flex items-center gap-3">
        <span className="w-6 shrink-0 text-center text-[#718096] text-sm font-semibold">
          {played && index < MEDALS.length ? <span className="text-lg">{MEDALS[index]}</span> : `${index + 1}.`}
        </span>
        <PlayerAvatar name={member.name} avatarUrl={member.avatarUrl} size={40} />
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">
            {member.name}
            {isOwner && <span> 👑</span>}
            {isMe && <span className="text-[#718096] font-normal"> · Sen</span>}
          </p>
          <p className="text-[#718096] text-xs truncate">
            {played ? `${member.games} oyun · %${member.winRate} kazanma` : 'Henüz oyun yok'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-white font-bold text-lg leading-tight tabular-nums">{member.wins}</p>
          <p className="text-[#718096] text-[10px]">galibiyet</p>
        </div>
        {(isMe || isFriend) && <ChevronRight size={16} className="text-[#718096] shrink-0" />}
      </div>
      {played && maxWins > 0 && (
        <div className="h-1 bg-[#0f3460] rounded-full mt-2.5 overflow-hidden">
          <div
            className="h-full bg-[#e94560] rounded-full"
            style={{ width: `${Math.round((member.wins / maxWins) * 100)}%` }}
          />
        </div>
      )}
    </>
  )

  const className = 'block bg-[#16213e] border border-[#2d3748] rounded-xl p-3'

  if (isMe) {
    return (
      <Link to="/profile" search={{ tab: 'stats' }} className={className}>
        {content}
      </Link>
    )
  }
  if (isFriend) {
    return (
      <Link to="/friend/$friendId" params={{ friendId: member.userId }} className={className}>
        {content}
      </Link>
    )
  }
  return <div className={className}>{content}</div>
}

function RecordSection({
  title,
  records,
  onOpenGame,
}: {
  title: string
  records: GroupRecord[]
  onOpenGame: (gameId: string) => void
}) {
  if (records.length === 0) return null

  return (
    <section>
      <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">{title}</h2>
      <div className="grid grid-cols-2 gap-2">
        {records.map((record) => (
          <RecordCard key={record.key} record={record} onOpenGame={onOpenGame} />
        ))}
      </div>
    </section>
  )
}

function RecordCard({
  record,
  onOpenGame,
}: {
  record: GroupRecord
  onOpenGame: (gameId: string) => void
}) {
  const [first, ...others] = record.holders
  const content = (
    <>
      <p className="text-[#a0aec0] text-xs font-medium truncate">
        <span className="mr-1">{record.emoji}</span>
        {record.title}
      </p>
      {first && (
        <div className="flex items-center gap-2 mt-2 min-w-0">
          <PlayerAvatar name={first.name} avatarUrl={first.avatarUrl} size={28} />
          <span className="text-white text-sm font-semibold truncate">
            {first.name}
            {others.length === 1 && ` & ${others[0].name}`}
            {others.length > 1 && ` +${others.length}`}
          </span>
        </div>
      )}
      <p className={`text-[#f5a623] font-bold tabular-nums truncate ${first ? 'mt-1.5 text-base' : 'mt-2 text-lg'}`}>
        {record.value}
      </p>
      {record.detail && <p className="text-[#718096] text-[11px] truncate mt-0.5">{record.detail}</p>}
    </>
  )

  const className = 'bg-[#16213e] border border-[#2d3748] rounded-xl p-3 text-left min-w-0'

  if (record.gameId) {
    return (
      <button type="button" onClick={() => onOpenGame(record.gameId!)} className={className}>
        {content}
      </button>
    )
  }
  return <div className={className}>{content}</div>
}

function GameRow({
  game,
  rounds,
  onClick,
}: {
  game: Game
  rounds: Round[]
  onClick: () => void
}) {
  const winners = getGroupGameWinners(game, rounds)

  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-[#16213e] border border-[#2d3748] hover:border-[#e94560]/40 rounded-xl p-3 flex items-center gap-3 text-left transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate">
          {winners.length > 0 ? `🏆 ${winners.join(', ')}` : 'Sonuç yok'}
        </p>
        <p className="text-[#a0aec0] text-xs truncate mt-0.5">{game.players.join(', ')}</p>
        <p className="text-[#718096] text-xs truncate mt-0.5">
          {getGameBadgeLabel(game)} · {rounds.filter((r) => !r.is_indicator_only).length} el ·{' '}
          {formatDistanceToNow(game.finished_at ?? game.created_at)}
        </p>
      </div>
      <ChevronRight size={16} className="text-[#718096] shrink-0" />
    </button>
  )
}
