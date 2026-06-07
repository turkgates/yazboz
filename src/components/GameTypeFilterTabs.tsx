import type { GameTypeFilter } from '@/lib/gameTypes'

const FILTERS: { id: GameTypeFilter; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'cezali', label: 'Cezalı' },
  { id: 'sayili', label: 'Sayılı' },
]

interface GameTypeFilterTabsProps {
  value: GameTypeFilter
  onChange: (filter: GameTypeFilter) => void
}

export function GameTypeFilterTabs({ value, onChange }: GameTypeFilterTabsProps) {
  return (
    <div className="flex gap-2 mb-5">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onChange(f.id)}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            value === f.id
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
