import { useEffect, useRef, useState } from 'react'
import { CloudOff, RefreshCw } from 'lucide-react'
import { readStoredUser } from '@/lib/supabase'
import { flushQueue } from '@/lib/gameSync'
import { useOnlineStatus, useOfflineSync } from '@/hooks/useOfflineSync'
import { useOfflineStore } from '@/stores/offlineStore'

const SYNCED_NOTICE_MS = 2500

export function SyncBanner() {
  useOfflineSync()

  const online = useOnlineStatus()
  const ops = useOfflineStore((s) => s.ops)
  const failed = useOfflineStore((s) => s.failed)
  const networkDown = useOfflineStore((s) => s.networkDown)
  const retryFailed = useOfflineStore((s) => s.retryFailed)
  const discardFailed = useOfflineStore((s) => s.discardFailed)

  const userId = readStoredUser()?.id ?? ''
  const pending = ops.filter((op) => op.userId === userId).length
  const failedCount = failed.filter((op) => op.userId === userId).length
  const offline = !online || networkDown

  const [justSynced, setJustSynced] = useState(false)
  const hadPending = useRef(false)

  useEffect(() => {
    if (pending > 0) {
      hadPending.current = true
      setJustSynced(false)
      return
    }
    if (!hadPending.current) return
    hadPending.current = false
    setJustSynced(true)
    const timer = setTimeout(() => setJustSynced(false), SYNCED_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [pending])

  if (failedCount > 0) {
    return (
      <div className="bg-red-500/15 border-b border-red-500/40 px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-2 flex items-center gap-2 text-xs">
          <span className="flex-1 min-w-0 text-white">{failedCount} kayıt gönderilemedi</span>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`${failedCount} kayıt silinecek. Bu işlem geri alınamaz.`)) {
                discardFailed(userId)
              }
            }}
            className="h-7 px-2 text-[#a0aec0] font-semibold shrink-0"
          >
            Sil
          </button>
          <button
            type="button"
            onClick={() => {
              retryFailed(userId)
              void flushQueue()
            }}
            className="h-7 px-3 rounded-lg bg-white/10 text-white font-semibold shrink-0"
          >
            Tekrar dene
          </button>
        </div>
      </div>
    )
  }

  if (offline) {
    return (
      <div className="bg-[#f5a623]/15 border-b border-[#f5a623]/40 px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-2 flex items-center gap-2 text-xs text-white">
          <CloudOff size={14} className="text-[#f5a623] shrink-0" />
          <span className="flex-1 min-w-0">
            {pending > 0
              ? `İnternet yok. ${pending} kayıt telefonda bekliyor, bağlanınca gönderilecek.`
              : 'İnternet yok. Girdiğin eller telefonda saklanır.'}
          </span>
        </div>
      </div>
    )
  }

  if (pending > 0) {
    return (
      <div className="bg-[#0f3460] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-2 flex items-center gap-2 text-xs text-white">
          <RefreshCw size={14} className="text-[#a0aec0] animate-spin shrink-0" />
          <span>{pending} kayıt gönderiliyor</span>
        </div>
      </div>
    )
  }

  if (justSynced) {
    return (
      <div className="bg-green-500/15 border-b border-green-500/40 px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-2 text-xs text-white">✓ Tüm kayıtlar gönderildi</div>
      </div>
    )
  }

  return null
}
