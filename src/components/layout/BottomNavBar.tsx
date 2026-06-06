import { Link, useRouterState } from '@tanstack/react-router'

const NAV_ITEMS = [
  { to: '/home', icon: '🏠', label: 'Ana Sayfa' },
  { to: '/players', icon: '👥', label: 'Oyuncular' },
  { to: '/tracker', icon: '🀄', label: 'Takip' },
  { to: '/stats', icon: '📊', label: 'İstatistikler' },
  { to: '/settings', icon: '⚙️', label: 'Ayarlar' },
] as const

export function BottomNavBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#16213e] border-t border-[#2d3748] safe-bottom z-40">
      <div className="max-w-lg mx-auto flex items-center justify-around py-1.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.to || (item.to !== '/home' && pathname.startsWith(item.to))
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 min-w-0 ${
                active ? 'text-[#e94560]' : 'text-[#718096] hover:text-white'
              } transition-colors`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="text-[9px] font-medium truncate">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
