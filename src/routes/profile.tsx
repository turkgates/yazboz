import { createFileRoute, Link, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { uploadAvatar, signOut, getSessionUser, getLocalSession } from '@/lib/supabase'
import {
  fetchUserProfile,
  upsertProfile,
  fetchFriends,
  fetchMyGroups,
} from '@/lib/socialSupabase'
import type { Group, Profile } from '@/types'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { BackButton } from '@/components/layout/BackButton'
import { Camera, LogOut, Pencil, Users } from 'lucide-react'
import { PlayerStats } from '@/components/PlayerStats'

export const Route = createFileRoute('/profile')({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => ({
    tab: search.tab === 'stats' || search.tab === 'groups' ? search.tab : undefined,
  }),
  beforeLoad: async () => {
    const session = await getLocalSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: ProfilePage,
})

type Tab = 'stats' | 'groups'

function ProfilePage() {
  const navigate = useNavigate()
  const { tab: tabFromSearch } = Route.useSearch()
  const fileRef = useRef<HTMLInputElement>(null)

  const [userId, setUserId] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>(tabFromSearch ?? 'stats')
  const [loading, setLoading] = useState(true)

  // Groups
  const [groups, setGroups] = useState<Group[]>([])

  const [friendCount, setFriendCount] = useState(0)

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  useEffect(() => {
    if (tabFromSearch) setActiveTab(tabFromSearch)
  }, [tabFromSearch])

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    const { data: { user } } = await getSessionUser()
    if (!user) return
    setUserId(user.id)

    const [profileRes] = await Promise.all([
      fetchUserProfile(user.id),
    ])

    if (profileRes.data) setProfile(profileRes.data)
    setLoading(false)

    const [groupsRes, friendsRes] = await Promise.all([
      fetchMyGroups(user.id),
      fetchFriends(user.id),
    ])
    if (groupsRes.error) console.error('Profil gruplar hatası:', groupsRes.error)
    setGroups(groupsRes.data ?? [])
    setFriendCount(friendsRes.data?.length ?? 0)
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
              <Link to="/friends" className="bg-[#0f3460]/40 rounded-xl p-2.5 text-center">
                <p className="text-white font-bold text-lg">{friendCount}</p>
                <p className="text-[#718096] text-[10px]">Arkadaş</p>
              </Link>
              <Link to="/groups" className="bg-[#0f3460]/40 rounded-xl p-2.5 text-center">
                <p className="text-white font-bold text-lg">{groups.length}</p>
                <p className="text-[#718096] text-[10px]">Grup</p>
              </Link>
            </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#16213e] border border-[#2d3748] rounded-xl p-1 mb-4">
          {(['stats', 'groups'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === t ? 'bg-[#e94560] text-white' : 'text-[#718096]'}`}
            >
              {t === 'stats' ? 'İstatistikler' : 'Gruplarım'}
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

      </div>
    </div>
  )
}
