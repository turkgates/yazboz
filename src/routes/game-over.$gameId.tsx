import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase, fetchGameWithRounds, createGame } from '@/lib/supabase'
import { useGameStore, useSettingsStore } from '@/stores/gameStore'
import { getRanking } from '@/lib/calculations'
import { Home, RotateCcw } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import type { Game } from '@/types'

export const Route = createFileRoute('/game-over/$gameId')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: GameOverPage,
})

function GameOverPage() {
  const { gameId } = Route.useParams()
  const navigate = useNavigate()
  const { currentGame, rounds, loadGame, startGame, clearGame } = useGameStore()
  const { settings } = useSettingsStore()
  const [loading, setLoading] = useState(!currentGame || currentGame.id !== gameId)
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    if (!currentGame || currentGame.id !== gameId) {
      fetchGameWithRounds(gameId).then(({ game, rounds: r }) => {
        if (game) loadGame(game, r)
        setLoading(false)
      })
    } else {
      setLoading(false)
    }
    setTimeout(() => setShowConfetti(true), 300)
  }, [gameId])

  const handleReplay = async () => {
    if (!currentGame) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const gameId = uuidv4()
    const newGame: Game = {
      id: gameId,
      user_id: user.id,
      game_type: 'cezali_okey',
      status: 'active',
      total_rounds: currentGame.total_rounds,
      players: currentGame.players,
      settings,
      created_at: new Date().toISOString(),
      finished_at: null,
    }

    startGame(newGame)
    try { await createGame({ ...newGame, finished_at: null }) } catch {}
    navigate({ to: '/game/$gameId', params: { gameId } })
  }

  if (loading || !currentGame) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const totals: Record<string, number> = {}
  for (const player of currentGame.players) {
    totals[player] = rounds.reduce((sum, r) => sum + (r.scores[player] ?? 0), 0)
  }
  const ranking = getRanking(totals)
  const winner = ranking[0]

  const medals = ['🥇', '🥈', '🥉', '4️⃣']
  const rankColors = [
    'from-[#f5a623]/20 border-[#f5a623]/40',
    'from-[#a0aec0]/10 border-[#a0aec0]/30',
    'from-[#cd7f32]/10 border-[#cd7f32]/30',
    'from-[#2d3748]/10 border-[#2d3748]/40',
  ]

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col items-center px-4 py-8 relative overflow-hidden">
      {/* Confetti */}
      {showConfetti && <ConfettiEffect />}

      {/* Winner Announcement */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 15, delay: 0.2 }}
        className="text-center mb-8 mt-4"
      >
        <div className="text-7xl mb-3">🏆</div>
        <h1 className="text-3xl font-black text-white mb-1">{winner.name}</h1>
        <p className="text-[#f5a623] font-semibold">kazandı!</p>
        <p className="text-[#718096] text-sm mt-1">Toplam: {winner.total} puan</p>
      </motion.div>

      {/* Rankings */}
      <div className="w-full max-w-sm flex flex-col gap-3 mb-8">
        {ranking.map((item, i) => (
          <motion.div
            key={item.name}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.1 }}
            className={`bg-gradient-to-r ${rankColors[i]} border rounded-2xl p-4 flex items-center justify-between`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{medals[i]}</span>
              <div>
                <p className="text-white font-semibold">{item.name}</p>
                <p className="text-[#718096] text-xs">{item.rank}. sıra</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-bold text-lg ${item.total < 0 ? 'text-green-400' : 'text-red-400'}`}>
                {item.total}
              </p>
              <p className="text-[#718096] text-xs">puan</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="w-full max-w-sm flex flex-col gap-3"
      >
        <button
          onClick={handleReplay}
          className="w-full bg-[#e94560] hover:bg-[#c73652] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-base transition-colors"
        >
          <RotateCcw size={20} />
          Tekrar Oyna
        </button>
        <button
          onClick={() => { clearGame(); navigate({ to: '/home' }) }}
          className="w-full bg-[#16213e] border border-[#2d3748] text-[#a0aec0] font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 text-base transition-colors hover:text-white"
        >
          <Home size={20} />
          Ana Sayfaya Dön
        </button>
      </motion.div>
    </div>
  )
}

function ConfettiEffect() {
  const colors = ['#e94560', '#f5a623', '#27ae60', '#3498db', '#9b59b6', '#f39c12']
  const pieces = Array.from({ length: 40 })

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-sm"
          style={{
            backgroundColor: colors[i % colors.length],
            left: `${Math.random() * 100}%`,
            top: '-10px',
          }}
          animate={{
            y: ['0vh', '110vh'],
            x: [0, (Math.random() - 0.5) * 200],
            rotate: [0, Math.random() * 720],
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: 2 + Math.random() * 2,
            delay: Math.random() * 1.5,
            ease: 'easeIn',
          }}
        />
      ))}
    </div>
  )
}
