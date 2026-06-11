import { supabase } from '@/lib/supabase'
import type { AppNotification, NotificationType } from '@/types'

export const MERGE_OPEN_EVENT = 'yazboz-open-merge'

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Bildirim yükleme hatası:', error)
    return []
  }

  return (data ?? []) as AppNotification[]
}

export async function createNotification(params: {
  userId: string
  type: NotificationType
  title: string
  body: string
  data?: Record<string, unknown>
}) {
  const { error } = await supabase.from('notifications').insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data ?? {},
  })

  if (error) console.error('Bildirim oluşturma hatası:', error)
}

export async function markNotificationRead(notificationId: string) {
  await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId)
}

export async function markAllNotificationsRead(userId: string) {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
}

export function dispatchMergeModal(friendUserId: string) {
  window.dispatchEvent(
    new CustomEvent(MERGE_OPEN_EVENT, { detail: { friendUserId } })
  )
}
