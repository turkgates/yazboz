import type { GameFilterKey, GameTypeFilter } from '@/lib/gameTypes'

const FILTERS: { id: GameFilterKey | 'all'; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'cezali', label: 'Cezalı' },
  { id: 'sayili', label: 'Sayılı' },
  { id: 'solo', label: 'Tekli' },
  { id: 'esli', label: 'Eşli' },
]

interface GameTypeFilterTabsProps {
  value: GameTypeFilter
  onChange: (filter: GameTypeFilter) => void
}

export function GameTypeFilterTabs({ value, onChange }: GameTypeFilterTabsProps) {
  const toggle = (id: GameFilterKey | 'all') => {
    if (id === 'all') {
      onChange([])
      return
    }
    if (value.includes(id)) {
      onChange(value.filter((f) => f !== id))
    } else {
      onChange([...value, id])
    }
  }

  const isActive = (id: GameFilterKey | 'all') =>
    id === 'all' ? value.length === 0 : value.includes(id)

  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => toggle(f.id)}
          className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
            isActive(f.id)
              ? 'bg-[#e94560] text-white'
              : 'bg-[#16213e] border border-[#2d3748] text-[#a0aec0] hover:text-white'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
