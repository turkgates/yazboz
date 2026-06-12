import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import type { Game, Round, SavedPlayer } from '@/types'
import { Pencil } from 'lucide-react'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { PlayerFormModal } from '@/components/players/PlayerFormModal'
import { BackButton } from '@/components/layout/BackButton'
import { PlayerStats } from '@/components/PlayerStats'

export const Route = createFileRoute('/player/$playerId')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: PlayerProfilePage,
})

function buildRoundsByGame(rounds: Round[]): Record<string, Round[]> {
  const map: Record<string, Round[]> = {}
  for (const round of rounds) {
    if (!map[round.game_id]) map[round.game_id] = []
    map[round.game_id].push(round)
  }
  return map
}

function PlayerProfilePage() {
  const { playerId } = Route.useParams()
  const navigate = useNavigate()
  const [player, setPlayer] = useState<SavedPlayer | null>(null)
  const [realUsername, setRealUsername] = useState<string | null>(null)
  const [isLinkedFriend, setIsLinkedFriend] = useState(false)
  const [statsPlayerName, setStatsPlayerName] = useState('')
  const [statsGames, setStatsGames] = useState<Game[]>([])
  const [statsRoundsByGame, setStatsRoundsByGame] = useState<Record<string, Round[]>>({})
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: playerData, error } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single<SavedPlayer>()

    if (error || !playerData || playerData.user_id !== user.id) {
      setLoading(false)
      return
    }

    let displayName = playerData.name
    let displayAvatar = playerData.avatar_url
    let username: string | null = null
    let playerName = playerData.name
    let games: Game[] = []
    let rounds: Round[] = []

    const linked = !!playerData.linked_user_id && playerData.linked_user_id !== user.id

    if (playerData.linked_user_id) {
      const { data: friendProfile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, username')
        .eq('id', playerData.linked_user_id)
        .single<{ display_name: string | null; avatar_url: string | null; username: string | null }>()

      if (friendProfile) {
        playerName = friendProfile.display_name ?? playerData.name
        displayName = playerName
        displayAvatar = friendProfile.avatar_url ?? playerData.avatar_url
        username = friendProfile.username
      }
    }

    // Birleştirilmiş veya yerel oyuncu: kendi oyunlarımızdan istatistik çek
    const { data: myGames } = await supabase
      .from('games')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'finished')
      .order('created_at', { ascending: false })

    games = ((myGames ?? []) as Game[]).filter((g) =>
      (g.players as string[]).some(
        (p) => p.toLowerCase() === playerName.toLowerCase()
      )
    )

    if (games.length) {
      const { data: myRounds } = await supabase
        .from('rounds')
        .select('*')
        .in('game_id', games.map((g) => g.id))

      rounds = (myRounds ?? []) as Round[]
    }

    setPlayer({ ...playerData, name: displayName, avatar_url: displayAvatar })
    setRealUsername(username)
    setIsLinkedFriend(linked)
    setStatsPlayerName(playerName)
    setStatsGames(games)
    setStatsRoundsByGame(buildRoundsByGame(rounds))
    setLoading(false)
  }

  useEffect(() => {
    loadProfile()
  }, [playerId])

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!player) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex flex-col items-center justify-center gap-4">
        <p className="text-white">Oyuncu bulunamadı</p>
        <button onClick={() => navigate({ to: '/players' })} className="text-[#e94560]">
          Oyunculara Dön
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col pb-24">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center gap-3 py-4 max-w-lg mx-auto">
          <BackButton className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460]" />
          <h1 className="text-lg font-bold text-white flex-1 truncate">Oyuncu Profili</h1>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        <div className="flex flex-col items-center mb-6">
          <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size={96} className="mb-3" />
          <h2 className="text-white text-xl font-bold">{player.name}</h2>
          {realUsername && <p className="text-[#718096] text-sm mt-1">@{realUsername}</p>}
          {isLinkedFriend && <p className="text-[#718096] text-xs mt-1">Arkadaş ✓</p>}
          {!isLinkedFriend && (
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 bg-[#0f3460] text-[#a0aec0] hover:text-white text-sm font-medium px-4 py-2 rounded-xl mt-3"
            >
              <Pencil size={14} />
              Düzenle
            </button>
          )}
        </div>

        <PlayerStats
          playerName={statsPlayerName}
          games={statsGames}
          roundsByGame={statsRoundsByGame}
          showHistory
        />
      </div>

      <AnimatePresence>
        {showEditModal && player && (
          <PlayerFormModal
            player={player}
            onClose={() => setShowEditModal(false)}
            onSaved={loadProfile}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
