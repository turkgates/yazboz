/**
 * Avatar bucket yoksa Supabase SQL Editor'da şunu çalıştırın:
 *
 * insert into storage.buckets (id, name, public)
 * values ('avatars', 'avatars', true)
 * on conflict (id) do nothing;
 */
import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase, fetchPlayers, deletePlayer } from '@/lib/supabase'
import type { SavedPlayer } from '@/types'
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { PlayerFormModal } from '@/components/players/PlayerFormModal'

export const Route = createFileRoute('/players')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: PlayersPage,
})

function PlayersPage() {
  const navigate = useNavigate()
  const [players, setPlayers] = useState<SavedPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<SavedPlayer | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const loadPlayers = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await fetchPlayers(user.id)
    setPlayers(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadPlayers()
  }, [])

  const handleDelete = async (playerId: string) => {
    const { error } = await deletePlayer(playerId)
    if (error) {
      console.error('Delete player error:', error)
      return
    }
    setConfirmDeleteId(null)
    loadPlayers()
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-4 max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate({ to: '/home' })}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0]"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-lg font-bold text-white">Oyuncularım</h1>
          </div>
          <button
            onClick={() => { setEditingPlayer(null); setShowModal(true) }}
            className="flex items-center gap-1.5 bg-[#e94560] text-white text-sm font-semibold px-3 py-2 rounded-xl"
          >
            <Plus size={16} />
            Ekle
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 pb-20 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : players.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-5xl mb-4">👥</div>
            <p className="text-white font-medium mb-2">Henüz oyuncu yok</p>
            <p className="text-[#718096] text-sm mb-6">
              Sık oynadığınız kişileri ekleyerek yeni oyun kurarken hızlıca seçin.
            </p>
            <button
              onClick={() => { setEditingPlayer(null); setShowModal(true) }}
              className="bg-[#e94560] text-white font-semibold px-5 py-3 rounded-xl"
            >
              İlk Oyuncuyu Ekle
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {players.map((player, i) => (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="bg-[#16213e] border border-[#2d3748] rounded-xl p-4 flex items-center gap-3"
              >
                <button
                  type="button"
                  onClick={() => navigate({ to: '/player/$playerId', params: { playerId: player.id } })}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size={48} />
                  <p className="text-white font-medium flex-1 truncate">{player.name}</p>
                </button>
                <button
                  onClick={() => { setEditingPlayer(player); setShowModal(true) }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#0f3460] text-[#a0aec0] hover:text-white"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setConfirmDeleteId(player.id)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#0f3460] text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 size={16} />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <PlayerFormModal
            player={editingPlayer}
            onClose={() => { setShowModal(false); setEditingPlayer(null) }}
            onSaved={loadPlayers}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
          >
            <div className="absolute inset-0 bg-black/70" onClick={() => setConfirmDeleteId(null)} />
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="relative bg-[#16213e] border border-[#2d3748] rounded-2xl p-5 max-w-sm w-full"
            >
              <p className="text-white text-center mb-5">
                Bu oyuncuyu silmek istediğinizden emin misiniz?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3 rounded-xl"
                >
                  İptal
                </button>
                <button
                  onClick={() => handleDelete(confirmDeleteId)}
                  className="flex-1 bg-red-500 text-white font-bold py-3 rounded-xl"
                >
                  Sil
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
