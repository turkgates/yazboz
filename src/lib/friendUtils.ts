import { supabase } from '@/lib/supabase'
import {
  sendFriendRequest as rpcSendFriendRequest,
  respondToFriendRequest,
} from '@/lib/socialSupabase'
import { createNotification, dispatchMergeModal } from '@/lib/notificationUtils'
import type { Profile } from '@/types'
import type { Game } from '@/types'

export const PLAYERS_REFRESH_EVENT = 'yazboz-players-refresh'

export function dispatchPlayersRefresh() {
  window.dispatchEvent(new CustomEvent(PLAYERS_REFRESH_EVENT))
}

async function getCurrentUserProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Oturum bulunamadı')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle<Pick<Profile, 'display_name' | 'avatar_url'>>()

  return {
    userId: user.id,
    displayName: profile?.display_name ?? 'Birisi',
    avatarUrl: profile?.avatar_url ?? null,
  }
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
  const { userId: currentUserId } = await getCurrentUserProfile()

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
  const { userId, displayName } = await getCurrentUserProfile()
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
    await createNotification({
      userId: receiverId,
      type: 'friend_request',
      title: 'Arkadaşlık İsteği',
      body: `${displayName} sana arkadaşlık isteği gönderdi`,
      data: {
        sender_id: userId,
        sender_name: displayName,
        request_id: requestId,
      },
    })
    return
  }

  if (req.status === 'accepted') {
    const friendId = req.receiver_id === userId ? req.sender_id : req.receiver_id
    const friendProfile = await getProfile(friendId)
    await onFriendshipEstablished(userId, friendId, displayName, friendProfile)
  }
}

export async function onFriendshipEstablished(
  currentUserId: string,
  friendId: string,
  currentUserName: string,
  friendProfile: Pick<Profile, 'display_name' | 'avatar_url'> | null
) {
  const friendName = friendProfile?.display_name ?? 'Arkadaş'
  const friendAvatarUrl = friendProfile?.avatar_url ?? null

  await createNotification({
    userId: friendId,
    type: 'friend_accepted',
    title: 'Arkadaşlık İsteği Kabul Edildi',
    body: `${currentUserName} arkadaşlık isteğini kabul etti`,
    data: {
      friend_id: currentUserId,
      friend_name: currentUserName,
    },
  })

  await createNotification({
    userId: friendId,
    type: 'merge_notify',
    title: 'Arkadaşlık',
    body: `${currentUserName} arkadaşlık isteğini kabul etti`,
    data: { friend_id: currentUserId, friend_name: currentUserName },
  })

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

  const { userId, displayName } = await getCurrentUserProfile()

  await createNotification({
    userId: senderId,
    type: 'friend_accepted',
    title: 'Arkadaşlık İsteği Kabul Edildi',
    body: `${displayName} arkadaşlık isteğini kabul etti`,
    data: {
      friend_id: userId,
      friend_name: displayName,
    },
  })

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
  const { displayName: currentUserName } = await getCurrentUserProfile()

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

  await createNotification({
    userId: friendUserId,
    type: 'merge_request',
    title: 'Profil Birleştirme',
    body: `${currentUserName} seni yerel oyuncusuyla birleştirmek istiyor`,
    data: {
      requester_id: currentUserId,
      requester_name: currentUserName,
      friend_user_id: currentUserId,
    },
  })

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
  const { userId: currentUserId, displayName: currentUserName } = await getCurrentUserProfile()

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

  if (oldName !== newName) {
    const { data: affectedGames } = await supabase
      .from('games')
      .select('id, players, teams')
      .eq('user_id', currentUserId)

    for (const game of (affectedGames ?? []) as Game[]) {
      const playersArr = (game.players ?? []) as string[]
      if (!playersArr.includes(oldName)) continue

      const newPlayers = playersArr.map((p) => (p === oldName ? newName : p))
      const teams = game.teams as string[][] | null
      let newTeams = teams
      if (teams) {
        newTeams = teams.map((team) =>
          team.map((p) => (p === oldName ? newName : p))
        )
      }

      const { error: gameError } = await supabase
        .from('games')
        .update({ players: newPlayers, teams: newTeams })
        .eq('id', game.id)

      if (gameError) {
        console.error('Oyun güncelleme hatası:', gameError)
        throw gameError
      }

      const { data: rounds } = await supabase
        .from('rounds')
        .select('id, scores, banko_players, indicator_players')
        .eq('game_id', game.id)

      for (const round of rounds ?? []) {
        const scores = { ...((round.scores as Record<string, number>) ?? {}) }
        if (scores[oldName] === undefined) continue

        scores[newName] = scores[oldName]
        delete scores[oldName]

        let newBankoPlayers = (round.banko_players as string[] | null) ?? null
        if (newBankoPlayers?.includes(oldName)) {
          newBankoPlayers = newBankoPlayers.map((p) => (p === oldName ? newName : p))
        }

        let newIndicatorPlayers = (round.indicator_players as string[] | null) ?? null
        if (newIndicatorPlayers?.includes(oldName)) {
          newIndicatorPlayers = newIndicatorPlayers.map((p) => (p === oldName ? newName : p))
        }

        const { error: roundError } = await supabase
          .from('rounds')
          .update({
            scores,
            banko_players: newBankoPlayers,
            indicator_players: newIndicatorPlayers,
          })
          .eq('id', round.id)

        if (roundError) {
          console.error('Round güncelleme hatası:', roundError)
          throw roundError
        }
      }
    }

    console.log('İsim güncellendi:', oldName, '→', newName)
  }

  await createNotification({
    userId: friendUserId,
    type: 'merge_done',
    title: 'Profil Birleştirildi',
    body: `${currentUserName} seni kendi yerel oyuncusuyla birleştirdi. İstatistiklerini kontrol et.`,
    data: {
      merged_by: currentUserId,
      merged_by_name: currentUserName,
    },
  })

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
  const { userId } = await getCurrentUserProfile()
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
