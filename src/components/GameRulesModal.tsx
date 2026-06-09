import { AnimatePresence, motion } from 'framer-motion'
import { GAME_RULES, type GameRulesKey } from '@/lib/gameRules'

interface GameRulesModalProps {
  gameType: GameRulesKey | string
  isOpen: boolean
  onClose: () => void
}

export function GameRulesModal({ gameType, isOpen, onClose }: GameRulesModalProps) {
  const rules = GAME_RULES[gameType as GameRulesKey]
  if (!rules) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="bg-[#1a1a2e] rounded-t-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 safe-bottom border-t border-x border-[#2d3748]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 bg-[#4a5568] rounded-full" />
            </div>

            <div className="flex justify-between items-start mb-4 gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">{rules.title}</h2>
                <p className="text-sm text-[#718096] mt-1">{rules.description}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-[#718096] hover:text-white text-2xl shrink-0 w-8 h-8 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {rules.sections.map((section, i) => (
              <div key={i} className="mb-5">
                <h3 className="text-[#f5a623] font-semibold mb-2 text-sm uppercase tracking-wide">
                  {section.title}
                </h3>
                {Array.isArray(section.content) ? (
                  <ul className="space-y-1.5">
                    {section.content.map((item, j) => (
                      <li key={j} className="text-[#a0aec0] text-sm flex items-start gap-2">
                        <span className="text-[#4a5568] mt-0.5 shrink-0">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#a0aec0] text-sm">{section.content}</p>
                )}
              </div>
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function RulesHelpButton({
  onClick,
  size = 'md',
}: {
  onClick: (e: React.MouseEvent) => void
  size?: 'sm' | 'md'
}) {
  const cls = size === 'sm'
    ? 'w-5 h-5 text-[10px]'
    : 'w-6 h-6 text-xs'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cls} rounded-full bg-[#4a5568] text-white hover:bg-[#718096] flex items-center justify-center font-bold shrink-0 transition-colors`}
      aria-label="Kuralları göster"
    >
      ?
    </button>
  )
}
