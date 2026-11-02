import { createFileRoute, Link, Navigate, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { getLocalSession, readStoredUser } from '@/lib/supabase'
import { fetchUserProfile } from '@/lib/socialSupabase'
import { claimLiveSeat, removeLiveParticipant } from '@/lib/liveTable'
import { useLiveGame } from '@/hooks/useLiveGame'
import { getGroupGameWinners } from '@/lib/groupStatsUtils'
import { getGameBadgeLabel, getGameRanking, getTeams, isEsliGame, isSayiliGame, teamLabel } from '@/lib/gameTypes'
import { getPlayerEntity } from '@/lib/statsUtils'
import { BackButton } from '@/components/layout/BackButton'
import { GameResultModal } from '@/components/GameResultModal'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import type { Profile, Round } from '@/types'

export const Route = createFileRoute('/live/$gameId')({
  beforeLoad: async () => {
    const session = await getLocalSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: LiveGamePage,
})

const formatScore = (score: number) => (score > 0 ? `+${score}` : String(score))
const scoreTone = (score: number) =>
  score < 0 ? 'text-green-400' : score > 0 ? 'text-red-400' : 'text-[#718096]'

function LiveGamePage() {
  const { gameId } = Route.useParams()
  const navigate = useNavigate()
  const userId = readStoredUser()?.id ?? ''

  const { game, rounds, participants, loading, connected, refresh } = useLiveGame(gameId)
  const [owner, setOwner] = useState<Profile | null>(null)
  const [pickingSeat, setPickingSeat] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showResult, setShowResult] = useState(false)

  const ownerId = game?.user_id
  useEffect(() => {
    if (!ownerId) return
    fetchUserProfile(ownerId).then(({ data }) => setOwner(data))
  }, [ownerId])

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white">Bu masaya erişemiyorsun. Kodla yeniden katılabilirsin.</p>
        <Link to="/join-table" className="text-[#e94560] font-semibold">
          Masaya Katıl
        </Link>
      </div>
    )
  }

  if (game.user_id === userId) {
    return <Navigate to="/game/$gameId" params={{ gameId }} replace />
  }

  const me = participants.find((p) => p.user_id === userId)
  const seat = me?.player_name ?? null
  const isFinished = game.status === 'finished'
  const myEntity = seat ? getPlayerEntity(game, seat) : null
  const entities = isEsliGame(game) ? getTeams(game).map(teamLabel) : game.players
  const ranking = getGameRanking(game, rounds)
  const playedRounds = rounds.filter((r) => !r.is_indicator_only)
  const ownerName = owner?.display_name ?? 'Arkadaşın'
  const winners = isFinished ? getGroupGameWinners(game, rounds) : []
  const showSeatPicker = !isFinished && !!me && (pickingSeat || !seat)

  const takenBy = (name: string) =>
    participants.find((p) => p.player_name?.toLowerCase() === name.toLowerCase())

  const chooseSeat = async (name: string | null) => {
    setBusy(true)
    setError('')
    try {
      await claimLiveSeat(gameId, name)
      setPickingSeat(false)
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Koltuk seçilemedi')
    } finally {
      setBusy(false)
    }
  }

  const leave = async () => {
    if (!me) return
    setBusy(true)
    try {
      await removeLiveParticipant(me.id)
      navigate({ to: '/home', replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Masadan ayrılınamadı')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col pb-8">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-3 max-w-lg mx-auto gap-2">
          <BackButton className="w-9 h-9 justify-center shrink-0" />
          <div className="text-center min-w-0">
            <h1 className="text-white font-bold truncate">{ownerName} masası</h1>
            <p className="text-[#718096] text-xs truncate">{getGameBadgeLabel(game)}</p>
          </div>
          <div className="w-14 shrink-0 flex justify-end">
            {!isFinished && (
              <span className="flex items-center gap-1 text-xs font-semibold text-green-400">
                <span className={`w-2 h-2 rounded-full bg-green-400 ${connected ? 'animate-pulse' : 'opacity-40'}`} />
                Canlı
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 max-w-lg mx-auto w-full flex flex-col gap-4">
        {isFinished && (
          <section className="bg-[#f5a623]/10 border border-[#f5a623]/40 rounded-2xl p-4 text-center">
            <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider">Oyun bitti</p>
            <p className="text-white font-bold text-lg mt-1">
              🏆 {winners.join(', ') || 'Sonuç yok'}
            </p>
            {seat && <p className="text-[#a0aec0] text-sm mt-1">Bu oyun istatistiklerine eklendi.</p>}
            <button
              type="button"
              onClick={() => setShowResult(true)}
              className="mt-3 h-10 px-4 rounded-xl bg-[#f5a623] text-[#1a1a2e] text-sm font-bold inline-flex items-center gap-2"
            >
              <Trophy size={16} />
              Sonucu Gör
            </button>
          </section>
        )}

        {showSeatPicker && (
          <section className="bg-[#16213e] border border-[#e94560]/50 rounded-2xl p-4">
            <p className="text-white font-semibold">Hangi oyuncusun?</p>
            <p className="text-[#a0aec0] text-sm mt-0.5">
              Seçersen oyun bitince bu oyuncunun puanları senin istatistiklerine yazılır.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {game.players.map((name) => {
                const holder = takenBy(name)
                const isMine = holder?.user_id === userId
                const isOwnerSeat =
                  !!owner?.display_name && owner.display_name.toLowerCase() === name.toLowerCase()
                const disabled = busy || isOwnerSeat || (!!holder && !isMine)
                return (
                  <button
                    key={name}
                    type="button"
                    disabled={disabled}
                    onClick={() => chooseSeat(name)}
                    className={`min-h-12 px-3 py-1.5 rounded-xl border text-left transition-colors disabled:opacity-50 ${
                      isMine ? 'bg-green-500/15 border-green-500' : 'bg-[#0f3460]/40 border-[#2d3748]'
                    }`}
                  >
                    <span className="block text-white text-sm font-medium truncate">{name}</span>
                    {(holder || isOwnerSeat) && (
                      <span className="block text-[#718096] text-[11px] truncate">
                        {isOwnerSeat ? 'Masayı yazan' : isMine ? 'Sen' : holder?.profile?.display_name}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2 mt-2">
              {seat ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => chooseSeat(null)}
                  className="flex-1 h-10 rounded-xl border border-dashed border-[#4a5568] text-[#a0aec0] text-sm font-medium"
                >
                  Koltuktan kalk, sadece izle
                </button>
              ) : null}
              {pickingSeat && (
                <button
                  type="button"
                  onClick={() => setPickingSeat(false)}
                  className="flex-1 h-10 rounded-xl bg-[#0f3460] text-[#a0aec0] text-sm font-semibold"
                >
                  Vazgeç
                </button>
              )}
            </div>
            {!seat && (
              <p className="text-[#718096] text-xs mt-2 text-center">
                Oynamıyorsan seçmene gerek yok, skoru aşağıdan izleyebilirsin.
              </p>
            )}
          </section>
        )}

        {!isFinished && seat && !pickingSeat && (
          <button
            type="button"
            onClick={() => setPickingSeat(true)}
            className="bg-[#16213e] border border-[#2d3748] rounded-xl p-3 flex items-center justify-between gap-3 text-left"
          >
            <span className="text-white text-sm font-medium truncate">
              Sen: <span className="font-bold">{seat}</span>
            </span>
            <span className="text-[#e94560] text-sm font-semibold shrink-0">Değiştir</span>
          </button>
        )}

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <section className="flex flex-col gap-2">
          {ranking.map((row, index) => {
            const isMine = myEntity?.toLowerCase() === row.name.toLowerCase()
            return (
              <div
                key={row.name}
                className={`rounded-xl border p-3 flex items-center gap-3 ${
                  isMine ? 'bg-[#e94560]/10 border-[#e94560]/60' : 'bg-[#16213e] border-[#2d3748]'
                }`}
              >
                <span className="w-6 text-center text-[#718096] text-sm font-semibold shrink-0">
                  {index + 1}.
                </span>
                <PlayerAvatar name={row.name} size={36} />
                <span className="flex-1 min-w-0 text-white text-sm font-semibold truncate">
                  {row.name}
                  {isMine && <span className="text-[#a0aec0] font-normal"> · Sen</span>}
                </span>
                <span className={`font-black text-xl tabular-nums shrink-0 ${
                  isSayiliGame(game) ? 'text-white' : scoreTone(row.total)
                }`}>
                  {isSayiliGame(game) ? row.total : formatScore(row.total)}
                </span>
              </div>
            )
          })}
        </section>

        <p className="text-[#718096] text-xs text-center">
          {isSayiliGame(game)
            ? `${playedRounds.length}. el oynandı`
            : `El ${playedRounds.length} / ${game.total_rounds}`}
        </p>

        {rounds.length > 0 ? (
          <RoundsTable entities={entities} rounds={rounds} />
        ) : (
          <p className="text-[#718096] text-sm text-center py-6">İlk el bekleniyor</p>
        )}

        {!isFinished && me && (
          <button
            type="button"
            disabled={busy}
            onClick={leave}
            className="text-[#718096] text-sm font-medium h-10"
          >
            Masadan ayrıl
          </button>
        )}
      </div>

      <GameResultModal
        gameId={gameId}
        isOpen={showResult}
        onClose={() => setShowResult(false)}
        onViewScoreboard={() => setShowResult(false)}
      />
    </div>
  )
}

function RoundsTable({ entities, rounds }: { entities: string[]; rounds: Round[] }) {
  return (
    <div className="bg-[#16213e] rounded-2xl border border-[#2d3748] overflow-hidden">
      <div className="flex bg-[#0f3460] border-b border-[#2d3748]">
        <div className="w-9 shrink-0 py-2 text-center text-[#718096] text-xs font-medium">El</div>
        {entities.map((entity) => (
          <div key={entity} className="flex-1 min-w-0 py-2 px-1 text-center text-white text-xs font-semibold truncate">
            {entity}
          </div>
        ))}
      </div>
      {[...rounds].reverse().map((round) => (
        <div key={round.id} className="flex border-b border-[#2d3748]/40 last:border-b-0">
          <div className="w-9 shrink-0 py-2 text-center text-[#718096] text-xs">
            {round.is_indicator_only ? '★' : round.round_number}
          </div>
          {entities.map((entity) => {
            const score = round.scores[entity] ?? 0
            return (
              <div key={entity} className={`flex-1 min-w-0 py-2 px-1 text-center text-xs font-medium tabular-nums ${scoreTone(score)}`}>
                {score === 0 ? '-' : formatScore(score)}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
