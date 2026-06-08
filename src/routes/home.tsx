import { createFileRoute, useNavigate, redirect, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase, fetchGamesPaginated, signOut } from '@/lib/supabase'
import type { Game } from '@/types'
import { Plus, BarChart2, Settings, LogOut, ChevronRight, Trophy, Clock, Users } from 'lucide-react'
import { formatDistanceToNow } from '@/lib/dateUtils'
import { GameResultModal } from '@/components/GameResultModal'
import { getGameTypeLabel } from '@/lib/gameTypes'

const PAGE_SIZE = 5

export const Route = createFileRoute('/home')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw redirect({ to: '/auth' })
    }
  },
  component: HomePage,
})

function HomePage() {
  const navigate = useNavigate()
  const [activeGames, setActiveGames] = useState<Game[]>([])
  const [finishedGames, setFinishedGames] = useState<Game[]>([])
  const [activeOffset, setActiveOffset] = useState(0)
  const [finishedOffset, setFinishedOffset] = useState(0)
  const [hasMoreActive, setHasMoreActive] = useState(false)
  const [hasMoreFinished, setHasMoreFinished] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMoreActive, setLoadingMoreActive] = useState(false)
  const [loadingMoreFinished, setLoadingMoreFinished] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserEmail(user.email ?? '')
    setUserId(user.id)

    const [activeRes, finishedRes] = await Promise.all([
      fetchGamesPaginated(user.id, 'active', 0, PAGE_SIZE),
      fetchGamesPaginated(user.id, 'finished', 0, PAGE_SIZE),
    ])

    const active = activeRes.data ?? []
    const finished = finishedRes.data ?? []

    setActiveGames(active)
    setFinishedGames(finished)
    setActiveOffset(PAGE_SIZE)
    setFinishedOffset(PAGE_SIZE)
    setHasMoreActive(active.length === PAGE_SIZE)
    setHasMoreFinished(finished.length === PAGE_SIZE)
    setLoading(false)
  }

  const loadMoreActive = async () => {
    if (!userId || loadingMoreActive) return
    setLoadingMoreActive(true)
    const { data } = await fetchGamesPaginated(userId, 'active', activeOffset, PAGE_SIZE)
    const batch = data ?? []
    setActiveGames((prev) => [...prev, ...batch])
    setActiveOffset((prev) => prev + PAGE_SIZE)
    setHasMoreActive(batch.length === PAGE_SIZE)
    setLoadingMoreActive(false)
  }

  const loadMoreFinished = async () => {
    if (!userId || loadingMoreFinished) return
    setLoadingMoreFinished(true)
    const { data } = await fetchGamesPaginated(userId, 'finished', finishedOffset, PAGE_SIZE)
    const batch = data ?? []
    setFinishedGames((prev) => [...prev, ...batch])
    setFinishedOffset((prev) => prev + PAGE_SIZE)
    setHasMoreFinished(batch.length === PAGE_SIZE)
    setLoadingMoreFinished(false)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate({ to: '/auth' })
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-4 max-w-lg mx-auto">
          <div>
            <h1 className="text-xl font-bold text-white">🎴 Yazboz</h1>
            <p className="text-xs text-[#718096] mt-0.5">{userEmail}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSignOut}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0] hover:text-red-400 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full pb-20">
        <div className="grid grid-cols-2 gap-3 mb-6">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate({ to: '/new-game' })}
            className="col-span-2 bg-[#e94560] hover:bg-[#c73652] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 text-lg shadow-lg shadow-[#e94560]/20 transition-colors"
          >
            <Plus size={24} />
            Yeni Oyun Başlat
          </motion.button>

          <Link to="/tracker" className="block">
            <button className="w-full bg-[#16213e] border border-[#2d3748] hover:border-[#e94560]/40 rounded-2xl p-4 flex flex-col items-center gap-2 transition-colors">
              <span className="text-2xl">🀄</span>
              <span className="text-white text-sm font-semibold">Oyun Takip</span>
            </button>
          </Link>

          <Link to="/players" className="block">
            <button className="w-full bg-[#16213e] border border-[#2d3748] hover:border-[#e94560]/40 rounded-2xl p-4 flex flex-col items-center gap-2 transition-colors">
              <Users size={22} className="text-[#e94560]" />
              <span className="text-white text-sm font-semibold">Oyuncularım</span>
            </button>
          </Link>

          <Link to="/stats" className="col-span-2 block">
            <button className="w-full bg-[#16213e] border border-[#2d3748] hover:border-[#e94560]/40 rounded-2xl p-4 flex items-center justify-center gap-2 transition-colors">
              <BarChart2 size={22} className="text-[#e94560]" />
              <span className="text-white text-sm font-semibold">İstatistikler</span>
            </button>
          </Link>

          <Link to="/settings" className="col-span-2 block">
            <button className="w-full bg-[#16213e] border border-[#2d3748] hover:border-[#e94560]/40 rounded-2xl p-4 flex items-center justify-center gap-2 transition-colors">
              <Settings size={20} className="text-[#a0aec0]" />
              <span className="text-white text-sm font-semibold">Ayarlar</span>
            </button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {activeGames.length > 0 && (
              <section className="mb-6">
                <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Clock size={14} />
                  Devam Eden Oyunlar ({activeGames.length})
                </h2>
                <div className="flex flex-col gap-2">
                  {activeGames.map((game, i) => (
                    <motion.div
                      key={game.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <GameCard game={game} isActive />
                    </motion.div>
                  ))}
                </div>
                {hasMoreActive && (
                  <button
                    type="button"
                    onClick={loadMoreActive}
                    disabled={loadingMoreActive}
                    className="w-full mt-3 py-3 text-[#a0aec0] hover:text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {loadingMoreActive ? 'Yükleniyor...' : 'Daha Eski →'}
                  </button>
                )}
              </section>
            )}

            {finishedGames.length > 0 && (
              <section>
                <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Trophy size={14} />
                  Tamamlanan Oyunlar ({finishedGames.length})
                </h2>
                <div className="flex flex-col gap-2">
                  {finishedGames.map((game, i) => (
                    <motion.div
                      key={game.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <GameCard game={game} onFinishedClick={setSelectedGameId} />
                    </motion.div>
                  ))}
                </div>
                {hasMoreFinished && (
                  <button
                    type="button"
                    onClick={loadMoreFinished}
                    disabled={loadingMoreFinished}
                    className="w-full mt-3 py-3 text-[#a0aec0] hover:text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {loadingMoreFinished ? 'Yükleniyor...' : 'Daha Eski →'}
                  </button>
                )}
              </section>
            )}

            {activeGames.length === 0 && finishedGames.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="text-6xl mb-4">🃏</div>
                <p className="text-white font-medium mb-2">Henüz oyun yok</p>
                <p className="text-[#718096] text-sm">Yukarıdaki butona basarak ilk oyununuzu başlatın!</p>
              </div>
            )}
          </>
        )}
      </div>

      <GameResultModal
        gameId={selectedGameId ?? ''}
        isOpen={!!selectedGameId}
        onClose={() => setSelectedGameId(null)}
        onViewScoreboard={(gameId) => {
          setSelectedGameId(null)
          navigate({ to: '/game/$gameId', params: { gameId } })
        }}
      />
    </div>
  )
}

function GameCard({
  game,
  isActive,
  onFinishedClick,
}: {
  game: Game
  isActive?: boolean
  onFinishedClick?: (gameId: string) => void
}) {
  const navigate = useNavigate()
  const subtype = game.game_subtype ?? (game.game_type === 'cezali_esli' ? 'esli' : 'solo')
  const type = game.game_type === 'cezali_esli' ? 'cezali_okey' : game.game_type

  const handleClick = () => {
    if (isActive) {
      navigate({ to: '/game/$gameId', params: { gameId: game.id } })
    } else {
      onFinishedClick?.(game.id)
    }
  }

  return (
    <button
      onClick={handleClick}
      className="w-full bg-[#16213e] border border-[#2d3748] rounded-xl p-4 flex items-center justify-between text-left hover:border-[#e94560]/50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {isActive && (
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          )}
          <p className="text-white text-sm font-medium truncate">
            {game.players.join(', ')}
          </p>
        </div>
        <p className="text-[#718096] text-xs">
          {getGameTypeLabel(type, subtype)} • {game.players.length} oyuncu •{' '}
          {formatDistanceToNow(game.created_at)}
        </p>
      </div>
      <ChevronRight size={16} className="text-[#718096] shrink-0 ml-2" />
    </button>
  )
}
