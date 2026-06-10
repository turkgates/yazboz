import { Link, useRouterState } from '@tanstack/react-router'
import { Home, Users, BarChart2, Settings } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/home', icon: Home, label: 'Ana Sayfa' },
  { to: '/players', icon: Users, label: 'Oyuncular' },
  { to: '/stats', icon: BarChart2, label: 'İstatistikler' },
  { to: '/settings', icon: Settings, label: 'Ayarlar' },
] as const

export function BottomNavBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#16213e] border-t border-[#2d3748] safe-bottom z-40">
      <div className="max-w-lg mx-auto flex items-center justify-around py-2">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.to ||
            (item.to === '/players' && pathname.startsWith('/player/'))
          const Icon = item.icon

          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col items-center gap-1 px-3 py-1 min-w-0"
            >
              <Icon
                size={22}
                className={active ? 'text-white' : 'text-white/50'}
                strokeWidth={active ? 2.25 : 1.75}
              />
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
