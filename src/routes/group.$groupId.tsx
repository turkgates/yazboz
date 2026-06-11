import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import {
  fetchGroupById,
  fetchGroupMembers,
  fetchGroupGamesCount,
  fetchGroupGamesWithRounds,
  leaveGroup,
  removeGroupMember,
} from '@/lib/socialSupabase'
import type { Game, Group, GroupMember, Round } from '@/types'
import { BackButton } from '@/components/layout/BackButton'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, QrCode, LogOut } from 'lucide-react'
import { getGameWinners } from '@/lib/calculations'
import { getWinnersCount } from '@/lib/gameTypes'
import { computeGameTotals } from '@/lib/statsUtils'

export const Route = createFileRoute('/group/$groupId')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: GroupDetailPage,
})

interface MemberWinStats {
  wins: number
  totalGames: number
  winRate: number
}

function computeMemberStats(
  members: GroupMember[],
  games: Game[],
  roundsByGame: Record<string, Round[]>
): Record<string, MemberWinStats> {
  const stats: Record<string, MemberWinStats> = {}

  for (const member of members) {
    const memberName = member.profiles?.display_name
    if (!memberName) {
      stats[member.user_id] = { wins: 0, totalGames: 0, winRate: 0 }
      continue
    }

    let wins = 0
    let totalGames = 0

    for (const game of games) {
      if (!game.players.some((p) => p.toLowerCase() === memberName.toLowerCase())) continue

      totalGames++
      const gameRounds = roundsByGame[game.id] ?? []
      const playerTotals = computeGameTotals(game, gameRounds)
      const winners = getGameWinners(playerTotals, getWinnersCount(game.settings))
      if (winners.some((w) => w.toLowerCase() === memberName.toLowerCase())) wins++
    }

    stats[member.user_id] = {
      wins,
      totalGames,
      winRate: totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0,
    }
  }

  return stats
}

function GroupDetailPage() {
  const { groupId } = Route.useParams()
  const navigate = useNavigate()

  const [userId, setUserId] = useState('')
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [memberStats, setMemberStats] = useState<Record<string, MemberWinStats>>({})
  const [myPlayers, setMyPlayers] = useState<{ id: string; linked_user_id: string | null }[]>([])
  const [gamesCount, setGamesCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showQR, setShowQR] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setUserId(user.id)

    const [groupRes, membersRes, count, groupGamesRes, playersRes] = await Promise.all([
      fetchGroupById(groupId),
      fetchGroupMembers(groupId),
      fetchGroupGamesCount(groupId),
      fetchGroupGamesWithRounds(groupId),
      user
        ? supabase.from('players').select('id, linked_user_id').eq('user_id', user.id)
        : Promise.resolve({ data: [] }),
    ])

    if (membersRes.error) console.error('Üye hatası:', membersRes.error)

    const membersList = membersRes.data ?? []
    const stats = computeMemberStats(membersList, groupGamesRes.games, groupGamesRes.roundsByGame)

    setGroup(groupRes.data)
    setMembers(membersList)
    setMemberStats(stats)
    setMyPlayers(playersRes.data ?? [])
    setGamesCount(count)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [groupId])

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const aRate = memberStats[a.user_id]?.winRate ?? 0
      const bRate = memberStats[b.user_id]?.winRate ?? 0
      if (bRate !== aRate) return bRate - aRate
      return (memberStats[b.user_id]?.wins ?? 0) - (memberStats[a.user_id]?.wins ?? 0)
    })
  }, [members, memberStats])

  const handleCopyCode = async () => {
    if (!group) return
    await navigator.clipboard.writeText(group.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleLeave = async () => {
    await leaveGroup(groupId, userId)
    navigate({ to: '/groups' })
  }

  const handleRemoveMember = async (memberId: string) => {
    const confirmed = window.confirm('Bu üyeyi gruptan çıkarmak istediğinizden emin misiniz?')
    if (!confirmed) return

    try {
      await removeGroupMember(memberId)
      await load()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Üye çıkarılamadı'
      alert(`Üye çıkarılamadı: ${message}`)
    }
  }

  const isAdmin = members.some((m) => m.user_id === userId && m.role === 'admin')

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex flex-col items-center justify-center gap-4">
        <p className="text-white">Grup bulunamadı</p>
        <button onClick={() => navigate({ to: '/groups' })} className="text-[#e94560]">Gruplara Dön</button>
      </div>
    )
  }

  const isOwner = group.owner_id === userId

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col pb-24">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-3 max-w-lg mx-auto">
          <BackButton />
          <h1 className="text-white font-bold truncate flex-1 text-center px-2">{group.name}</h1>
          {!isOwner && (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-red-400"
            >
              <LogOut size={16} />
            </button>
          )}
          {isOwner && <div className="w-9" />}
        </div>
      </div>

      <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#16213e] border border-[#2d3748] rounded-xl p-3 text-center">
            <p className="text-white font-bold text-2xl">{members.length}</p>
            <p className="text-[#718096] text-xs">Üye</p>
          </div>
          <div className="bg-[#16213e] border border-[#2d3748] rounded-xl p-3 text-center">
            <p className="text-white font-bold text-2xl">{gamesCount}</p>
            <p className="text-[#718096] text-xs">Oyun</p>
          </div>
        </div>

        <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-4">
          <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">Davet Kodu</p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-white font-mono text-2xl font-bold tracking-widest">{group.invite_code}</span>
            <div className="flex gap-2">
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 bg-[#0f3460] text-[#a0aec0] hover:text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
              >
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                {copied ? 'Kopyalandı' : 'Kopyala'}
              </button>
              <button
                onClick={() => setShowQR(true)}
                className="flex items-center gap-1.5 bg-[#0f3460] text-[#a0aec0] hover:text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
              >
                <QrCode size={14} /> QR
              </button>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
            Üyeler ({members.length}/10) · Kazanma sıralaması
          </p>
          <div className="flex flex-col gap-0 bg-[#16213e] border border-[#2d3748] rounded-xl overflow-hidden">
            {sortedMembers.length === 0 ? (
              <p className="text-[#718096] text-sm text-center py-6">Henüz üye yok</p>
            ) : (
              sortedMembers.map((member, index) => {
                const playerRecord = myPlayers.find((p) => p.linked_user_id === member.user_id)
                const stats = memberStats[member.user_id]

                return (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3 p-3 border-b border-[#2d3748] last:border-b-0"
                  >
                    <span className="text-[#718096] text-sm w-6 shrink-0">{index + 1}.</span>
                    <PlayerAvatar
                      name={member.profiles?.display_name ?? '?'}
                      avatarUrl={member.profiles?.avatar_url}
                      size={40}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium truncate">
                          {member.profiles?.display_name ?? 'İsimsiz'}
                        </p>
                        {member.role === 'admin' && (
                          <span className="text-[#f5a623] text-xs">👑</span>
                        )}
                        {member.user_id === userId && (
                          <span className="text-[#718096] text-[10px] bg-[#0f3460] rounded px-1.5 py-0.5">Sen</span>
                        )}
                      </div>
                      <p className="text-[#718096] text-xs">
                        {stats?.wins ?? 0} kazanma · %{stats?.winRate ?? 0}
                      </p>
                    </div>
                    {playerRecord && (
                      <button
                        type="button"
                        onClick={() =>
                          navigate({ to: '/player/$playerId', params: { playerId: playerRecord.id } })
                        }
                        className="text-[#718096] hover:text-white p-2"
                      >
                        →
                      </button>
                    )}
                    {isAdmin && member.user_id !== userId && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.id)}
                        className="text-red-400 hover:text-red-300 p-2"
                        title="Üyeyi çıkar"
                      >
                        ✕
                      </button>
                    )}
                  </motion.div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showQR && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/80"
            onClick={() => setShowQR(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl p-8 flex flex-col items-center gap-4"
            >
              <QRCodeSVG value={`okeyyazboz://join-group/${group.invite_code}`} size={200} />
              <p className="text-[#1a1a2e] font-mono text-xl font-bold tracking-widest">{group.invite_code}</p>
              <p className="text-[#718096] text-sm">{group.name}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70"
            onClick={() => setShowLeaveConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-6 w-full max-w-sm"
            >
              <h3 className="text-white font-bold text-lg mb-2">Gruptan Ayrıl?</h3>
              <p className="text-[#718096] text-sm mb-5">{group.name} grubundan ayrılmak istediğine emin misin?</p>
              <div className="flex gap-3">
                <button onClick={() => setShowLeaveConfirm(false)} className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3 rounded-xl">İptal</button>
                <button onClick={handleLeave} className="flex-1 bg-red-500 text-white font-bold py-3 rounded-xl">Ayrıl</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
