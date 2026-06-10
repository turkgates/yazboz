import { Link, useRouterState } from '@tanstack/react-router'
import { Home, User, BarChart2, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { countPendingRequests } from '@/lib/socialSupabase'

const NAV_ITEMS = [
  { to: '/home', icon: Home, label: 'Ana Sayfa' },
  { to: '/profile', icon: User, label: 'Profil' },
  { to: '/stats', icon: BarChart2, label: 'İstatistikler' },
  { to: '/settings', icon: Settings, label: 'Ayarlar' },
] as const

export function BottomNavBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const count = await countPendingRequests(data.user.id)
        setPendingCount(count)
      }
    })
  }, [pathname])

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#16213e] border-t border-[#2d3748] safe-bottom z-40">
      <div className="max-w-lg mx-auto flex items-center justify-around py-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.to
          const Icon = item.icon
          const badge = item.to === '/profile' && pendingCount > 0

          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col items-center gap-1 px-3 py-1 min-w-0 relative"
            >
              <div className="relative">
                <Icon
                  size={22}
                  className={active ? 'text-white' : 'text-white/50'}
                  strokeWidth={active ? 2.25 : 1.75}
                />
                {badge && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[9px] font-bold">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </div>
              {active && <span className="w-1 h-1 rounded-full bg-white" />}
              <span
                className={`text-[9px] font-medium truncate ${
                  active ? 'text-white' : 'text-white/50'
                }`}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
