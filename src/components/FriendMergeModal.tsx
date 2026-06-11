import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  checkPendingMergeRequest,
  markMergePrompted,
  mergePlayerWithFriend,
  createLinkedFriendPlayer,
  countGamesForPlayerName,
  type PendingMergeRequest,
} from '@/lib/socialSupabase'
import { PlayerAvatar } from '@/components/PlayerAvatar'

interface LocalPlayerOption {
  id: string
  name: string
  gameCount: number
}

interface FriendMergeModalProps {
  userId: string
  onDone: () => void
}

export function FriendMergeModal({ userId, onDone }: FriendMergeModalProps) {
  const [request, setRequest] = useState<PendingMergeRequest | null>(null)
  const [localPlayers, setLocalPlayers] = useState<LocalPlayerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    loadPending()
  }, [userId])

  const loadPending = async () => {
    setLoading(true)
    const pending = await checkPendingMergeRequest(userId)
    if (!pending) {
      setLoading(false)
      onDone()
      return
    }

    const { data: locals } = await supabase
      .from('players')
      .select('id, name')
      .eq('user_id', userId)
      .is('linked_user_id', null)
      .order('name')

    const withCounts = await Promise.all(
      (locals ?? []).map(async (p) => ({
        id: p.id,
        name: p.name,
        gameCount: await countGamesForPlayerName(userId, p.name),
      }))
    )

    setRequest(pending)
    setLocalPlayers(withCounts)
    setLoading(false)
  }

  const friendName = request?.friendProfile?.display_name ?? 'Arkadaş'

  const handleMerge = async (localPlayerId: string) => {
    if (!request) return
    setProcessing(true)
    try {
      await mergePlayerWithFriend(userId, localPlayerId, request.friendUserId)
      await markMergePrompted(request.id)
      onDone()
    } finally {
      setProcessing(false)
    }
  }

  const handleSkipMerge = async () => {
    if (!request) return
    setProcessing(true)
    try {
      await createLinkedFriendPlayer(userId, request.friendUserId)
      await markMergePrompted(request.id)
      onDone()
    } finally {
      setProcessing(false)
    }
  }

  const handleLater = async () => {
    if (!request) return
    setProcessing(true)
    try {
      await markMergePrompted(request.id)
      onDone()
    } finally {
      setProcessing(false)
    }
  }

  if (loading || !request) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 px-4 pb-safe-bottom">
      <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-5 w-full max-w-sm mb-4 sm:mb-0">
        <h3 className="text-white font-bold text-base mb-2">🔗 Profil Birleştirme</h3>
        <p className="text-[#a0aec0] text-sm mb-4">
          <span className="text-white font-medium">{friendName}</span> arkadaşını yerel oyuncu listenizle birleştirmek ister misiniz?
        </p>

        {localPlayers.length > 0 ? (
          <div className="flex flex-col gap-2 mb-4 max-h-48 overflow-y-auto">
            <p className="text-[#718096] text-xs font-semibold uppercase">Yerel oyuncularınız</p>
            {localPlayers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleMerge(p.id)}
                disabled={processing}
                className="flex items-center gap-3 bg-[#0f3460]/50 border border-[#2d3748] hover:border-[#e94560] rounded-xl p-3 text-left disabled:opacity-50"
              >
                <PlayerAvatar name={p.name} size={36} />
                <div>
                  <p className="text-white text-sm font-medium">{p.name}</p>
                  <p className="text-[#718096] text-xs">{p.gameCount} oyun</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[#718096] text-sm mb-4">Birleştirilecek yerel oyuncu yok.</p>
        )}

        <p className="text-[#718096] text-xs mb-4">
          Seçilen oyuncunun tüm istatistikleri arkadaşınızla birleştirilecek.
        </p>

        <div className="flex flex-col gap-2">
          {localPlayers.length === 0 && (
            <button
              type="button"
              onClick={handleSkipMerge}
              disabled={processing}
              className="w-full bg-[#e94560] disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl"
            >
              {processing ? '...' : 'Yeni arkadaş olarak ekle'}
            </button>
          )}
          {localPlayers.length > 0 && (
            <button
              type="button"
              onClick={handleSkipMerge}
              disabled={processing}
              className="w-full bg-[#0f3460] text-[#a0aec0] text-sm font-semibold py-2.5 rounded-xl"
            >
              Birleştirme yapma, yeni ekle
            </button>
          )}
          <button
            type="button"
            onClick={handleLater}
            disabled={processing}
            className="w-full text-[#718096] text-sm py-2"
          >
            Daha Sonra
          </button>
        </div>
      </div>
    </div>
  )
}
