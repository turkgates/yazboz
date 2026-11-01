import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import type { Color } from '@/types'
import { COLOR_LABELS } from '@/types'

const COLORS: Color[] = ['black', 'red', 'yellow', 'green']
const COLOR_SWATCHES: Record<Color, string> = {
  black: 'bg-[#111] ring-1 ring-white/30',
  red: 'bg-[#e74c3c]',
  yellow: 'bg-[#f5c518]',
  green: 'bg-[#27ae60]',
}

export function EntrySheet({
  title,
  onClose,
  footer,
  children,
}: {
  title: string
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-[#16213e] rounded-t-3xl border-t border-x border-[#2d3748] overflow-hidden safe-bottom max-h-[92dvh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
          <h3 className="text-white font-bold text-lg">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="w-9 h-9 rounded-full bg-[#0f3460] text-[#a0aec0] flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-3.5">{children}</div>
        {footer && <div className="px-5 pt-3 pb-4 shrink-0 border-t border-[#2d3748]">{footer}</div>}
      </motion.div>
    </motion.div>
  )
}

export function EntrySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <p className="text-[#a0aec0] text-sm font-medium mb-1.5">{title}</p>
      {children}
    </section>
  )
}

// Eksik seçim varsa düğme nedenini kendi üzerinde söyler
export function SaveButton({
  saving,
  missing,
  onClick,
}: {
  saving: boolean
  missing: string | null
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || !!missing}
      className="w-full h-13 bg-green-500 disabled:bg-[#2d3748] disabled:text-[#a0aec0] text-white font-bold rounded-xl transition-colors"
    >
      {saving ? 'Kaydediliyor...' : (missing ?? 'Kaydet')}
    </button>
  )
}

export function ScoreText({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return <span className="text-[#4a5568] font-bold tabular-nums">—</span>
  }
  const tone = score < 0 ? 'text-green-400' : score > 0 ? 'text-red-400' : 'text-[#718096]'
  return <span className={`font-bold tabular-nums ${tone}`}>{score > 0 ? `+${score}` : score}</span>
}

export function WinnerPicker({
  options,
  selected,
  onSelect,
  scores,
  singleColumn = false,
  noWinner,
}: {
  options: string[]
  selected: string | null
  onSelect: (option: string) => void
  scores?: Record<string, number | null | undefined>
  singleColumn?: boolean
  noWinner?: { selected: boolean; onSelect: () => void }
}) {
  return (
    <div className={`grid gap-2 ${singleColumn ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {options.map((option) => {
        const isSelected = selected === option
        const score = scores?.[option]
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(option)}
            className={`min-h-11 px-3 py-1.5 rounded-xl border text-left flex items-center gap-2 transition-colors ${
              isSelected
                ? 'bg-green-500/15 border-green-500'
                : 'bg-[#0f3460]/40 border-[#2d3748]'
            }`}
          >
            {isSelected && <Check size={16} className="text-green-400 shrink-0" />}
            <span className="flex-1 min-w-0 truncate text-white font-medium text-sm">{option}</span>
            {score !== null && score !== undefined && <ScoreText score={score} />}
          </button>
        )
      })}
      {noWinner && (
        <button
          type="button"
          aria-pressed={noWinner.selected}
          onClick={noWinner.onSelect}
          className={`${singleColumn ? '' : 'col-span-2'} min-h-10 rounded-xl border border-dashed text-sm font-medium transition-colors ${
            noWinner.selected
              ? 'bg-[#e94560]/15 border-[#e94560] text-white'
              : 'border-[#4a5568] text-[#a0aec0]'
          }`}
        >
          Kimse bitmedi
        </button>
      )}
    </div>
  )
}

export function ColorPicker({
  color,
  fakeOkey,
  onColor,
  onFakeOkey,
  multipliers,
  fakeMultiplier,
}: {
  color: Color | null
  fakeOkey: boolean
  onColor: (color: Color) => void
  onFakeOkey: () => void
  multipliers?: Record<Color, number>
  fakeMultiplier?: number
}) {
  const cellClass = (active: boolean) =>
    `h-[62px] rounded-xl border flex flex-col items-center justify-center gap-1 transition-colors ${
      active ? 'border-[#e94560] bg-[#e94560]/15' : 'border-[#2d3748] bg-[#0f3460]/40'
    }`

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {COLORS.map((c) => {
        const isActive = !fakeOkey && color === c
        return (
          <button
            key={c}
            type="button"
            aria-pressed={isActive}
            onClick={() => onColor(c)}
            className={cellClass(isActive)}
          >
            <span className={`w-5 h-5 rounded-full ${COLOR_SWATCHES[c]}`} />
            <span className="text-white text-[11px] font-medium leading-none">
              {COLOR_LABELS[c]}
              {multipliers && <span className="block text-center text-[#718096] mt-0.5">×{multipliers[c]}</span>}
            </span>
          </button>
        )
      })}
      <button
        type="button"
        aria-pressed={fakeOkey}
        onClick={onFakeOkey}
        className={cellClass(fakeOkey)}
      >
        <span className="text-base leading-5">🃏</span>
        <span className="text-white text-[11px] font-medium leading-none">
          Sahte
          {fakeMultiplier !== undefined && <span className="block text-center text-[#718096] mt-0.5">×{fakeMultiplier}</span>}
        </span>
      </button>
    </div>
  )
}

export function ToggleChip({
  label,
  active,
  onClick,
  tone = 'accent',
  size = 'md',
}: {
  label: string
  active: boolean
  onClick: () => void
  tone?: 'accent' | 'orange' | 'purple' | 'amber'
  size?: 'md' | 'sm'
}) {
  const activeClass = {
    accent: 'bg-[#e94560]/15 border-[#e94560] text-white',
    orange: 'bg-orange-500/20 border-orange-500 text-orange-300',
    purple: 'bg-purple-500/20 border-purple-500 text-purple-300',
    amber: 'bg-[#f5a623]/15 border-[#f5a623] text-[#f5a623]',
  }[tone]

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-xl border font-medium transition-colors ${
        size === 'sm' ? 'h-9 px-2 text-xs shrink-0' : 'flex-1 h-10 px-3 text-sm'
      } ${active ? activeClass : 'bg-[#0f3460]/40 border-[#2d3748] text-[#a0aec0]'}`}
    >
      {label}
    </button>
  )
}

export function PointsInput({
  value,
  onChange,
  placeholder = 'Puan',
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label: string
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-[72px] h-10 shrink-0 bg-[#1a1a2e] border border-[#2d3748] rounded-lg px-2 text-right text-white text-base placeholder-[#4a5568] focus:outline-none focus:border-[#e94560]"
    />
  )
}

export function EntryRow({
  name,
  score,
  children,
  extra,
}: {
  name: ReactNode
  score?: number | null
  children?: ReactNode
  extra?: ReactNode
}) {
  return (
    <div className="bg-[#0f3460]/40 border border-[#2d3748] rounded-xl px-3 py-1">
      <div className="flex items-center gap-2 min-h-10">
        <span className="flex-1 min-w-0 truncate text-white text-sm font-medium">{name}</span>
        {children}
        <span className="w-14 shrink-0 text-right text-sm">
          <ScoreText score={score} />
        </span>
      </div>
      {extra && <div className="flex flex-wrap gap-1.5 mt-1 mb-1">{extra}</div>}
    </div>
  )
}
