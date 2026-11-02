import { useEffect, useState } from 'react'
import { flushQueue } from '@/lib/gameSync'

const RETRY_INTERVAL_MS = 20000

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}

// Bağlantı dönünce, uygulama öne gelince ve belirli aralıklarla bekleyen kayıtları gönderir
export function useOfflineSync() {
  useEffect(() => {
    const kick = () => {
      if (document.visibilityState === 'visible') void flushQueue()
    }

    kick()
    window.addEventListener('online', kick)
    document.addEventListener('visibilitychange', kick)
    const timer = setInterval(kick, RETRY_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', kick)
      document.removeEventListener('visibilitychange', kick)
      clearInterval(timer)
    }
  }, [])
}
