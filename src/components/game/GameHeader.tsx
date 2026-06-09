import { useState } from 'react'
import { BackButton } from '@/components/layout/BackButton'
import { getGameBadgeLabel } from '@/lib/gameTypes'
import type { Game } from '@/types'
import { formatGameDate } from '@/lib/dateUtils'
import { Settings, Flag } from 'lucide-react'
import { GameRulesModal, RulesHelpButton } from '@/components/GameRulesModal'
import { toRulesKey } from '@/lib/gameRules'

interface GameHeaderProps {
  game: Game
  isFinished: boolean
  subtitle?: string
  onSettings?: () => void
  onEndGame?: () => void
  showEndGame?: boolean
}

export function GameHeader({
  game,
  isFinished,
  subtitle,
  onSettings,
  onEndGame,
  showEndGame,
}: GameHeaderProps) {
  const note = 'note' in game.settings ? game.settings.note : undefined
  const [showRules, setShowRules] = useState(false)
  const rulesKey = toRulesKey(game.game_type)

  return (
    <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top shrink-0">
      <div className="flex items-center justify-between py-3 max-w-lg mx-auto">
        <BackButton showLabel={isFinished} className="shrink-0" />
        <div className="text-center flex-1 min-w-0 px-2">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <span className="inline-block bg-[#0f3460] text-[#a0aec0] text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#2d3748]">
              {getGameBadgeLabel(game)}
            </span>
            {rulesKey && (
              <RulesHelpButton
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowRules(true)
                }}
              />
            )}
          </div>
          {isFinished ? (
            <span className="block bg-[#f5a623]/25 text-[#f5a623] text-xs font-bold px-3 py-1 rounded-full mb-1 border border-[#f5a623]/40">
              ✓ Tamamlanan Oyun
            </span>
          ) : subtitle ? (
            <p className="text-white font-semibold text-sm">{subtitle}</p>
          ) : null}
          {note && <p className="text-white text-xs font-medium truncate">{note}</p>}
          <p className="text-[#718096] text-xs">{formatGameDate(game.created_at)}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {showEndGame && onEndGame && !isFinished && (
            <button
              type="button"
              onClick={onEndGame}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#f5a623] hover:text-white transition-colors"
              title="Oyunu Bitir"
            >
              <Flag size={16} />
            </button>
          )}
          {onSettings && !isFinished ? (
            <button
              type="button"
              onClick={onSettings}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0] hover:text-white transition-colors"
            >
              <Settings size={18} />
            </button>
          ) : (
            !showEndGame && <div className="w-9" />
          )}
        </div>
      </div>

      {rulesKey && (
        <GameRulesModal
          gameType={rulesKey}
          isOpen={showRules}
          onClose={() => setShowRules(false)}
        />
      )}
    </div>
  )
}
