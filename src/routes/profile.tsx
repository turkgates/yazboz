import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { supabase, uploadAvatar } from '@/lib/supabase'
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
} from '@/lib/socialSupabase'
import type { Friend, FriendRequest, Group, Profile } from '@/types'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { BackButton } from '@/components/layout/BackButton'
import { Camera, LogOut, Pencil, UserPlus, Users, X } from 'lucide-react'
import { computePlayerProfileStats } from '@/lib/statsUtils'
import { fetchPlayerGamesWithRounds, signOut } from '@/lib/supabase'

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

  // Stats
  const [stats, setStats] = useState<ReturnType<typeof computePlayerProfileStats> | null>(null)

  // Groups
  const [groups, setGroups] = useState<Group[]>([])

  // Friends
  const [friends, setFriends] = useState<Friend[]>([])
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([])
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([])

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Add friend search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState<Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null | 'not_found'>()
  const [searchLoading, setSearchLoading] = useState(false)
  const [addError, setAddError] = useState('')

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

    const displayName = profileRes.data?.display_name ?? ''
    if (displayName) {
      const { games, roundsByGame } = await fetchPlayerGamesWithRounds(user.id, displayName)
      setStats(computePlayerProfileStats(displayName, games, roundsByGame))
    }

    const [groupsRes, friendsRes, pendingRes, sentRes] = await Promise.all([
      fetchMyGroups(user.id),
      fetchFriends(user.id),
      fetchPendingRequests(user.id),
      fetchSentRequests(user.id),
    ])
    setGroups(groupsRes.data ?? [])
    setFriends(friendsRes.data ?? [])
    setPendingRequests(pendingRes.data ?? [])
    setSentRequests(sentRes.data ?? [])
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
    await upsertProfile(userId, { display_name: editName.trim(), bio: editBio.trim() || undefined })
    setProfile((p) => p ? { ...p, display_name: editName.trim(), bio: editBio.trim() || null } : p)
    setEditMode(false)
    setEditSaving(false)
  }

  const handleSearchUser = async () => {
    if (!searchQuery.trim()) return
    setSearchLoading(true)
    setAddError('')
    const { data } = await searchProfileByUsername(searchQuery.trim())
    setSearchResult(data ?? 'not_found')
    setSearchLoading(false)
  }

  const handleSendRequest = async (receiverId: string) => {
    setAddError('')
    const already = [...friends, ...sentRequests].some((f) => {
      if ('friend_id' in f) return f.friend_id === receiverId
      if ('receiver_id' in f) return (f as FriendRequest).receiver_id === receiverId
      return false
    })
    if (already) { setAddError('Zaten arkadaşsınız veya istek gönderildi'); return }
    await sendFriendRequest(userId, receiverId)
    const sentRes = await fetchSentRequests(userId)
    setSentRequests(sentRes.data ?? [])
    setSearchResult(undefined)
    setSearchQuery('')
  }

  const handleRespond = async (req: FriendRequest, accept: boolean) => {
    await respondToFriendRequest(req.id, accept, req.sender_id, req.receiver_id)
    const [fr, pend] = await Promise.all([fetchFriends(userId), fetchPendingRequests(userId)])
    setFriends(fr.data ?? [])
    setPendingRequests(pend.data ?? [])
  }

  const handleRemoveFriend = async (friendId: string) => {
    await removeFriend(userId, friendId)
    setFriends((prev) => prev.filter((f) => f.friend_id !== friendId))
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
                    <button onClick={() => setEditMode(false)} className="flex-1 bg-[#0f3460] text-[#a0aec0] text-xs font-semibold py-1.5 rounded-lg">İptal</button>
                    <button onClick={handleSaveEdit} disabled={editSaving} className="flex-1 bg-[#e94560] text-white text-xs font-bold py-1.5 rounded-lg">Kaydet</button>
                  </div>
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

          <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="bg-[#0f3460]/40 rounded-xl p-2.5 text-center">
                <p className="text-white font-bold text-lg">{stats?.totalGames ?? 0}</p>
                <p className="text-[#718096] text-[10px]">Oyun</p>
              </div>
              <div className="bg-[#0f3460]/40 rounded-xl p-2.5 text-center">
                <p className="text-[#f5a623] font-bold text-lg">{stats?.wins ?? 0}</p>
                <p className="text-[#718096] text-[10px]">Kazanma</p>
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
        {activeTab === 'stats' && stats && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Toplam Oyun', value: stats.totalGames, color: 'text-white' },
                { label: 'Kazanma', value: stats.wins, color: 'text-[#f5a623]' },
                { label: 'Toplam El', value: stats.totalRounds, color: 'text-white' },
                { label: 'Kazanma %', value: `${stats.winPercentage}%`, color: 'text-green-400' },
              ].map((s) => (
                <div key={s.label} className="bg-[#16213e] border border-[#2d3748] rounded-xl p-3">
                  <p className="text-[#718096] text-xs mb-1">{s.label}</p>
                  <p className={`${s.color} font-bold text-xl`}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'stats' && !stats && (
          <p className="text-[#718096] text-center py-8">Henüz oyun kaydı yok</p>
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
                      className="px-3 py-1 bg-green-600 rounded-lg text-xs text-white font-semibold"
                    >
                      ✓ Kabul
                    </button>
                    <button
                      onClick={() => handleRespond(req, false)}
                      className="px-3 py-1 bg-red-700 rounded-lg text-xs text-white font-semibold"
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
                    onChange={(e) => { setSearchQuery(e.target.value); setSearchResult(undefined); setAddError('') }}
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
                  <button onClick={() => handleSendRequest(searchResult.id!)} className="flex items-center gap-1 bg-[#e94560] text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                    <UserPlus size={12} /> İstek Gönder
                  </button>
                </div>
              )}
            </div>

            {friends.length > 0 && (
              <div>
                <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">
                  Arkadaşlarım ({friends.length})
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
                      onClick={() => navigate({ to: '/players' })}
                      className="text-[#718096] hover:text-white px-2"
                      title="Oyuncular sayfasında gör"
                    >
                      →
                    </button>
                    <button
                      onClick={() => handleRemoveFriend(friend.friend_id)}
                      className="text-[#718096] hover:text-red-400 p-1"
                    >
                      <X size={14} />
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

            {friends.length === 0 && pendingRequests.length === 0 && (
              <p className="text-[#718096] text-center py-8">Henüz arkadaşın yok</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
