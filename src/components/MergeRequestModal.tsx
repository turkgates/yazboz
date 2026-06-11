import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  checkPendingMergeRequest,
  markMergePrompted,
  countGamesForPlayerName,
  type PendingMergeRequest,
} from '@/lib/socialSupabase'
import { performMerge, skipMerge } from '@/lib/friendUtils'
import { PlayerAvatar } from '@/components/PlayerAvatar'

export interface MergeRequestModalProps {
  friendUserId: string
  friendName: string
  friendAvatarUrl: string | null
  onComplete: () => void
  onSkip: () => void
}

interface LocalPlayerOption {
  id: string
  name: string
  gameCount: number
  isSuggested: boolean
}

export function MergeRequestModal({
  friendUserId,
  friendName,
  friendAvatarUrl,
  onComplete,
  onSkip,
}: MergeRequestModalProps) {
  const [localPlayers, setLocalPlayers] = useState<LocalPlayerOption[]>([])
  const [selectedId, setSelectedId] = useState<string | 'skip' | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    loadLocalPlayers()
  }, [friendUserId, friendName])

  const loadLocalPlayers = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data: locals } = await supabase
      .from('players')
      .select('id, name')
      .eq('user_id', user.id)
      .is('linked_user_id', null)
      .order('name')

    const withCounts = await Promise.all(
      (locals ?? []).map(async (p) => ({
        id: p.id,
        name: p.name,
        gameCount: await countGamesForPlayerName(user.id, p.name),
        isSuggested: p.name.trim().toLowerCase() === friendName.trim().toLowerCase(),
      }))
    )

    const suggested = withCounts.find((p) => p.isSuggested)
    setLocalPlayers(withCounts)
    setSelectedId(suggested?.id ?? (withCounts.length > 0 ? withCounts[0].id : 'skip'))
    setLoading(false)
  }

  const handleMerge = async () => {
    if (!selectedId || selectedId === 'skip') {
      await handleSkip()
      return
    }

    const local = localPlayers.find((p) => p.id === selectedId)
    if (!local) return

    setProcessing(true)
    try {
      await performMerge(selectedId, local.name, friendUserId, {
        display_name: friendName,
        avatar_url: friendAvatarUrl,
      })
      onComplete()
    } finally {
      setProcessing(false)
    }
  }

  const handleSkip = async () => {
    setProcessing(true)
    try {
      await skipMerge(friendUserId)
      onSkip()
    } finally {
      setProcessing(false)
    }
  }

  if (loading) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 px-4 pb-safe-bottom">
      <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-5 w-full max-w-sm mb-4 sm:mb-0">
        <h3 className="text-white font-bold text-base mb-3">🔗 Profil Birleştirme</h3>

        <div className="flex items-center gap-3 mb-4">
          <PlayerAvatar name={friendName} avatarUrl={friendAvatarUrl} size={48} />
          <p className="text-[#a0aec0] text-sm">
            <span className="text-white font-medium">{friendName}</span> arkadaşınızla ilişkilendir
          </p>
        </div>

        <p className="text-[#718096] text-xs font-semibold uppercase mb-2">Yerel oyuncu seç</p>
        <div className="flex flex-col gap-2 mb-4 max-h-48 overflow-y-auto">
          {localPlayers.map((p) => (
            <label
              key={p.id}
              className={`flex items-center gap-3 border rounded-xl p-3 cursor-pointer transition-colors ${
                selectedId === p.id
                  ? 'border-[#e94560] bg-[#0f3460]/60'
                  : 'border-[#2d3748] bg-[#0f3460]/30'
              }`}
            >
              <input
                type="radio"
                name="merge-player"
                checked={selectedId === p.id}
                onChange={() => setSelectedId(p.id)}
                className="accent-[#e94560]"
              />
              <div className="flex-1">
                <p className="text-white text-sm font-medium">
                  {p.name} ({p.gameCount} oyun)
                  {p.isSuggested && (
                    <span className="ml-2 text-[#f6ad55] text-xs">⭐ Öneri</span>
                  )}
                </p>
              </div>
            </label>
          ))}

          <label
            className={`flex items-center gap-3 border rounded-xl p-3 cursor-pointer transition-colors ${
              selectedId === 'skip'
                ? 'border-[#e94560] bg-[#0f3460]/60'
                : 'border-[#2d3748] bg-[#0f3460]/30'
            }`}
          >
            <input
              type="radio"
              name="merge-player"
              checked={selectedId === 'skip'}
              onChange={() => setSelectedId('skip')}
              className="accent-[#e94560]"
            />
            <p className="text-[#a0aec0] text-sm">Birleştirme yapma</p>
          </label>
        </div>

        <p className="text-[#718096] text-xs mb-4">
          Seçilen oyuncunun tüm istatistikleri arkadaşınızla birleştirilecek.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleMerge}
            disabled={processing || !selectedId}
            className="flex-1 bg-[#e94560] disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl"
          >
            {processing ? '...' : 'Birleştir'}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={processing}
            className="flex-1 bg-[#0f3460] text-[#a0aec0] text-sm font-semibold py-2.5 rounded-xl"
          >
            Atla
          </button>
        </div>
      </div>
    </div>
  )
}

interface PendingMergeModalProps {
  userId: string
  onDone: () => void
}

export function PendingMergeModal({ userId, onDone }: PendingMergeModalProps) {
  const [request, setRequest] = useState<PendingMergeRequest | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkPendingMergeRequest(userId).then((pending) => {
      setRequest(pending)
      setLoading(false)
      if (!pending) onDone()
    })
  }, [userId, onDone])

  const handleComplete = async () => {
    if (request) await markMergePrompted(request.id)
    onDone()
  }

  if (loading || !request) return null

  const friendName = request.friendProfile?.display_name ?? 'Arkadaş'
  const friendAvatarUrl = request.friendProfile?.avatar_url ?? null

  return (
    <MergeRequestModal
      friendUserId={request.friendUserId}
      friendName={friendName}
      friendAvatarUrl={friendAvatarUrl}
      onComplete={handleComplete}
      onSkip={handleComplete}
    />
  )
}
