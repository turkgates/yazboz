import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  checkPendingMergeRequest,
  getSupabaseErrorMessage,
  markMergePrompted,
  requestPlayerMerge,
  type PendingMergeRequest,
} from '@/lib/socialSupabase'
import { dispatchPlayersRefresh, skipMerge } from '@/lib/friendUtils'
import { PlayerAvatar } from '@/components/PlayerAvatar'

export interface MergeRequestModalProps {
  friendUserId: string
  friendName: string
  friendAvatarUrl: string | null
  friendRequestId?: string
  onComplete: () => void
  onSkip: () => void
  onCancel?: () => void
}

interface LocalPlayerOption {
  id: string
  name: string
  avatar_url: string | null
  isSuggested: boolean
}

export function MergeRequestModal({
  friendUserId,
  friendName,
  friendAvatarUrl,
  friendRequestId,
  onComplete,
  onSkip,
  onCancel,
}: MergeRequestModalProps) {
  const [localPlayers, setLocalPlayers] = useState<LocalPlayerOption[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | 'none' | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const autoSkipStarted = useRef(false)

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
      .select('id, name, avatar_url')
      .eq('user_id', user.id)
      .is('linked_user_id', null)
      .order('name')

    const players = (locals ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      avatar_url: p.avatar_url,
      isSuggested: p.name.trim().toLowerCase() === friendName.trim().toLowerCase(),
    }))

    // Birleştirilecek yerel oyuncu yoksa sorulacak bir şey de yok
    if (players.length === 0) {
      if (autoSkipStarted.current) return
      autoSkipStarted.current = true
      try {
        await skipMerge(friendUserId)
        await finishModal()
        onSkip()
        return
      } catch (err) {
        console.error('Arkadaş oyuncu listesine eklenemedi:', err)
      }
    }

    const suggested = players.find((p) => p.isSuggested)
    setLocalPlayers(players)
    setSelectedPlayerId(suggested?.id ?? (players.length > 0 ? players[0].id : 'none'))
    setLoading(false)
  }

  const finishModal = async () => {
    if (friendRequestId) await markMergePrompted(friendRequestId)
  }

  const handleConfirm = async () => {
    if (!selectedPlayerId) return

    setProcessing(true)
    setError('')
    try {
      if (selectedPlayerId === 'none') {
        await skipMerge(friendUserId)
        await finishModal()
        onSkip()
        return
      }

      const local = localPlayers.find((p) => p.id === selectedPlayerId)
      if (!local) return

      await requestPlayerMerge(selectedPlayerId, friendUserId)
      await finishModal()
      dispatchPlayersRefresh()
      onComplete()
    } catch (err: unknown) {
      console.error('Birleştirme isteği hatası:', err)
      setError(getSupabaseErrorMessage(err, 'İstek gönderilemedi'))
    } finally {
      setProcessing(false)
    }
  }

  if (loading) return null

  const suggested = localPlayers.find((p) => p.isSuggested)

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 px-4 pb-safe-bottom">
      <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-5 w-full max-w-sm mb-4 sm:mb-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold text-base">🔗 Profil Birleştirme</h3>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Kapat"
              className="text-[#718096] hover:text-white"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mb-4">
          <PlayerAvatar name={friendName} avatarUrl={friendAvatarUrl} size={48} />
          <p className="text-[#a0aec0] text-sm">
            Hangi yerel oyuncun <span className="text-white font-medium">{friendName}</span>?
          </p>
        </div>

        <p className="text-[#718096] text-xs font-semibold uppercase mb-2">Yerel oyuncu seç</p>
        <div className="flex flex-col gap-2 mb-4 max-h-52 overflow-y-auto">
          {localPlayers.map((player) => (
            <label
              key={player.id}
              className="flex items-center gap-3 p-3 rounded-lg cursor-pointer border border-gray-700 hover:border-yellow-500 transition-colors"
              style={{
                borderColor: selectedPlayerId === player.id ? '#EAB308' : undefined,
                background: selectedPlayerId === player.id ? 'rgba(234,179,8,0.1)' : undefined,
              }}
            >
              <input
                type="radio"
                name="mergePlayer"
                value={player.id}
                checked={selectedPlayerId === player.id}
                onChange={() => setSelectedPlayerId(player.id)}
                className="hidden"
              />
              <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size={40} />
              <div className="flex-1">
                <p className="text-white font-medium">{player.name}</p>
                {player.id === suggested?.id && (
                  <p className="text-yellow-400 text-xs">⭐ Öneri - Aynı isim</p>
                )}
              </div>
              {selectedPlayerId === player.id && (
                <span className="text-yellow-400">✓</span>
              )}
            </label>
          ))}

          <label
            className="flex items-center gap-3 p-3 rounded-lg cursor-pointer border border-gray-700 hover:border-yellow-500 transition-colors"
            style={{
              borderColor: selectedPlayerId === 'none' ? '#EAB308' : undefined,
              background: selectedPlayerId === 'none' ? 'rgba(234,179,8,0.1)' : undefined,
            }}
          >
            <input
              type="radio"
              name="mergePlayer"
              value="none"
              checked={selectedPlayerId === 'none'}
              onChange={() => setSelectedPlayerId('none')}
              className="hidden"
            />
            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center shrink-0">
              <X size={20} className="text-gray-400" />
            </div>
            <p className="text-gray-400">Birleştirme yapma</p>
            {selectedPlayerId === 'none' && (
              <span className="text-yellow-400 ml-auto">✓</span>
            )}
          </label>
        </div>

        <p className="text-[#718096] text-xs mb-4">
          {friendName} onaylarsa seçtiğin oyuncunun oyunları onun istatistiklerine eklenir. Onay gelene kadar hiçbir şey değişmez.
        </p>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={processing || !selectedPlayerId}
          className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 rounded-lg text-black font-bold"
        >
          {processing ? '...' : selectedPlayerId === 'none' ? 'Atla' : 'Onaya Gönder'}
        </button>
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

  if (loading || !request) return null

  const friendName = request.friendProfile?.display_name ?? 'Arkadaş'
  const friendAvatarUrl = request.friendProfile?.avatar_url ?? null

  return (
    <MergeRequestModal
      friendUserId={request.friendUserId}
      friendName={friendName}
      friendAvatarUrl={friendAvatarUrl}
      friendRequestId={request.id}
      onComplete={onDone}
      onSkip={onDone}
    />
  )
}
