import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import { BottomNavBar } from '@/components/layout/BottomNavBar'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const [_user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const hideBottomNav = pathname.startsWith('/game/') || pathname === '/auth' || pathname === '/'

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
    </>
  )
}
