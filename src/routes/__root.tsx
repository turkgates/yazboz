import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ensureSelfInPlayers, checkPendingMergeRequest } from '@/lib/socialSupabase'
import type { User } from '@supabase/supabase-js'
import { BottomNavBar } from '@/components/layout/BottomNavBar'
import { FriendMergeModal } from '@/components/FriendMergeModal'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [mergeUserId, setMergeUserId] = useState<string | null>(null)
  const [mergeCheckKey, setMergeCheckKey] = useState(0)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const hideBottomNav =
    pathname.startsWith('/game/') ||
    pathname === '/auth' ||
    pathname === '/' ||
    pathname === '/onboarding'

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      setMergeUserId(null)
      return
    }
    ensureSelfInPlayers().then(async () => {
      const pending = await checkPendingMergeRequest(user.id)
      setMergeUserId(pending ? user.id : null)
    })
  }, [user, mergeCheckKey])

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-[#e94560] border-t-transparent animate-spin" />
          <p className="text-[#a0aec0] text-sm">Yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Outlet />
      {!hideBottomNav && <BottomNavBar />}
      {mergeUserId && (
        <FriendMergeModal
          userId={mergeUserId}
          onDone={() => {
            setMergeUserId(null)
            setMergeCheckKey((k) => k + 1)
          }}
        />
      )}
    </>
  )
}
