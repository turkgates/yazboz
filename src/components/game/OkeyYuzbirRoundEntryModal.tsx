import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { Game } from '@/types'
import { getTeams, isEsliGame, teamLabel } from '@/lib/gameTypes'
import {
  type OkeyYuzbirFinishType,
  type OkeyYuzbirPlayerInput,
  OKEY_YUZBIR_FINISH_SCORES,
  OKEY_YUZBIR_NOT_OPENED_PENALTY,
  OKEY_YUZBIR_OKEY_IN_HAND_PENALTY,
  OKEY_YUZBIR_WRONG_OPEN_PENALTY,
  calculate101Score,
} from '@/lib/101calculations'

export interface OkeyYuzbirRoundInput {
  playerInputs: OkeyYuzbirPlayerInput[]
  maxOpenScore?: number // for katlamali
}

interface Props {
  game: Game
  roundNumber: number
  katlamali: boolean
  prevMaxOpenScore: number | null
  onSave: (input: OkeyYuzbirRoundInput) => void
  onClose: () => void
}

const FINISH_LABELS: Record<OkeyYuzbirFinishType, string> = {
  normal: `Normal (${OKEY_YUZBIR_FINISH_SCORES.normal})`,
  elden: `Elden (${OKEY_YUZBIR_FINISH_SCORES.elden})`,
  okey_ile: `Okey ile (${OKEY_YUZBIR_FINISH_SCORES.okey_ile})`,
  elden_okey: `Elden + Okey (${OKEY_YUZBIR_FINISH_SCORES.elden_okey})`,
}

type PlayerState = {
  hasOpened: boolean
  tileSum: string
  wrongOpen: boolean
  okeyInHand: boolean
}

type Step = 'winner' | 'finish_type' | 'others'

export function OkeyYuzbirRoundEntryModal({
  game,
  roundNumber,
  katlamali,
  prevMaxOpenScore,
  onSave,
  onClose,
}: Props) {
  const esli = isEsliGame(game)
  const teams = esli ? getTeams(game) : []
  const entities: string[] = esli ? teams.map(teamLabel) : game.players

  const [step, setStep] = useState<Step>('winner')
  const [winnerEntity, setWinnerEntity] = useState<string | null>(null)
  const [finishType, setFinishType] = useState<OkeyYuzbirFinishType>('normal')
  const [playerStates, setPlayerStates] = useState<Record<string, PlayerState>>({})
  const [maxOpenScore, setMaxOpenScore] = useState('')
  const [saveError, setSaveError] = useState('')

  const minOpenScore = katlamali && prevMaxOpenScore !== null ? prevMaxOpenScore + 1 : 101

  useEffect(() => {
    const init: Record<string, PlayerState> = {}
    for (const e of entities) {
      init[e] = { hasOpened: false, tileSum: '', wrongOpen: false, okeyInHand: false }
    }
    setPlayerStates(init)
  }, [entities.join(',')])

  const setPlayerState = (entity: string, updates: Partial<PlayerState>) => {
    setPlayerStates((prev) => ({ ...prev, [entity]: { ...prev[entity], ...updates } }))
  }

  const buildInputs = (): OkeyYuzbirPlayerInput[] => {
    if (esli) {
      return entities.map((label) => {
        const ps = playerStates[label]
        if (!ps) return { playerName: label, isWinner: false, hasOpened: false }
        return {
          playerName: label,
          isWinner: winnerEntity === label,
          finishType: winnerEntity === label ? finishType : undefined,
          hasOpened: winnerEntity === label ? true : ps.hasOpened,
          tileSum: ps.hasOpened ? (parseInt(ps.tileSum) || 0) : undefined,
          wrongOpen: ps.wrongOpen,
          okeyInHand: ps.okeyInHand,
        }
      })
    }

    return entities.map((name) => {
      const ps = playerStates[name]
      if (!ps) return { playerName: name, isWinner: false, hasOpened: false }
      return {
        playerName: name,
        isWinner: winnerEntity === name,
        finishType: winnerEntity === name ? finishType : undefined,
        hasOpened: winnerEntity === name ? true : ps.hasOpened,
        tileSum: ps.hasOpened ? (parseInt(ps.tileSum) || 0) : undefined,
        wrongOpen: ps.wrongOpen,
        okeyInHand: ps.okeyInHand,
      }
    })
  }

  const previewScore = (entity: string): number | null => {
    if (!winnerEntity) return null
    const ps = playerStates[entity]
    if (!ps) return null
    const input: OkeyYuzbirPlayerInput = {
      playerName: entity,
      isWinner: winnerEntity === entity,
      finishType: winnerEntity === entity ? finishType : undefined,
      hasOpened: winnerEntity === entity ? true : ps.hasOpened,
      tileSum: ps.hasOpened ? (parseInt(ps.tileSum) || 0) : undefined,
      wrongOpen: ps.wrongOpen,
      okeyInHand: ps.okeyInHand,
    }
    return calculate101Score(input)
  }

  const handleSave = () => {
    if (!winnerEntity) {
      setSaveError('Biten oyuncuyu seçin')
      return
    }
    setSaveError('')
    const inputs = buildInputs()
    const parsedMax = katlamali && maxOpenScore ? parseInt(maxOpenScore) : undefined
    onSave({ playerInputs: inputs, maxOpenScore: parsedMax })
  }

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
        className="relative w-full max-w-lg bg-[#16213e] rounded-t-3xl border-t border-x border-[#2d3748] safe-bottom max-h-[92dvh] flex flex-col overflow-hidden"
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#4a5568]" />
        </div>
        <div className="px-5 pb-3 border-b border-[#2d3748] shrink-0">
          <h3 className="text-white font-bold">El {roundNumber} — 101 Okey</h3>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Step indicator */}
          <div className="flex gap-2">
            {(['winner', 'finish_type', 'others'] as Step[]).map((s, i) => {
              const labels = ['Kim Bitti', 'Bitiş Türü', 'Diğer Oyuncular']
              const done = (step === 'finish_type' && s === 'winner') ||
                (step === 'others' && (s === 'winner' || s === 'finish_type'))
              const active = step === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    if (done || active) setStep(s)
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-colors ${
                    active
                      ? 'bg-[#e94560] text-white'
                      : done
                        ? 'bg-[#0f3460] text-[#a0aec0]'
                        : 'bg-[#2d3748] text-[#4a5568]'
                  }`}
                >
                  {i + 1}. {labels[i]}
                </button>
              )
            })}
          </div>

          {/* STEP 1 — Kim bitti */}
          {step === 'winner' && (
            <section>
              <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
                {esli ? 'Hangi takım bitti?' : 'Kim bitti?'}
              </p>
              <div className="flex flex-col gap-2">
                {entities.map((entity) => (
                  <button
                    key={entity}
                    type="button"
                    onClick={() => {
                      setWinnerEntity(entity)
                      setStep('finish_type')
                    }}
                    className={`p-3.5 rounded-xl border text-left font-semibold transition-all ${
                      winnerEntity === entity
                        ? 'bg-green-600/20 border-green-500 text-green-400'
                        : 'bg-[#0f3460]/40 border-[#2d3748] text-white hover:border-green-600/50'
                    }`}
                  >
                    {entity}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* STEP 2 — Bitiş türü */}
          {step === 'finish_type' && (
            <section>
              <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
                Bitiş Türü
              </p>
              <div className="flex flex-col gap-2">
                {(Object.keys(FINISH_LABELS) as OkeyYuzbirFinishType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFinishType(type)}
                    className={`p-3.5 rounded-xl border text-left font-semibold transition-all ${
                      finishType === type
                        ? 'bg-[#f5a623]/20 border-[#f5a623] text-[#f5a623]'
                        : 'bg-[#0f3460]/40 border-[#2d3748] text-white'
                    }`}
                  >
                    {FINISH_LABELS[type]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStep('others')}
                className="w-full mt-4 bg-[#e94560] text-white font-bold py-3.5 rounded-xl"
              >
                Devam →
              </button>
            </section>
          )}

          {/* STEP 3 — Diğer oyuncular */}
          {step === 'others' && (
            <>
              {katlamali && (
                <section className="bg-[#0f3460]/30 border border-[#2d3748] rounded-xl p-4">
                  <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2">
                    Katlamalı — Bu Elin En Yüksek Açılış Puanı
                  </p>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={`Min. açılış: ${minOpenScore}`}
                    value={maxOpenScore}
                    onChange={(e) => setMaxOpenScore(e.target.value)}
                    className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-[#e94560]"
                  />
                  {maxOpenScore && parseInt(maxOpenScore) > 0 && (
                    <p className="text-[#718096] text-xs mt-2">
                      Sonraki el için minimum açılış: <span className="text-white">{parseInt(maxOpenScore) + 1}</span>
                    </p>
                  )}
                </section>
              )}

              <section>
                <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
                  Diğer {esli ? 'Takımlar' : 'Oyuncular'}
                </p>
                <div className="flex flex-col gap-3">
                  {entities.filter((e) => e !== winnerEntity).map((entity) => {
                    const ps = playerStates[entity] ?? { hasOpened: false, tileSum: '', wrongOpen: false, okeyInHand: false }
                    return (
                      <div key={entity} className="bg-[#0f3460]/40 border border-[#2d3748] rounded-xl p-3">
                        <p className="text-white text-sm font-semibold mb-3">{entity}</p>
                        <div className="flex gap-2 mb-3">
                          <button
                            type="button"
                            onClick={() => setPlayerState(entity, { hasOpened: false })}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold ${
                              !ps.hasOpened
                                ? 'bg-red-600 text-white'
                                : 'bg-[#2d3748] text-[#a0aec0]'
                            }`}
                          >
                            Açmadı (+{OKEY_YUZBIR_NOT_OPENED_PENALTY})
                          </button>
                          <button
                            type="button"
                            onClick={() => setPlayerState(entity, { hasOpened: true })}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold ${
                              ps.hasOpened
                                ? 'bg-blue-600 text-white'
                                : 'bg-[#2d3748] text-[#a0aec0]'
                            }`}
                          >
                            Açtı
                          </button>
                        </div>
                        {ps.hasOpened && (
                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder="Elindeki taş toplamı"
                            value={ps.tileSum}
                            onChange={(e) => setPlayerState(entity, { tileSum: e.target.value })}
                            className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-[#e94560] mb-3"
                          />
                        )}
                        <div className="flex gap-2">
                          <label className="flex items-center gap-2 flex-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={ps.wrongOpen}
                              onChange={(e) => setPlayerState(entity, { wrongOpen: e.target.checked })}
                              className="accent-orange-500 w-4 h-4"
                            />
                            <span className="text-[#a0aec0] text-xs">Yanlış açma (+{OKEY_YUZBIR_WRONG_OPEN_PENALTY})</span>
                          </label>
                          <label className="flex items-center gap-2 flex-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={ps.okeyInHand}
                              onChange={(e) => setPlayerState(entity, { okeyInHand: e.target.checked })}
                              className="accent-red-500 w-4 h-4"
                            />
                            <span className="text-[#a0aec0] text-xs">Okey elde (+{OKEY_YUZBIR_OKEY_IN_HAND_PENALTY})</span>
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Preview */}
              {winnerEntity && (
                <section className="bg-[#0f3460]/30 border border-[#2d3748] rounded-xl p-4">
                  <p className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">Önizleme</p>
                  <div className="flex flex-col gap-1.5">
                    {entities.map((entity) => {
                      const score = previewScore(entity)
                      if (score === null) return null
                      return (
                        <div key={entity} className="flex justify-between text-sm">
                          <span className="text-white truncate mr-2">
                            {entity}
                            {entity === winnerEntity && <span className="text-green-400 text-xs ml-1">(bitti)</span>}
                          </span>
                          <span className={`font-bold shrink-0 ${score <= -202 ? 'text-[#f5a623]' : score < 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {score > 0 ? `+${score}` : score}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {saveError && <p className="px-5 text-red-400 text-sm text-center">{saveError}</p>}

        <div className="px-5 pb-5 flex gap-3 shrink-0 border-t border-[#2d3748] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3.5 rounded-xl"
          >
            İptal
          </button>
          {step === 'others' && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!winnerEntity}
              className="flex-[2] bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl"
            >
              Kaydet
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
