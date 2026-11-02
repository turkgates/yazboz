import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { flushQueue } from '@/lib/gameSync'
import {
  fetchLiveParticipants,
  openLiveTable,
  removeLiveParticipant,
  type LiveParticipant,
} from '@/lib/liveTable'
import { EntrySheet } from '@/components/game/RoundEntryParts'
import { ShareCodeBlock } from '@/components/ShareCodeBlock'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import type { Game } from '@/types'

const PARTICIPANT_POLL_MS = 5000

export function LiveTableSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  const router = useRouter()
  const [code, setCode] = useState<string | null>(null)
  const [participants, setParticipants] = useState<LiveParticipant[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!navigator.onLine) {
      setError('Canlı masa için internet gerekiyor. Eller yine de kaydedilmeye devam eder.')
      return
    }

    let active = true
    const refresh = async () => {
      const people = await fetchLiveParticipants(game.id)
      if (active) setParticipants(people)
    }

    const open = async () => {
      try {
        // Oyun henüz sunucuya gitmediyse önce o gönderilmeli
        await flushQueue()
        const liveCode = await openLiveTable(game.id)
        if (active) setCode(liveCode)
        await refresh()
      } catch (err: unknown) {
        if (!active) return
        const message = err instanceof Error ? err.message : ''
        setError(
          /fetch|network|load failed|abort/i.test(message)
            ? 'Canlı masa için internet gerekiyor. Eller yine de kaydedilmeye devam eder.'
            : message || 'Masa açılamadı'
        )
      }
    }
    open()

    const poll = setInterval(refresh, PARTICIPANT_POLL_MS)
    return () => {
      active = false
      clearInterval(poll)
    }
  }, [game.id])

  const handleRemove = async (participant: LiveParticipant) => {
    try {
      await removeLiveParticipant(participant.id)
      setParticipants((prev) => prev.filter((p) => p.id !== participant.id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Çıkarılamadı')
    }
  }

  const link = code
    ? window.location.origin + router.buildLocation({ to: '/join-table', search: { code } }).href
    : ''

  return (
    <EntrySheet title="Canlı Masa" onClose={onClose}>
      {error && <p className="text-[#f5a623] text-sm text-center py-2">{error}</p>}

      {!code && !error && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {code && (
        <ShareCodeBlock
          code={code}
          link={link}
          note="Masadakiler QR'ı okutup skoru kendi telefonundan anlık izler."
          shareTitle="Canlı masa"
          shareText={`Yazboz'da masaya katıl, skoru canlı izle. Masa kodu: ${code}`}
        />
      )}

      {code && (
        <section>
          <p className="text-[#a0aec0] text-sm font-medium mb-1.5">
            Masadakiler ({participants.length})
          </p>
          {participants.length === 0 ? (
            <p className="text-[#718096] text-sm">Henüz kimse katılmadı.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {participants.map((participant) => {
                const name = participant.profile?.display_name ?? 'İsimsiz'
                return (
                  <div
                    key={participant.id}
                    className="bg-[#0f3460]/40 border border-[#2d3748] rounded-xl px-3 py-2 flex items-center gap-3"
                  >
                    <PlayerAvatar name={name} avatarUrl={participant.profile?.avatar_url} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{name}</p>
                      <p className="text-[#718096] text-xs truncate">
                        {participant.player_name ? `${participant.player_name} koltuğunda` : 'İzliyor'}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`${name} masadan çıkar`}
                      onClick={() => handleRemove(participant)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-[#718096] shrink-0"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </EntrySheet>
  )
}
