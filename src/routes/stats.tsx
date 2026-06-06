import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, fetchFinishedGames } from '@/lib/supabase'
import type { Game } from '@/types'
import { ArrowLeft, Trophy, Hash } from 'lucide-react'
import { formatGameDate } from '@/lib/dateUtils'
import { GameDetailModal } from '@/components/stats/GameDetailModal'

export const Route = createFileRoute('/stats')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: StatsPage,
})

function StatsPage() {
  const navigate = useNavigate()
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await fetchFinishedGames(user.id)
    setGames(data ?? [])
    setLoading(false)
  }

  const totalGames = games.length

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center gap-3 py-4 max-w-lg mx-auto">
          <button
            onClick={() => navigate({ to: '/home' })}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0]"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-bold text-white">İstatistikler</h1>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <StatCard icon={<Hash size={20} />} label="Toplam Oyun" value={totalGames.toString()} color="blue" />
              <StatCard icon={<Trophy size={20} />} label="Tamamlanan" value={totalGames.toString()} color="gold" />
            </div>

            <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
              Son Oyunlar
            </h2>

            {games.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="text-5xl mb-4">📊</div>
                <p className="text-white font-medium mb-2">Henüz tamamlanan oyun yok</p>
                <p className="text-[#718096] text-sm">Oyunlarını tamamladıkça istatistikler burada görünecek.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {games.map((game, i) => (
                  <motion.button
                    key={game.id}
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setSelectedGame(game)}
                    className="bg-[#16213e] border border-[#2d3748] rounded-xl p-4 text-left hover:border-[#e94560]/40 transition-colors w-full"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-white text-sm font-medium">{game.players.join(', ')}</p>
                      <p className="text-[#718096] text-xs shrink-0 ml-2">
                        {formatGameDate(game.finished_at ?? game.created_at)}
                      </p>
                    </div>
                    <p className="text-[#718096] text-xs">{game.players.length} oyuncu • {game.total_rounds} el</p>
                  </motion.button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedGame && (
          <GameDetailModal game={selectedGame} onClose={() => setSelectedGame(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode
  label: string
  value: string
  color: 'blue' | 'gold' | 'green' | 'red'
}) {
  const colorMap = {
    blue: 'text-blue-400 bg-blue-500/10',
    gold: 'text-[#f5a623] bg-[#f5a623]/10',
    green: 'text-green-400 bg-green-500/10',
    red: 'text-red-400 bg-red-500/10',
  }
  return (
    <div className="bg-[#16213e] border border-[#2d3748] rounded-xl p-4">
      <div className={`w-9 h-9 rounded-lg ${colorMap[color]} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-[#718096] text-xs mt-0.5">{label}</p>
    </div>
  )
}
