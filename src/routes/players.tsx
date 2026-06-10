/**
 * Avatar bucket yoksa Supabase SQL Editor'da şunu çalıştırın:
 *
 * insert into storage.buckets (id, name, public)
 * values ('avatars', 'avatars', true)
 * on conflict (id) do nothing;
 */
import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase, deletePlayer } from '@/lib/supabase'
import { searchProfileByUsername, sendFriendRequest } from '@/lib/socialSupabase'
import type { SavedPlayer } from '@/types'
import { Plus, Pencil, Trash2, UserPlus, X } from 'lucide-react'
import { BackButton } from '@/components/layout/BackButton'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { PlayerFormModal } from '@/components/players/PlayerFormModal'

export const Route = createFileRoute('/players')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: PlayersPage,
})

interface PlayerRow extends Pick<SavedPlayer, 'id' | 'name' | 'avatar_url' | 'linked_user_id'> {
  username?: string | null
}

function PlayersPage() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState('')
  const [realFriends, setRealFriends] = useState<PlayerRow[]>([])
  const [localPlayers, setLocalPlayers] = useState<PlayerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showPlayerModal, setShowPlayerModal] = useState(false)
  const [showFriendModal, setShowFriendModal] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<SavedPlayer | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Friend search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState<{
    id: string
    username: string | null
    display_name: string | null
    avatar_url: string | null
  } | null | 'not_found'>()
  const [searchLoading, setSearchLoading] = useState(false)
  const [friendError, setFriendError] = useState('')
  const [sendingRequest, setSendingRequest] = useState(false)

  const loadPlayers = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: players } = await supabase
      .from('players')
      .select('id, name, avatar_url, linked_user_id')
      .eq('user_id', user.id)
      .order('name')

    const friends = (players ?? []).filter(
      (p) => p.linked_user_id && p.linked_user_id !== user.id
    )
    const locals = (players ?? []).filter((p) => !p.linked_user_id)

    const friendUserIds = friends.map((p) => p.linked_user_id!).filter(Boolean)
    let profileMap: Record<string, { username: string | null; display_name: string | null }> = {}

    if (friendUserIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .in('id', friendUserIds)
      profileMap = Object.fromEntries(
        (profiles ?? []).map((p) => [p.id, { username: p.username, display_name: p.display_name }])
      )
    }

    setRealFriends(
      friends.map((p) => ({
        ...p,
        username: profileMap[p.linked_user_id!]?.username ?? null,
        name: profileMap[p.linked_user_id!]?.display_name ?? p.name,
      }))
    )
    setLocalPlayers(locals)
    setLoading(false)
  }

  useEffect(() => {
    loadPlayers()
  }, [])

  const handleDelete = async (playerId: string) => {
    const { error } = await deletePlayer(playerId)
    if (error) {
      console.error('Delete player error:', error)
      return
    }
    setConfirmDeleteId(null)
    loadPlayers()
  }

  const handleSearchFriend = async () => {
    if (!searchQuery.trim()) return
    setSearchLoading(true)
    setFriendError('')
    const { data } = await searchProfileByUsername(searchQuery.trim().replace(/^@/, ''))
    setSearchResult(data ?? 'not_found')
    setSearchLoading(false)
  }

  const handleSendRequest = async (receiverId: string) => {
    if (!userId) return
    setSendingRequest(true)
    setFriendError('')
    try {
      if (receiverId === userId) {
        setFriendError('Kendine istek gönderemezsin')
        return
      }
      const { error } = await sendFriendRequest(userId, receiverId)
      if (error) throw error
      setShowFriendModal(false)
      setSearchQuery('')
      setSearchResult(undefined)
    } catch (err: unknown) {
      setFriendError(err instanceof Error ? err.message : 'İstek gönderilemedi')
    } finally {
      setSendingRequest(false)
    }
  }

  const openEdit = (player: PlayerRow) => {
    setEditingPlayer({
      id: player.id,
      user_id: userId,
      name: player.name,
      avatar_url: player.avatar_url,
      linked_user_id: player.linked_user_id,
      created_at: '',
    })
    setShowPlayerModal(true)
  }

  const renderPlayerRow = (player: PlayerRow, showUsername = false) => (
    <motion.div
      key={player.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#16213e] border border-[#2d3748] rounded-xl p-4 flex items-center gap-3"
    >
      <button
        type="button"
        onClick={() => navigate({ to: '/player/$playerId', params: { playerId: player.id } })}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size={48} />
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium truncate">{player.name}</p>
          {showUsername && player.username && (
            <p className="text-[#718096] text-xs">@{player.username}</p>
          )}
        </div>
      </button>
      <button
        onClick={() => openEdit(player)}
        className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#0f3460] text-[#a0aec0] hover:text-white"
      >
        <Pencil size={16} />
      </button>
      <button
        onClick={() => setConfirmDeleteId(player.id)}
        className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#0f3460] text-red-400 hover:bg-red-500/10"
      >
        <Trash2 size={16} />
      </button>
    </motion.div>
  )

  const isEmpty = !loading && realFriends.length === 0 && localPlayers.length === 0

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col pb-24">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-4 max-w-lg mx-auto gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <BackButton className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460]" />
            <h1 className="text-lg font-bold text-white truncate">Oyuncularım</h1>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => { setSearchQuery(''); setSearchResult(undefined); setFriendError(''); setShowFriendModal(true) }}
              className="flex items-center gap-1 bg-[#0f3460] text-[#a0aec0] hover:text-white text-xs font-semibold px-2.5 py-2 rounded-xl"
            >
              <UserPlus size={14} />
              Arkadaş
            </button>
            <button
              onClick={() => { setEditingPlayer(null); setShowPlayerModal(true) }}
              className="flex items-center gap-1 bg-[#e94560] text-white text-xs font-semibold px-2.5 py-2 rounded-xl"
            >
              <Plus size={14} />
              Oyuncu
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-5xl mb-4">👥</div>
            <p className="text-white font-medium mb-2">Henüz oyuncu yok</p>
            <p className="text-[#718096] text-sm mb-6">
              Arkadaş ekle veya yerel oyuncu kaydet.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFriendModal(true)}
                className="bg-[#0f3460] text-[#a0aec0] font-semibold px-4 py-3 rounded-xl text-sm"
              >
                + Arkadaş Ekle
              </button>
              <button
                onClick={() => { setEditingPlayer(null); setShowPlayerModal(true) }}
                className="bg-[#e94560] text-white font-semibold px-4 py-3 rounded-xl text-sm"
              >
                + Oyuncu Ekle
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {realFriends.length > 0 && (
              <section>
                <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
                  🤝 Arkadaşlar ({realFriends.length})
                </h2>
                <div className="flex flex-col gap-2">
                  {realFriends.map((p) => renderPlayerRow(p, true))}
                </div>
              </section>
            )}

            {localPlayers.length > 0 && (
              <section>
                <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
                  👤 Yerel Oyuncular ({localPlayers.length})
                </h2>
                <div className="flex flex-col gap-2">
                  {localPlayers.map((p) => renderPlayerRow(p))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Add friend modal */}
      <AnimatePresence>
        {showFriendModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center"
            onClick={() => setShowFriendModal(false)}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg bg-[#16213e] rounded-t-3xl border-t border-x border-[#2d3748] p-6 safe-bottom"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Arkadaş Ekle</h3>
                <button onClick={() => setShowFriendModal(false)} className="text-[#718096]">
                  <X size={20} />
                </button>
              </div>
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096] text-sm">@</span>
                  <input
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setSearchResult(undefined); setFriendError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchFriend()}
                    placeholder="kullaniciadi"
                    autoFocus
                    className="w-full bg-[#0f3460]/50 border border-[#2d3748] rounded-xl py-3 pl-7 pr-3 text-white placeholder-[#718096] text-sm focus:outline-none focus:border-[#e94560]"
                  />
                </div>
                <button
                  onClick={handleSearchFriend}
                  disabled={searchLoading}
                  className="bg-[#e94560] text-white px-4 rounded-xl text-sm font-bold"
                >
                  {searchLoading ? '...' : 'Ara'}
                </button>
              </div>
              {friendError && <p className="text-red-400 text-sm mb-2">{friendError}</p>}
              {searchResult === 'not_found' && (
                <p className="text-[#718096] text-sm text-center py-4">Kullanıcı bulunamadı</p>
              )}
              {searchResult && searchResult !== 'not_found' && (
                <div className="bg-[#0f3460]/40 border border-[#2d3748] rounded-xl p-4 flex items-center gap-3">
                  <PlayerAvatar
                    name={searchResult.display_name ?? '?'}
                    avatarUrl={searchResult.avatar_url}
                    size={48}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">{searchResult.display_name}</p>
                    <p className="text-[#718096] text-sm">@{searchResult.username}</p>
                  </div>
                  <button
                    onClick={() => handleSendRequest(searchResult.id)}
                    disabled={sendingRequest}
                    className="bg-[#e94560] text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50"
                  >
                    {sendingRequest ? '...' : 'İstek Gönder'}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPlayerModal && (
          <PlayerFormModal
            player={editingPlayer}
            onClose={() => { setShowPlayerModal(false); setEditingPlayer(null) }}
            onSaved={loadPlayers}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
          >
            <div className="absolute inset-0 bg-black/70" onClick={() => setConfirmDeleteId(null)} />
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="relative bg-[#16213e] border border-[#2d3748] rounded-2xl p-5 max-w-sm w-full"
            >
              <p className="text-white text-center mb-5">
                Bu oyuncuyu silmek istediğinizden emin misiniz?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3 rounded-xl"
                >
                  İptal
                </button>
                <button
                  onClick={() => handleDelete(confirmDeleteId)}
                  className="flex-1 bg-red-500 text-white font-bold py-3 rounded-xl"
                >
                  Sil
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
