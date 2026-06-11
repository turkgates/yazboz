import { createFileRoute, useNavigate, redirect, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { createGroup, fetchMyGroups, fetchUserProfile } from '@/lib/socialSupabase'
import type { Group } from '@/types'
import { BackButton } from '@/components/layout/BackButton'
import { Plus, QrCode, Users } from 'lucide-react'

export const Route = createFileRoute('/groups')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: GroupsPage,
})

function GroupsPage() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const loadGroups = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setLoading(true)
    const { data, error } = await fetchMyGroups(user.id)
    console.log('Gruplar:', data, 'Hata:', error)
    if (error) console.error('Gruplar yüklenemedi:', error)
    setGroups(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (pathname === '/groups') {
      loadGroups()
    }
  }, [pathname])

  const handleCreate = async () => {
    if (!newGroupName.trim()) return
    setCreating(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate({ to: '/auth' })
        return
      }

      const { data: profile } = await fetchUserProfile(user.id)
      if (!profile?.username) {
        navigate({ to: '/onboarding' })
        return
      }

      const group = await createGroup(newGroupName.trim(), user.id)
      await loadGroups()
      setShowCreate(false)
      setNewGroupName('')
      navigate({ to: '/group/$groupId', params: { groupId: group.id } })
    } catch (err: unknown) {
      console.error('Detaylı hata:', err)
      const message = err instanceof Error ? err.message : 'Hata oluştu'
      setError(message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col pb-24">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-3 max-w-lg mx-auto">
          <BackButton />
          <h1 className="text-white font-bold">Gruplarım</h1>
          <div className="flex gap-2">
            <button
              onClick={() => navigate({ to: '/join-group' })}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0]"
              title="Gruba Katıl"
            >
              <QrCode size={16} />
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#e94560] text-white"
              title="Yeni Grup"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="text-5xl">👥</div>
            <p className="text-white font-semibold">Henüz bir grubun yok</p>
            <p className="text-[#718096] text-sm">Yeni grup oluştur veya davet koduyla katıl</p>
            <div className="flex gap-3 mt-2">
              <button onClick={() => setShowCreate(true)} className="bg-[#e94560] text-white font-bold px-4 py-2.5 rounded-xl text-sm">
                Grup Oluştur
              </button>
              <button onClick={() => navigate({ to: '/join-group' })} className="bg-[#0f3460] text-[#a0aec0] font-semibold px-4 py-2.5 rounded-xl text-sm">
                Gruba Katıl
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((g) => (
              <motion.button
                key={g.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => navigate({ to: '/group/$groupId', params: { groupId: g.id } })}
                className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-4 text-left flex items-center gap-4 hover:border-[#e94560]/30 transition-colors"
              >
                <div className="w-12 h-12 bg-gradient-to-br from-[#e94560]/30 to-[#0f3460] rounded-xl flex items-center justify-center">
                  <Users size={22} className="text-[#e94560]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold truncate">{g.name}</p>
                  <p className="text-[#718096] text-xs mt-0.5">Kod: {g.invite_code}</p>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Create group modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center"
            onClick={() => setShowCreate(false)}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg bg-[#16213e] rounded-t-3xl border-t border-x border-[#2d3748] p-6 safe-bottom"
            >
              <div className="flex justify-center mb-4">
                <div className="w-10 h-1 rounded-full bg-[#4a5568]" />
              </div>
              <h3 className="text-white font-bold text-lg mb-4">Yeni Grup Oluştur</h3>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Grup adı"
                maxLength={40}
                autoFocus
                className="w-full bg-[#0f3460]/50 border border-[#2d3748] rounded-xl py-3 px-4 text-white placeholder-[#718096] focus:outline-none focus:border-[#e94560] text-sm mb-3"
              />
              {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
              <div className="flex gap-3">
                <button onClick={() => setShowCreate(false)} className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3 rounded-xl">İptal</button>
                <button onClick={handleCreate} disabled={creating || !newGroupName.trim()} className="flex-[2] bg-[#e94560] disabled:opacity-50 text-white font-bold py-3 rounded-xl">
                  {creating ? 'Oluşturuluyor...' : 'Oluştur'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
