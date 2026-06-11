import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { supabase, uploadAvatar, signOut } from '@/lib/supabase'
import {
  fetchUserProfile,
  upsertProfile,
  fetchFriends,
  fetchPendingRequests,
  fetchSentRequests,
  sendFriendRequest,
  respondToFriendRequest,
  removeFriend,
  searchProfileByUsername,
  fetchMyGroups,
  getSupabaseErrorMessage,
  areFriends,
} from '@/lib/socialSupabase'
import type { Friend, FriendRequest, Group, Profile } from '@/types'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { BackButton } from '@/components/layout/BackButton'
import { Camera, LogOut, Pencil, UserPlus, Users, X } from 'lucide-react'
import { PlayerStats } from '@/components/PlayerStats'

export const Route = createFileRoute('/profile')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: ProfilePage,
})

type Tab = 'stats' | 'groups' | 'friends'

function ProfilePage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [userId, setUserId] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('stats')
  const [loading, setLoading] = useState(true)

  // Groups
  const [groups, setGroups] = useState<Group[]>([])

  // Friends
  const [friends, setFriends] = useState<Friend[]>([])
  const [localPlayers, setLocalPlayers] = useState<{ id: string; name: string; avatar_url: string | null }[]>([])
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([])
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([])

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Add friend search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState<Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null | 'not_found'>()
  const [searchLoading, setSearchLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [sendingRequest, setSendingRequest] = useState(false)
  const [searchMeta, setSearchMeta] = useState<{ isFriend: boolean; pendingSent: boolean }>({
    isFriend: false,
    pendingSent: false,
  })
  const [confirmRemoveFriend, setConfirmRemoveFriend] = useState<{
    friendId: string
    name: string
  } | null>(null)
  const [responding, setResponding] = useState(false)
  const [removingFriend, setRemovingFriend] = useState(false)

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [profileRes] = await Promise.all([
      fetchUserProfile(user.id),
    ])

    if (profileRes.data) setProfile(profileRes.data)
    setLoading(false)

    const [groupsRes, friendsRes, pendingRes, sentRes, playersRes] = await Promise.all([
      fetchMyGroups(user.id),
      fetchFriends(user.id),
      fetchPendingRequests(user.id),
      fetchSentRequests(user.id),
      supabase
        .from('players')
        .select('id, name, avatar_url, linked_user_id')
        .eq('user_id', user.id)
        .order('name'),
    ])
    setGroups(groupsRes.data ?? [])
    setFriends(friendsRes.data ?? [])
    setPendingRequests(pendingRes.data ?? [])
    setSentRequests(sentRes.data ?? [])
    setLocalPlayers(
      (playersRes.data ?? []).filter((p) => !p.linked_user_id).map((p) => ({
        id: p.id,
        name: p.name,
        avatar_url: p.avatar_url,
      }))
    )
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    try {
      const url = await uploadAvatar(file, userId)
      await upsertProfile(userId, { avatar_url: url })
      setProfile((p) => p ? { ...p, avatar_url: url } : p)
    } catch { /* ignore */ }
  }

  const handleSaveEdit = async () => {
    if (!editName.trim()) return
    setEditSaving(true)
    setEditError('')
    const { error } = await upsertProfile(userId, {
      display_name: editName.trim(),
      bio: editBio.trim() || undefined,
    })
    if (error) {
      console.error('Profil güncelleme hatası:', error)
      setEditError(error.message || 'Kaydedilemedi')
      setEditSaving(false)
      return
    }
    setProfile((p) => p ? { ...p, display_name: editName.trim(), bio: editBio.trim() || null } : p)
    setEditMode(false)
    setEditSaving(false)
  }

  const refreshFriendData = async (uid: string) => {
    const [friendsRes, pendingRes, sentRes, playersRes] = await Promise.all([
      fetchFriends(uid),
      fetchPendingRequests(uid),
      fetchSentRequests(uid),
      supabase
        .from('players')
        .select('id, name, avatar_url, linked_user_id')
        .eq('user_id', uid)
        .order('name'),
    ])
    setFriends(friendsRes.data ?? [])
    setPendingRequests(pendingRes.data ?? [])
    setSentRequests(sentRes.data ?? [])
    setLocalPlayers(
      (playersRes.data ?? []).filter((p) => !p.linked_user_id).map((p) => ({
        id: p.id,
        name: p.name,
        avatar_url: p.avatar_url,
      }))
    )
  }

  const handleSearchUser = async () => {
    if (!searchQuery.trim()) return
    setSearchLoading(true)
    setAddError('')
    setSearchMeta({ isFriend: false, pendingSent: false })
    const { data, error } = await searchProfileByUsername(searchQuery)
    if (error) {
      console.error('Arkadaş arama hatası:', error)
      setAddError('Arama başarısız')
    }
    if (data?.id && userId) {
      const isFriend =
        friends.some((f) => f.friend_id === data.id) ||
        (await areFriends(userId, data.id))
      const pendingSent = sentRequests.some((r) => r.receiver_id === data.id)
      setSearchMeta({ isFriend, pendingSent })
    }
    setSearchResult(data ?? 'not_found')
    setSearchLoading(false)
  }

  const handleSendRequest = async (receiverId: string) => {
    if (!receiverId) {
      setAddError('Geçersiz kullanıcı')
      return
    }
    setAddError('')
    setSendingRequest(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user?.id
      if (!uid) {
        setAddError('Oturum bulunamadı')
        return
      }
      if (receiverId === uid) {
        setAddError('Kendine istek gönderemezsin')
        return
      }

      const alreadyFriend = await areFriends(uid, receiverId)
      if (alreadyFriend) {
        setAddError('Zaten arkadaşsınız')
        setSearchMeta({ isFriend: true, pendingSent: false })
        return
      }

      const already = [...friends, ...sentRequests].some((f) => {
        if ('friend_id' in f) return f.friend_id === receiverId
        if ('receiver_id' in f) return (f as FriendRequest).receiver_id === receiverId
        return false
      })
      if (already) {
        setAddError('Zaten arkadaşsınız veya istek gönderildi')
        return
      }

      await sendFriendRequest(uid, receiverId)

      const [sentRes, friendsRes] = await Promise.all([
        fetchSentRequests(uid),
        fetchFriends(uid),
      ])
      if (sentRes.error) throw sentRes.error
      setSentRequests(sentRes.data ?? [])
      if (friendsRes.data) setFriends(friendsRes.data)
      setSearchMeta({ isFriend: false, pendingSent: true })
      setSearchResult(undefined)
      setSearchQuery('')
    } catch (err: unknown) {
      console.error('İstek gönderme hatası:', err)
      const message = getSupabaseErrorMessage(err, 'İstek gönderilemedi')
      if (message.includes('duplicate') || message.includes('unique')) {
        setAddError('Bu kullanıcıya zaten istek gönderdin')
      } else {
        setAddError(message)
      }
    } finally {
      setSendingRequest(false)
    }
  }

  const completeFriendAccept = async (req: FriendRequest) => {
    setResponding(true)
    setAddError('')
    try {
      await respondToFriendRequest(req.id, true)
      if (userId) await refreshFriendData(userId)
    } catch (err: unknown) {
      console.error('İstek kabul hatası:', err)
      setAddError(getSupabaseErrorMessage(err, 'İstek kabul edilemedi'))
    } finally {
      setResponding(false)
    }
  }

  const handleRespond = async (req: FriendRequest, accept: boolean) => {
    if (!accept) {
      setResponding(true)
      try {
        await respondToFriendRequest(req.id, false)
        if (userId) await refreshFriendData(userId)
      } catch (err: unknown) {
        setAddError(getSupabaseErrorMessage(err, 'İşlem başarısız'))
      } finally {
        setResponding(false)
      }
      return
    }

    await completeFriendAccept(req)
  }

  const handleRemoveFriend = async () => {
    if (!confirmRemoveFriend || !userId) return
    setRemovingFriend(true)
    setAddError('')
    try {
      await removeFriend(confirmRemoveFriend.friendId)
      await refreshFriendData(userId)
      setConfirmRemoveFriend(null)
    } catch (err: unknown) {
      setAddError(getSupabaseErrorMessage(err, 'Arkadaş silinemedi'))
    } finally {
      setRemovingFriend(false)
    }
  }

  const handleLogout = async () => {
    await signOut()
    navigate({ to: '/auth' })
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const displayName = profile?.display_name ?? profile?.username ?? 'Kullanıcı'

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col pb-24">
      {/* Header */}
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-3 max-w-lg mx-auto">
          <BackButton />
          <h1 className="text-white font-bold">Profilim</h1>
          <button onClick={handleLogout} className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#718096]">
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
        {/* Profile card */}
        <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => fileRef.current?.click()} className="relative shrink-0">
              <PlayerAvatar name={displayName} avatarUrl={profile?.avatar_url} size={72} />
              <div className="absolute bottom-0 right-0 bg-[#e94560] rounded-full p-1 border-2 border-[#16213e]">
                <Camera size={10} className="text-white" />
              </div>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

            <div className="flex-1 min-w-0">
              {editMode ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Adın"
                    className="bg-[#0f3460]/50 border border-[#2d3748] rounded-lg py-1.5 px-3 text-white text-sm w-full focus:outline-none focus:border-[#e94560]"
                  />
                  <input
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Bio (opsiyonel)"
                    maxLength={100}
                    className="bg-[#0f3460]/50 border border-[#2d3748] rounded-lg py-1.5 px-3 text-[#a0aec0] text-xs w-full focus:outline-none focus:border-[#e94560]"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => { setEditMode(false); setEditError('') }} className="flex-1 bg-[#0f3460] text-[#a0aec0] text-xs font-semibold py-1.5 rounded-lg">İptal</button>
                    <button onClick={handleSaveEdit} disabled={editSaving} className="flex-1 bg-[#e94560] text-white text-xs font-bold py-1.5 rounded-lg">Kaydet</button>
                  </div>
                  {editError && <p className="text-red-400 text-xs">{editError}</p>}
                </div>
              ) : (
                <>
                  <p className="text-white font-bold text-base truncate">{displayName}</p>
                  {profile?.username && <p className="text-[#718096] text-sm">@{profile.username}</p>}
                  {profile?.bio && <p className="text-[#a0aec0] text-xs mt-1">{profile.bio}</p>}
                  <button
                    onClick={() => { setEditName(profile?.display_name ?? ''); setEditBio(profile?.bio ?? ''); setEditMode(true) }}
                    className="flex items-center gap-1 mt-2 text-[#a0aec0] text-xs"
                  >
                    <Pencil size={11} /> Düzenle
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="bg-[#0f3460]/40 rounded-xl p-2.5 text-center">
                <p className="text-white font-bold text-lg">{friends.length}</p>
                <p className="text-[#718096] text-[10px]">Arkadaş</p>
              </div>
              <div className="bg-[#0f3460]/40 rounded-xl p-2.5 text-center">
                <p className="text-white font-bold text-lg">{groups.length}</p>
                <p className="text-[#718096] text-[10px]">Grup</p>
              </div>
            </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#16213e] border border-[#2d3748] rounded-xl p-1 mb-4">
          {(['stats', 'groups', 'friends'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === t ? 'bg-[#e94560] text-white' : 'text-[#718096]'}`}
            >
              {t === 'stats' ? 'İstatistikler' : t === 'groups' ? 'Gruplarım' : 'Arkadaşlar'}
              {t === 'friends' && pendingRequests.length > 0 && (
                <span className="ml-1 inline-flex w-4 h-4 items-center justify-center bg-red-500 text-white text-[9px] rounded-full">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Stats tab */}
        {activeTab === 'stats' && userId && profile?.display_name && (
          <PlayerStats
            playerName={profile.display_name}
            ownerUserId={userId}
            showHistory={false}
          />
        )}
        {activeTab === 'stats' && !profile?.display_name && (
          <p className="text-[#718096] text-center py-8">Profil adını ayarla</p>
        )}

        {/* Groups tab */}
        {activeTab === 'groups' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate({ to: '/groups' })}
              className="flex items-center justify-center gap-2 bg-[#e94560] text-white font-bold py-3.5 rounded-xl"
            >
              <Users size={18} /> Grupları Yönet
            </button>
            {groups.length === 0 ? (
              <p className="text-[#718096] text-center py-8">Henüz bir gruba üye değilsin</p>
            ) : (
              groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => navigate({ to: '/group/$groupId', params: { groupId: g.id } })}
                  className="bg-[#16213e] border border-[#2d3748] rounded-xl p-4 text-left flex items-center gap-3"
                >
                  <div className="w-10 h-10 bg-[#0f3460] rounded-xl flex items-center justify-center text-xl">👥</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{g.name}</p>
                    <p className="text-[#718096] text-xs">{g.invite_code}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Friends tab */}
        {activeTab === 'friends' && (
          <div className="flex flex-col gap-4">
            {pendingRequests.length > 0 && (
              <div className="mb-2">
                <h3 className="text-[#f5a623] text-sm font-semibold mb-2">
                  📬 Bekleyen İstekler ({pendingRequests.length})
                </h3>
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center gap-3 p-3 bg-[#16213e] border border-[#2d3748] rounded-xl mb-2"
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
                      <p className="text-[#718096] text-xs">
                        @{req.sender_profile?.username}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRespond(req, true)}
                      disabled={responding}
                      className="px-3 py-1 bg-green-600 disabled:opacity-50 rounded-lg text-xs text-white font-semibold"
                    >
                      ✓ Kabul
                    </button>
                    <button
                      onClick={() => handleRespond(req, false)}
                      disabled={responding}
                      className="px-3 py-1 bg-red-700 disabled:opacity-50 rounded-lg text-xs text-white font-semibold"
                    >
                      ✗ Red
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search & add */}
            <div>
              <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">Arkadaş Ekle</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096] text-sm">@</span>
                  <input
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setSearchResult(undefined)
                      setSearchMeta({ isFriend: false, pendingSent: false })
                      setAddError('')
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchUser()}
                    placeholder="kullaniciadi"
                    className="w-full bg-[#0f3460]/50 border border-[#2d3748] rounded-xl py-2.5 pl-7 pr-3 text-white placeholder-[#718096] text-sm focus:outline-none focus:border-[#e94560]"
                  />
                </div>
                <button onClick={handleSearchUser} disabled={searchLoading} className="bg-[#e94560] text-white px-4 rounded-xl text-sm font-bold">
                  {searchLoading ? '...' : 'Ara'}
                </button>
              </div>
              {addError && <p className="text-red-400 text-xs mt-1">{addError}</p>}
              {searchResult === 'not_found' && <p className="text-[#718096] text-xs mt-2">Kullanıcı bulunamadı</p>}
              {searchResult && searchResult !== 'not_found' && (
                <div className="mt-2 bg-[#16213e] border border-[#2d3748] rounded-xl p-3 flex items-center gap-3">
                  <PlayerAvatar name={searchResult.display_name ?? '?'} avatarUrl={searchResult.avatar_url} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold">{searchResult.display_name}</p>
                    <p className="text-[#718096] text-xs">@{searchResult.username}</p>
                  </div>
                  {searchMeta.isFriend ? (
                    <span className="text-green-400 text-xs font-semibold px-2">✓ Arkadaşsın</span>
                  ) : searchMeta.pendingSent ? (
                    <span className="text-[#718096] text-xs font-medium px-2">İstek gönderildi</span>
                  ) : (
                    <button
                      onClick={() => handleSendRequest(searchResult.id!)}
                      disabled={sendingRequest}
                      className="flex items-center gap-1 bg-[#e94560] disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
                    >
                      <UserPlus size={12} /> {sendingRequest ? '...' : 'İstek Gönder'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {friends.length > 0 && (
              <div>
                <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">
                  🤝 Arkadaşlar ({friends.length})
                </p>
                {friends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center gap-3 p-3 border-b border-[#2d3748]"
                  >
                    <PlayerAvatar
                      name={friend.friend_profile?.display_name ?? '?'}
                      avatarUrl={friend.friend_profile?.avatar_url}
                      size={40}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {friend.friend_profile?.display_name}
                      </p>
                      <p className="text-[#718096] text-sm">
                        @{friend.friend_profile?.username}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setConfirmRemoveFriend({
                          friendId: friend.friend_id,
                          name: friend.friend_profile?.display_name ?? 'Arkadaş',
                        })
                      }
                      className="text-[#718096] hover:text-red-400 p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {localPlayers.length > 0 && (
              <div>
                <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">
                  👤 Yerel Oyuncular ({localPlayers.length})
                </p>
                {localPlayers.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center gap-3 p-3 border-b border-[#2d3748]"
                  >
                    <PlayerAvatar
                      name={player.name}
                      avatarUrl={player.avatar_url}
                      size={40}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{player.name}</p>
                      <p className="text-[#718096] text-xs">Yerel oyuncu</p>
                    </div>
                    <button
                      onClick={() => navigate({ to: '/player/$playerId', params: { playerId: player.id } })}
                      className="text-[#718096] hover:text-white px-2"
                    >
                      →
                    </button>
                  </div>
                ))}
              </div>
            )}

            {sentRequests.length > 0 && (
              <div>
                <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">Gönderilen İstekler</p>
                <div className="flex flex-col gap-2">
                  {sentRequests.map((req) => (
                    <div key={req.id} className="bg-[#16213e] border border-[#2d3748] rounded-xl p-3 flex items-center gap-3 opacity-60">
                      <PlayerAvatar name={req.receiver_profile?.display_name ?? '?'} avatarUrl={req.receiver_profile?.avatar_url} size={36} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{req.receiver_profile?.display_name}</p>
                        <p className="text-[#718096] text-xs">Yanıt bekleniyor…</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {friends.length === 0 && localPlayers.length === 0 && pendingRequests.length === 0 && (
              <p className="text-[#718096] text-center py-8">Henüz arkadaşın yok</p>
            )}
          </div>
        )}
      </div>

      {/* Arkadaş silme onayı */}
      {confirmRemoveFriend && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 pb-safe-bottom">
          <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-5 w-full max-w-sm mb-4 sm:mb-0">
            <h3 className="text-white font-bold text-base mb-2">Arkadaşı sil</h3>
            <p className="text-[#a0aec0] text-sm mb-5">
              <span className="text-white font-medium">{confirmRemoveFriend.name}</span>
              {' '}adlı kişiyi arkadaş listenden kaldırmak istediğine emin misin? Her iki taraftan da silinecek.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleRemoveFriend}
                disabled={removingFriend}
                className="flex-1 bg-red-600 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl"
              >
                {removingFriend ? '...' : 'Evet, sil'}
              </button>
              <button
                onClick={() => setConfirmRemoveFriend(null)}
                disabled={removingFriend}
                className="flex-1 bg-[#0f3460] text-[#a0aec0] text-sm font-semibold py-2.5 rounded-xl"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
