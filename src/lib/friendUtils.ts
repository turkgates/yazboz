import { supabase } from '@/lib/supabase'
import {
  sendFriendRequest as rpcSendFriendRequest,
  respondToFriendRequest,
} from '@/lib/socialSupabase'
import { dispatchMergeModal, sendNotification } from '@/lib/notificationUtils'
import type { Profile } from '@/types'

export const PLAYERS_REFRESH_EVENT = 'yazboz-players-refresh'

export function dispatchPlayersRefresh() {
  window.dispatchEvent(new CustomEvent(PLAYERS_REFRESH_EVENT))
}

async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Oturum bulunamadı')
  return user.id
}

async function getProfile(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle<Pick<Profile, 'display_name' | 'avatar_url'>>()
  return data
}

export async function updateCrossAvatars(
  userId: string,
  friendId: string,
  friendAvatarUrl: string | null
) {
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .single<{ avatar_url: string | null }>()

  await supabase
    .from('players')
    .update({ avatar_url: myProfile?.avatar_url ?? null })
    .eq('user_id', friendId)
    .eq('linked_user_id', userId)

  await supabase
    .from('players')
    .update({ avatar_url: friendAvatarUrl })
    .eq('user_id', userId)
    .eq('linked_user_id', friendId)
}

export async function addFriendToPlayersList(
  friendUserId: string,
  friendName: string,
  friendAvatarUrl: string | null
) {
  const currentUserId = await getCurrentUserId()

  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', currentUserId)
    .eq('linked_user_id', friendUserId)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('players')
      .update({
        name: friendName,
        avatar_url: friendAvatarUrl,
      })
      .eq('id', existing.id)
    return
  }

  // Aynı adlı yerel oyuncuyu bağlamak onun oyunlarını onaysız olarak arkadaşa yazardı
  const { data: sameNamePlayer } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', currentUserId)
    .eq('name', friendName)
    .is('linked_user_id', null)
    .maybeSingle()

  if (sameNamePlayer) return

  const { error } = await supabase.from('players').insert({
    user_id: currentUserId,
    name: friendName,
    avatar_url: friendAvatarUrl,
    linked_user_id: friendUserId,
  })

  if (error) throw error
}

export async function sendFriendRequest(receiverId: string, _receiverName: string) {
  const userId = await getCurrentUserId()
  const { data: requestId, error } = await rpcSendFriendRequest(userId, receiverId)
  if (error) throw error
  if (!requestId) return

  const { data: req } = await supabase
    .from('friend_requests')
    .select('status, sender_id, receiver_id')
    .eq('id', requestId)
    .maybeSingle<{ status: string; sender_id: string; receiver_id: string }>()

  if (!req) return

  if (req.status === 'pending') {
    await sendNotification(receiverId, 'friend_request')
    return
  }

  if (req.status === 'accepted') {
    const friendId = req.receiver_id === userId ? req.sender_id : req.receiver_id
    const friendProfile = await getProfile(friendId)
    await onFriendshipEstablished(userId, friendId, friendProfile)
  }
}

export async function onFriendshipEstablished(
  currentUserId: string,
  friendId: string,
  friendProfile: Pick<Profile, 'display_name' | 'avatar_url'> | null
) {
  const friendName = friendProfile?.display_name ?? 'Arkadaş'
  const friendAvatarUrl = friendProfile?.avatar_url ?? null

  await sendNotification(friendId, 'friend_accepted')

  await updateCrossAvatars(currentUserId, friendId, friendAvatarUrl)
  return checkAndPromptMerge(currentUserId, friendId, friendName, friendAvatarUrl)
}

export async function acceptFriendRequest(
  requestId: string,
  senderId: string,
  senderName: string,
  senderAvatarUrl: string | null
): Promise<MergePromptTarget | null> {
  const result = await respondToFriendRequest(requestId, true)
  if (!result || !('accepted' in result) || !result.accepted) return null

  const userId = await getCurrentUserId()

  await sendNotification(senderId, 'friend_accepted')

  await updateCrossAvatars(userId, senderId, senderAvatarUrl)
  return checkAndPromptMerge(userId, senderId, senderName, senderAvatarUrl, {
    openModal: false,
  })
}

export interface MergePromptTarget {
  userId: string
  name: string
  avatarUrl: string | null
}

export async function checkAndPromptMerge(
  currentUserId: string,
  friendUserId: string,
  friendName: string,
  friendAvatarUrl: string | null = null,
  options?: { openModal?: boolean }
): Promise<MergePromptTarget | null> {
  const { data: existing } = await supabase
    .from('merge_requests')
    .select('status')
    .eq('requester_id', currentUserId)
    .eq('target_id', friendUserId)
    .maybeSingle<{ status: string }>()

  if (existing?.status === 'accepted' || existing?.status === 'skipped' || existing?.status === 'pending') {
    return null
  }

  const { data: linkedPlayer } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', currentUserId)
    .eq('linked_user_id', friendUserId)
    .maybeSingle()

  if (linkedPlayer) return null

  const avatarUrl =
    friendAvatarUrl ?? (await getProfile(friendUserId))?.avatar_url ?? null

  if (options?.openModal !== false) {
    dispatchMergeModal(friendUserId)
  }

  return { userId: friendUserId, name: friendName, avatarUrl }
}

export async function skipMerge(friendUserId: string) {
  const userId = await getCurrentUserId()
  const profile = await getProfile(friendUserId)
  if (profile?.display_name) {
    await addFriendToPlayersList(
      friendUserId,
      profile.display_name,
      profile.avatar_url ?? null
    )
  }
  await supabase.from('merge_requests').upsert(
    {
      requester_id: userId,
      target_id: friendUserId,
      status: 'skipped',
    },
    { onConflict: 'requester_id,target_id' }
  )
  dispatchPlayersRefresh()
}
