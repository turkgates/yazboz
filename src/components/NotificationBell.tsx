import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Bell, X, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  dispatchMergeModal,
  MERGE_OPEN_EVENT,
} from '@/lib/notificationUtils'
import type { AppNotification } from '@/types'
import { formatDistanceToNow } from '@/lib/dateUtils'
import { PlayerAvatar } from '@/components/PlayerAvatar'

function getNotificationIcon(type: AppNotification['type']): string {
  switch (type) {
    case 'friend_request':
      return '🤝'
    case 'friend_accepted':
      return '✅'
    case 'merge_request':
      return '🔗'
    case 'merge_done':
      return '✅'
    case 'merge_notify':
      return 'ℹ️'
    default:
      return '🔔'
  }
}

function getAvatarMeta(notification: AppNotification) {
  const data = notification.data ?? {}
  const name =
    (data.sender_name as string) ??
    (data.friend_name as string) ??
    (data.requester_name as string) ??
    (data.merged_by_name as string) ??
    'Kullanıcı'
  const avatarUrl = (data.sender_avatar_url as string | null) ?? null
  return { name, avatarUrl }
}

export function NotificationBell() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [showPanel, setShowPanel] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !n.is_read).length

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  useEffect(() => {
    if (!userId) return

    fetchNotifications(userId).then(setNotifications)

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as AppNotification, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  useEffect(() => {
    if (!showPanel) return

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPanel])

  const handleMarkAllRead = async () => {
    if (!userId) return
    await markAllNotificationsRead(userId)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  const handleNotificationClick = async (notification: AppNotification) => {
    if (!notification.is_read) {
      await markNotificationRead(notification.id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      )
    }

    switch (notification.type) {
      case 'friend_request':
        setShowPanel(false)
        navigate({ to: '/players' })
        break
      case 'merge_request': {
        const friendUserId =
          (notification.data?.friend_user_id as string) ??
          (notification.data?.requester_id as string)
        if (friendUserId) dispatchMergeModal(friendUserId)
        setShowPanel(false)
        break
      }
      case 'merge_done':
        setShowPanel(false)
        navigate({ to: '/profile', search: { tab: 'stats' } })
        break
      case 'friend_accepted':
        setShowPanel(false)
        navigate({ to: '/profile', search: { tab: 'friends' } })
        break
      default:
        break
    }
  }

  const goToPlayers = async (notification: AppNotification) => {
    if (!notification.is_read) {
      await markNotificationRead(notification.id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      )
    }
    setShowPanel(false)
    navigate({ to: '/players' })
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setShowPanel((v) => !v)}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-gray-300 hover:text-white transition-colors"
        aria-label="Bildirimler"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showPanel && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] overflow-hidden bg-[#16213e] border border-[#2d3748] rounded-2xl shadow-xl z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2d3748]">
            <h3 className="text-white font-bold text-sm">Bildirimler</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[#e94560] text-xs font-semibold"
                >
                  Tümünü okundu işaretle
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowPanel(false)}
                className="text-[#718096] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <p className="text-[#718096] text-sm text-center py-8">Bildirim yok</p>
            ) : (
              notifications.map((notification) => {
                const { name, avatarUrl } = getAvatarMeta(notification)
                const isFriendRequest = notification.type === 'friend_request'
                const isMergeRequest = notification.type === 'merge_request'

                return (
                  <div
                    key={notification.id}
                    className={`px-4 py-3 border-b border-[#2d3748]/50 ${
                      !notification.is_read ? 'bg-[#0f3460]/30' : ''
                    }`}
                  >
                    {isFriendRequest ? (
                      <>
                        <div className="flex gap-3">
                          <span className="text-lg shrink-0">{getNotificationIcon(notification.type)}</span>
                          <PlayerAvatar name={name} avatarUrl={avatarUrl} size={36} />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm leading-snug">{notification.body}</p>
                            <p className="text-[#718096] text-xs mt-1 italic">
                              Arkadaşlar sayfasından yanıtlayabilirsiniz
                            </p>
                            <p className="text-[#718096] text-xs mt-1">
                              {formatDistanceToNow(notification.created_at)}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => goToPlayers(notification)}
                          className="mt-2 ml-9 flex items-center gap-1 text-[#e94560] text-xs font-semibold"
                        >
                          → Arkadaşlar
                          <ChevronRight size={14} />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(notification)}
                        className="w-full text-left"
                      >
                        <div className="flex gap-3">
                          <span className="text-lg shrink-0">{getNotificationIcon(notification.type)}</span>
                          {(notification.type === 'friend_accepted' ||
                            notification.type === 'merge_request') && (
                            <PlayerAvatar name={name} avatarUrl={avatarUrl} size={36} />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm leading-snug">{notification.body}</p>
                            <p className="text-[#718096] text-xs mt-1">
                              {formatDistanceToNow(notification.created_at)}
                            </p>
                          </div>
                        </div>
                        {isMergeRequest && (
                          <span className="mt-2 ml-9 inline-block text-[#e94560] text-xs font-semibold">
                            Görüntüle
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export { MERGE_OPEN_EVENT }
