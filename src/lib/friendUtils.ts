import { supabase } from '@/lib/supabase'
import {
  sendFriendRequest as rpcSendFriendRequest,
  respondToFriendRequest,
} from '@/lib/socialSupabase'
import { dispatchMergeModal, sendNotification } from '@/lib/notificationUtils'
import { buildPlayerRename, renameKeys, renameValues } from '@/lib/playerRename'
import type { Profile } from '@/types'
import type { Game, Round } from '@/types'

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

  const { data: sameNamePlayer } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', currentUserId)
    .eq('name', friendName)
    .is('linked_user_id', null)
    .maybeSingle()

  if (sameNamePlayer) {
    await supabase
      .from('players')
      .update({
        linked_user_id: friendUserId,
        avatar_url: friendAvatarUrl,
      })
      .eq('id', sameNamePlayer.id)
    return
  }

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
  await sendNotification(friendId, 'merge_notify')

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

  if (existing?.status === 'accepted' || existing?.status === 'skipped') return null

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

  await sendNotification(friendUserId, 'merge_request')

  return { userId: friendUserId, name: friendName, avatarUrl }
}

export async function performMerge(
  localPlayerId: string,
  friendUserId: string,
  friendProfile: {
    display_name: string
    avatar_url: string | null
  }
) {
  const currentUserId = await getCurrentUserId()

  const { data: localPlayer, error: localError } = await supabase
    .from('players')
    .select('name')
    .eq('id', localPlayerId)
    .eq('user_id', currentUserId)
    .single<{ name: string }>()

  if (localError || !localPlayer?.name) {
    throw localError ?? new Error('Yerel oyuncu bulunamadı')
  }

  const oldName = localPlayer.name
  const newName = friendProfile.display_name

  console.log('Birleştiriliyor:', oldName, '→', newName)

  // Önce eller, sonra oyun, en son oyuncu: yarıda kesilirse birleştirme yeniden denenebilir
  if (oldName !== newName) {
    const { data: affectedGames, error: gamesError } = await supabase
      .from('games')
      .select('id, players, teams, game_type, game_subtype, banko_history')
      .eq('user_id', currentUserId)

    if (gamesError) throw gamesError

    for (const game of (affectedGames ?? []) as Game[]) {
      const playersArr = (game.players ?? []) as string[]
      if (!playersArr.includes(oldName)) continue

      // Aynı masada iki farklı kişi: birleştirmek skorlardan birini ezerdi
      if (playersArr.includes(newName)) {
        console.error('Oyun atlandı, iki isim de oyunda var:', game.id, oldName, newName)
        continue
      }

      const { players, teams, keyMap } = buildPlayerRename(game, oldName, newName)

      const { data: rounds, error: roundsError } = await supabase
        .from('rounds')
        .select('id, scores, banko_players, indicator_players')
        .eq('game_id', game.id)

      if (roundsError) throw roundsError

      for (const round of (rounds ?? []) as Pick<Round, 'id' | 'scores' | 'banko_players' | 'indicator_players'>[]) {
        const { error: roundError } = await supabase
          .from('rounds')
          .update({
            scores: renameKeys(round.scores ?? {}, keyMap),
            banko_players: round.banko_players && renameValues(round.banko_players, keyMap),
            indicator_players: round.indicator_players && renameValues(round.indicator_players, keyMap),
          })
          .eq('id', round.id)

        if (roundError) {
          console.error('Round güncelleme hatası:', roundError)
          throw roundError
        }
      }

      const { error: gameError } = await supabase
        .from('games')
        .update({
          players,
          teams,
          banko_history: game.banko_history && renameKeys(game.banko_history, keyMap),
        })
        .eq('id', game.id)

      if (gameError) {
        console.error('Oyun güncelleme hatası:', gameError)
        throw gameError
      }
    }

    console.log('İsim güncellendi:', oldName, '→', newName)
  }

  const { error: updateError } = await supabase
    .from('players')
    .update({
      name: newName,
      avatar_url: friendProfile.avatar_url,
      linked_user_id: friendUserId,
    })
    .eq('id', localPlayerId)
    .eq('user_id', currentUserId)

  if (updateError) throw updateError

  const { data: duplicates } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', currentUserId)
    .eq('linked_user_id', friendUserId)
    .neq('id', localPlayerId)

  if (duplicates?.length) {
    const { error: deleteError } = await supabase
      .from('players')
      .delete()
      .eq('user_id', currentUserId)
      .eq('linked_user_id', friendUserId)
      .neq('id', localPlayerId)

    if (deleteError) {
      console.error('Duplicate silme hatası:', deleteError)
      throw deleteError
    }
    console.log('Duplicate silindi:', duplicates.length)
  }

  await sendNotification(friendUserId, 'merge_done')

  await supabase.from('merge_requests').upsert(
    {
      requester_id: currentUserId,
      target_id: friendUserId,
      local_player_id: localPlayerId,
      status: 'accepted',
    },
    { onConflict: 'requester_id,target_id' }
  )

  console.log('Birleştirme tamamlandı!')
  dispatchPlayersRefresh()
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
