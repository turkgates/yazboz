import { supabase } from '@/lib/supabase'
import type { Friend, FriendRequest, Group, GroupMember, Profile, SavedPlayer } from '@/types'

// ── Profiles ──────────────────────────────────────────────────────────────

export async function fetchUserProfile(userId: string) {
  return supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single<Profile>()
}

export async function upsertProfile(
  userId: string,
  data: Partial<Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'bio'>>
) {
  return supabase
    .from('profiles')
    .upsert({ id: userId, ...data } as Record<string, unknown>)
    .select()
    .single<Profile>()
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .maybeSingle()
  return !data
}

export async function searchProfileByUsername(username: string) {
  return supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('username', username)
    .maybeSingle<Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>>()
}

// ── Groups ────────────────────────────────────────────────────────────────

export async function fetchMyGroups(userId: string) {
  const { data: memberships, error } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
  if (error || !memberships?.length) return { data: [] as Group[], error }

  const groupIds = memberships.map((m) => m.group_id)
  return supabase
    .from('groups')
    .select('*')
    .in('id', groupIds)
    .order('created_at', { ascending: false })
    .returns<Group[]>()
}

export async function fetchGroupById(groupId: string) {
  return supabase.from('groups').select('*').eq('id', groupId).single<Group>()
}

export async function fetchGroupMembers(groupId: string) {
  return supabase
    .from('group_members')
    .select('*, profiles(username, display_name, avatar_url)')
    .eq('group_id', groupId)
    .returns<GroupMember[]>()
}

export async function fetchGroupGamesCount(groupId: string): Promise<number> {
  const { count } = await supabase
    .from('group_games')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', groupId)
  return count ?? 0
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

async function findAvailableInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const inviteCode = generateInviteCode()
    const { data } = await supabase
      .from('groups')
      .select('id')
      .eq('invite_code', inviteCode)
      .maybeSingle()
    if (!data) return inviteCode
  }
  throw new Error('Davet kodu oluşturulamadı, tekrar deneyin')
}

export async function createGroup(name: string, ownerId: string): Promise<Group> {
  const inviteCode = await findAvailableInviteCode()

  const { data: group, error } = await supabase
    .from('groups')
    .insert({ name, owner_id: ownerId, invite_code: inviteCode })
    .select()
    .single<Group>()

  if (error || !group) {
    console.error('Grup oluşturma hatası:', error)
    throw error ?? new Error('Grup oluşturulamadı')
  }

  const { error: memberError } = await supabase.from('group_members').insert({
    group_id: group.id,
    user_id: ownerId,
    role: 'admin',
  })

  if (memberError) {
    console.error('Üye ekleme hatası:', memberError)
    throw memberError
  }

  return group
}

export async function joinGroupByCode(code: string, userId: string): Promise<Group> {
  const { data: group } = await supabase
    .from('groups')
    .select('*')
    .eq('invite_code', code.toUpperCase())
    .single<Group>()
  if (!group) throw new Error('Geçersiz davet kodu')

  const { count } = await supabase
    .from('group_members')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', group.id)
  if ((count ?? 0) >= 10) throw new Error('Grup dolu (max 10 üye)')

  const { error } = await supabase
    .from('group_members')
    .insert({ group_id: group.id, user_id: userId, role: 'member' })
  if (error && !error.message.includes('unique')) throw error

  await syncGroupMembersToPlayersList(group.id, userId)
  return group
}

export async function leaveGroup(groupId: string, userId: string) {
  return supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
}

export async function syncGroupMembersToPlayersList(groupId: string, currentUserId: string) {
  const { data: members } = await supabase
    .from('group_members')
    .select('user_id, profiles(display_name, avatar_url)')
    .eq('group_id', groupId)
    .neq('user_id', currentUserId)

  if (!members) return

  for (const member of members) {
    const profile = (member as unknown as { profiles: { display_name: string; avatar_url: string } | null }).profiles
    if (!profile?.display_name) continue

    const { data: existing } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', currentUserId)
      .eq('linked_user_id', member.user_id)
      .maybeSingle()

    if (!existing) {
      await supabase.from('players').insert({
        user_id: currentUserId,
        name: profile.display_name,
        avatar_url: profile.avatar_url ?? null,
        linked_user_id: member.user_id,
      } as Partial<SavedPlayer>)
    }
  }
}

export async function addGameToGroups(gameId: string, players: string[], currentUserId: string) {
  const { data: memberships } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', currentUserId)
  if (!memberships?.length) return

  for (const { group_id } of memberships) {
    const { data: groupMembers } = await supabase
      .from('group_members')
      .select('user_id, profiles(display_name)')
      .eq('group_id', group_id)

    if (!groupMembers) continue
    const groupNames = groupMembers
      .map((m) => {
        const p = (m as unknown as { profiles: { display_name: string } | null }).profiles
        return p?.display_name?.toLowerCase()
      })
      .filter(Boolean)

    const playingGroupMembers = players.filter((p) => groupNames.includes(p.toLowerCase()))
    if (playingGroupMembers.length >= 2) {
      await supabase
        .from('group_games')
        .upsert({ group_id, game_id: gameId })
        .eq('group_id', group_id)
        .eq('game_id', gameId)
    }
  }
}

// ── Friends ───────────────────────────────────────────────────────────────

export async function fetchFriends(userId: string) {
  return supabase
    .from('friends')
    .select('*, friend_profile:profiles!friends_friend_id_fkey(username, display_name, avatar_url)')
    .eq('user_id', userId)
    .returns<Friend[]>()
}

export async function fetchPendingRequests(userId: string) {
  return supabase
    .from('friend_requests')
    .select('*, sender_profile:profiles!friend_requests_sender_id_fkey(username, display_name, avatar_url)')
    .eq('receiver_id', userId)
    .eq('status', 'pending')
    .returns<FriendRequest[]>()
}

export async function fetchSentRequests(userId: string) {
  return supabase
    .from('friend_requests')
    .select('*, receiver_profile:profiles!friend_requests_receiver_id_fkey(username, display_name, avatar_url)')
    .eq('sender_id', userId)
    .eq('status', 'pending')
    .returns<FriendRequest[]>()
}

export async function countPendingRequests(userId: string): Promise<number> {
  const { count } = await supabase
    .from('friend_requests')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', userId)
    .eq('status', 'pending')
  return count ?? 0
}

export async function sendFriendRequest(senderId: string, receiverId: string) {
  return supabase.from('friend_requests').insert({
    sender_id: senderId,
    receiver_id: receiverId,
    status: 'pending',
  })
}

export async function respondToFriendRequest(
  requestId: string,
  accept: boolean,
  senderId: string,
  receiverId: string
) {
  await supabase
    .from('friend_requests')
    .update({ status: accept ? 'accepted' : 'rejected' })
    .eq('id', requestId)

  if (accept) {
    await supabase.from('friends').insert([
      { user_id: senderId, friend_id: receiverId },
      { user_id: receiverId, friend_id: senderId },
    ])
    await addFriendToPlayersList(senderId, receiverId)
    await addFriendToPlayersList(receiverId, senderId)
  }
}

async function addFriendToPlayersList(currentUserId: string, friendUserId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', friendUserId)
    .maybeSingle<Pick<Profile, 'display_name' | 'avatar_url'>>()
  if (!profile?.display_name) return

  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', currentUserId)
    .eq('linked_user_id', friendUserId)
    .maybeSingle()

  if (!existing) {
    await supabase.from('players').insert({
      user_id: currentUserId,
      name: profile.display_name,
      avatar_url: profile.avatar_url ?? null,
      linked_user_id: friendUserId,
    } as Partial<SavedPlayer>)
  }
}

export async function removeFriend(userId: string, friendId: string) {
  await supabase.from('friends').delete().eq('user_id', userId).eq('friend_id', friendId)
  await supabase.from('friends').delete().eq('user_id', friendId).eq('friend_id', userId)
}

// ── Group member suggestions for new-game ────────────────────────────────

export interface PlayerSuggestion {
  name: string
  avatarUrl?: string | null
  isGroupMember?: boolean
  groupName?: string
  isFriend?: boolean
  linkedUserId?: string
}

export async function fetchPlayerSuggestionsWithSocial(
  userId: string,
  query: string
): Promise<PlayerSuggestion[]> {
  if (!query.trim()) return []

  const [playersRes, groupsRes] = await Promise.all([
    supabase
      .from('players')
      .select('id, name, avatar_url, linked_user_id')
      .eq('user_id', userId)
      .ilike('name', `${query}%`)
      .limit(8),
    fetchMyGroups(userId),
  ])

  const players = playersRes.data ?? []

  const groupMemberMap: Record<string, string> = {}
  for (const group of (groupsRes.data ?? [])) {
    const { data: members } = await fetchGroupMembers(group.id)
    for (const m of members ?? []) {
      const name = m.profiles?.display_name
      if (name) groupMemberMap[name] = group.name
    }
  }

  return players.map((p) => ({
    name: p.name,
    avatarUrl: p.avatar_url,
    isGroupMember: !!groupMemberMap[p.name],
    groupName: groupMemberMap[p.name],
    linkedUserId: p.linked_user_id ?? undefined,
  }))
}
