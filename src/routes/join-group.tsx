import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { joinGroupByCode } from '@/lib/socialSupabase'
import { BackButton } from '@/components/layout/BackButton'
import { ArrowRight } from 'lucide-react'

export const Route = createFileRoute('/join-group')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: JoinGroupPage,
})

function JoinGroupPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleJoin = async () => {
    if (code.trim().length !== 6) { setError('Davet kodu 6 karakter olmalı'); return }
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate({ to: '/auth' }); return }
      const group = await joinGroupByCode(code.trim(), user.id)
      navigate({ to: '/group/$groupId', params: { groupId: group.id } })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center gap-3 py-3 max-w-lg mx-auto">
          <BackButton />
          <h1 className="text-white font-bold">Gruba Katıl</h1>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🔑</div>
            <p className="text-white font-semibold text-lg">Davet Kodunu Gir</p>
            <p className="text-[#718096] text-sm mt-1">6 haneli grup davet kodunu gir</p>
          </div>

          <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-6 flex flex-col gap-4">
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                setError('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="ABC123"
              maxLength={6}
              autoFocus
              className="w-full bg-[#0f3460]/50 border border-[#2d3748] rounded-xl py-4 px-4 text-white text-center text-2xl font-mono tracking-widest placeholder-[#4a5568] focus:outline-none focus:border-[#e94560]"
            />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              onClick={handleJoin}
              disabled={loading || code.trim().length !== 6}
              className="w-full bg-[#e94560] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Katıl <ArrowRight size={16} /></>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
