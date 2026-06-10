import { supabase } from '@/lib/supabase'
import type { Friend, FriendRequest, Group, GroupMember, Profile, SavedPlayer } from '@/types'

export function getSupabaseErrorMessage(err: unknown, fallback = 'Bir hata oluştu'): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = (err as { message: unknown }).message
    if (typeof msg === 'string' && msg.trim()) return msg
  }
  return fallback
}

// ── Profiles ──────────────────────────────────────────────────────────────

function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, '').toLowerCase()
}

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
  const payload: Record<string, unknown> = { id: userId, ...data }
  if (typeof payload.username === 'string') {
    payload.username = normalizeUsername(payload.username as string)
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single<Profile>()

  if (error) {
    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update(data as Record<string, unknown>)
      .eq('id', userId)
      .select()
      .single<Profile>()

    if (updateError) {
      console.error('Profil kaydetme hatası:', updateError)
      return { data: null, error: updateError }
    }
    return { data: updated, error: null }
  }

  return { data: profile, error: null }
}

export async function checkUsernameAvailable(
  username: string,
  excludeUserId?: string
): Promise<boolean> {
  const normalized = normalizeUsername(username)
  if (!normalized) return false

  const { data, error } = await supabase.rpc('check_username_available', {
    p_username: normalized,
    p_exclude_user_id: excludeUserId ?? null,
  })

  if (!error && typeof data === 'boolean') return data

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', normalized)
    .maybeSingle()

  if (!existing) return true
  if (excludeUserId && existing.id === excludeUserId) return true
  return false
}

export async function searchProfileByUsername(username: string) {
  const normalized = normalizeUsername(username)
  if (!normalized) return { data: null, error: null }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'search_profile_by_username',
    { p_username: normalized }
  )

  if (!rpcError) {
    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as
      | Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
      | undefined
    return { data: row ?? null, error: null }
  }

  console.error('Kullanıcı arama RPC hatası:', rpcError)
  return supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .ilike('username', normalized)
    .maybeSingle<Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>>()
}

// ── Groups ────────────────────────────────────────────────────────────────

export async function fetchMyGroups(userId: string) {
  const { data, error } = await supabase
    .from('group_members')
    .select(`
      role,
      joined_at,
      groups (
        id,
        name,
        invite_code,
        owner_id,
        created_at
      )
    `)
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })

  if (error) {
    console.error('fetchMyGroups error:', error)
    return { data: [] as Group[], error }
  }

  const groups: Group[] = []
  for (const row of data ?? []) {
    const g = row.groups as Group | Group[] | null
    const group = Array.isArray(g) ? g[0] : g
    if (group) {
      groups.push({ ...group, myRole: row.role as 'admin' | 'member' })
    }
  }

  return { data: groups, error: null }
}

export async function fetchGroupById(groupId: string) {
  return supabase.from('groups').select('*').eq('id', groupId).single<Group>()
}

export async function fetchGroupMembers(groupId: string) {
  const { data: members, error } = await supabase
    .from('group_members')
    .select('id, role, joined_at, user_id')
    .eq('group_id', groupId)

  if (error) {
    console.error('Üye hatası:', error)
    return { data: [] as GroupMember[], error }
  }

  const userIds = (members ?? []).map((m) => m.user_id)
  if (!userIds.length) return { data: [] as GroupMember[], error: null }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, username, avatar_url')
    .in('id', userIds)

  const profileMap = Object.fromEntries(
    (profiles ?? []).map((p) => [p.id, p])
  )

  const result: GroupMember[] = (members ?? []).map((m) => ({
    id: m.id,
    group_id: groupId,
    user_id: m.user_id,
    role: m.role as 'admin' | 'member',
    joined_at: m.joined_at,
    profiles: profileMap[m.user_id] ?? undefined,
  }))

  return { data: result, error: null }
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
  // Pre-check may fail under RLS; rely on insert retry for uniqueness
  return generateInviteCode()
}

export async function createGroup(name: string, ownerId: string): Promise<Group> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < 10; attempt++) {
    const inviteCode = await findAvailableInviteCode()

    const { data: group, error } = await supabase
      .from('groups')
      .insert({ name, owner_id: ownerId, invite_code: inviteCode })
      .select()
      .single<Group>()

    if (!error && group) {
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

    if (error?.code === '23505') {
      lastError = error
      continue
    }

    console.error('Grup oluşturma hatası:', error)
    throw error ?? new Error('Grup oluşturulamadı')
  }

  throw lastError ?? new Error('Davet kodu oluşturulamadı, tekrar deneyin')
}

export async function joinGroupByCode(code: string, userId: string): Promise<Group> {
  const normalizedCode = code.toUpperCase().trim()
  console.log('Kod aranıyor:', normalizedCode)

  const { data: lookupRows, error: groupError } = await supabase
    .rpc('lookup_group_by_invite_code', { p_code: normalizedCode })

  const group = (lookupRows as Pick<Group, 'id' | 'name' | 'invite_code'>[] | null)?.[0] ?? null
  console.log('Grup bulundu:', group, 'Hata:', groupError)

  if (groupError || !group) {
    throw new Error('Geçersiz davet kodu')
  }

  const { data: existing } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', group.id)
    .eq('user_id', userId)
    .maybeSingle()

  console.log('Mevcut üyelik:', existing)

  if (existing) {
    throw new Error('Zaten bu grubun üyesisin')
  }

  const { count } = await supabase
    .from('group_members')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', group.id)

  console.log('Üye sayısı:', count)

  if ((count ?? 0) >= 10) {
    throw new Error('Grup dolu (maksimum 10 üye)')
  }

  const { data: newMember, error: joinError } = await supabase
    .from('group_members')
    .insert({
      group_id: group.id,
      user_id: userId,
      role: 'member',
    })
    .select()
    .single()

  console.log('Katılma sonucu:', newMember, 'Hata:', joinError)

  if (joinError) {
    console.error('Katılma hatası detay:', joinError)
    throw new Error('Gruba katılınamadı: ' + joinError.message)
  }

  await syncGroupMembersToPlayersList(group.id, userId)

  return {
    id: group.id,
    name: group.name,
    invite_code: group.invite_code,
    owner_id: '',
    created_at: new Date().toISOString(),
    myRole: 'member',
  }
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
  const { data: rows, error } = await supabase
    .from('friends')
    .select('id, user_id, friend_id, created_at')
    .eq('user_id', userId)

  if (error) return { data: null, error }

  const friendIds = (rows ?? []).map((r) => r.friend_id)
  if (!friendIds.length) return { data: [] as Friend[], error: null }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', friendIds)

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

  const data: Friend[] = (rows ?? []).map((r) => ({
    ...r,
    friend_profile: profileMap[r.friend_id],
  }))

  return { data, error: null }
}

export async function fetchPendingRequests(userId: string) {
  const { data: rows, error } = await supabase
    .from('friend_requests')
    .select('id, sender_id, receiver_id, status, created_at')
    .eq('receiver_id', userId)
    .eq('status', 'pending')

  if (error) return { data: null, error }

  const senderIds = (rows ?? []).map((r) => r.sender_id)
  if (!senderIds.length) return { data: [] as FriendRequest[], error: null }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', senderIds)

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

  const data: FriendRequest[] = (rows ?? []).map((r) => ({
    ...r,
    status: r.status as FriendRequest['status'],
    sender_profile: profileMap[r.sender_id],
  }))

  return { data, error: null }
}

export async function fetchSentRequests(userId: string) {
  const { data: rows, error } = await supabase
    .from('friend_requests')
    .select('id, sender_id, receiver_id, status, created_at')
    .eq('sender_id', userId)
    .eq('status', 'pending')

  if (error) return { data: null, error }

  const receiverIds = (rows ?? []).map((r) => r.receiver_id)
  if (!receiverIds.length) return { data: [] as FriendRequest[], error: null }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', receiverIds)

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

  const data: FriendRequest[] = (rows ?? []).map((r) => ({
    ...r,
    status: r.status as FriendRequest['status'],
    receiver_profile: profileMap[r.receiver_id],
  }))

  return { data, error: null }
}

export async function countPendingRequests(userId: string): Promise<number> {
  const { count } = await supabase
    .from('friend_requests')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', userId)
    .eq('status', 'pending')
  return count ?? 0
}

export async function sendFriendRequest(_senderId: string, receiverId: string) {
  const { data: rpcId, error: rpcError } = await supabase.rpc('send_friend_request', {
    p_receiver_id: receiverId,
  })

  if (!rpcError) return { data: rpcId, error: null }

  console.error('send_friend_request RPC hatası:', rpcError)

  const rpcMissing =
    rpcError.code === 'PGRST202' ||
    rpcError.message?.includes('Could not find the function')

  if (rpcMissing) {
    throw new Error(
      'Arkadaşlık isteği sunucu fonksiyonu bulunamadı. Supabase\'de 014_fix_friend_request_insert_rls.sql migration\'ını çalıştırın.'
    )
  }

  throw rpcError
}

export async function respondToFriendRequest(requestId: string, accept: boolean) {
  const { data, error } = await supabase.rpc('respond_friend_request', {
    p_request_id: requestId,
    p_accept: accept,
  })

  if (error) {
    console.error('respond_friend_request RPC hatası:', error)
    throw error
  }

  return data as
    | { accepted: true; sender_id: string; receiver_id: string }
    | { accepted: false }
}

export async function areFriends(userId: string, otherId: string): Promise<boolean> {
  const { data } = await supabase
    .from('friends')
    .select('id')
    .eq('user_id', userId)
    .eq('friend_id', otherId)
    .maybeSingle()
  return !!data
}

export function findMatchingLocalPlayers(
  localPlayers: { id: string; name: string }[],
  friendDisplayName: string | null | undefined
) {
  if (!friendDisplayName?.trim()) return []
  const normalized = friendDisplayName.trim().toLowerCase()
  return localPlayers.filter((p) => {
    const name = p.name.trim().toLowerCase()
    return name === normalized || name.includes(normalized) || normalized.includes(name)
  })
}

export async function createLinkedFriendPlayer(currentUserId: string, friendUserId: string) {
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

  if (existing) return

  const { error } = await supabase.from('players').insert({
    user_id: currentUserId,
    name: profile.display_name,
    avatar_url: profile.avatar_url ?? null,
    linked_user_id: friendUserId,
  } as Partial<SavedPlayer>)
  if (error) throw error
}

export async function linkLocalPlayerToFriend(
  playerId: string,
  friendUserId: string,
  userId: string
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', friendUserId)
    .maybeSingle<Pick<Profile, 'avatar_url'>>()

  const { error } = await supabase
    .from('players')
    .update({
      linked_user_id: friendUserId,
      avatar_url: profile?.avatar_url ?? null,
    })
    .eq('id', playerId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function removeFriend(friendId: string) {
  const { error } = await supabase.rpc('remove_friend', {
    p_friend_id: friendId,
  })
  if (error) {
    console.error('remove_friend RPC hatası:', error)
    throw error
  }
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
