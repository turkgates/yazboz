import { createFileRoute, useNavigate, redirect, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase, fetchActiveGames, fetchFinishedGames, signOut } from '@/lib/supabase'
import type { Game } from '@/types'
import { Plus, BarChart2, Settings, LogOut, ChevronRight, Trophy, Clock } from 'lucide-react'
import { formatDistanceToNow } from '@/lib/dateUtils'

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
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserEmail(user.email ?? '')

    const [activeRes, finishedRes] = await Promise.all([
      fetchActiveGames(user.id),
      fetchFinishedGames(user.id),
    ])

    setActiveGames(activeRes.data ?? [])
    setFinishedGames(finishedRes.data ?? [])
    setLoading(false)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate({ to: '/auth' })
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      {/* Header */}
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-4 max-w-lg mx-auto">
          <div>
            <h1 className="text-xl font-bold text-white">🎴 Yazboz</h1>
            <p className="text-xs text-[#718096] mt-0.5">{userEmail}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/stats">
              <button className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0] hover:text-white transition-colors">
                <BarChart2 size={18} />
              </button>
            </Link>
            <Link to="/settings">
              <button className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0] hover:text-white transition-colors">
                <Settings size={18} />
              </button>
            </Link>
            <button
              onClick={handleSignOut}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0] hover:text-red-400 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        {/* New Game Button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate({ to: '/new-game' })}
          className="w-full bg-[#e94560] hover:bg-[#c73652] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 text-lg shadow-lg shadow-[#e94560]/20 transition-colors mb-6"
        >
          <Plus size={24} />
          Yeni Oyun Başlat
        </motion.button>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Active Games */}
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
              </section>
            )}

            {/* Finished Games */}
            {finishedGames.length > 0 && (
              <section>
                <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Trophy size={14} />
                  Tamamlanan Oyunlar ({finishedGames.length})
                </h2>
                <div className="flex flex-col gap-2">
                  {finishedGames.slice(0, 5).map((game, i) => (
                    <motion.div
                      key={game.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <GameCard game={game} />
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {activeGames.length === 0 && finishedGames.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-6xl mb-4">🃏</div>
                <p className="text-white font-medium mb-2">Henüz oyun yok</p>
                <p className="text-[#718096] text-sm">Yukarıdaki butona basarak ilk oyununuzu başlatın!</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function GameCard({ game, isActive }: { game: Game; isActive?: boolean }) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate({ to: '/game/$gameId', params: { gameId: game.id } })}
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
          {game.players.length} oyuncu • {game.total_rounds} el •{' '}
          {formatDistanceToNow(game.created_at)}
        </p>
      </div>
      <ChevronRight size={16} className="text-[#718096] shrink-0 ml-2" />
    </button>
  )
}
