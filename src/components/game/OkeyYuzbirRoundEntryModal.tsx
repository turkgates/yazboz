import { useEffect, useState } from 'react'
import { useSaveLock } from '@/hooks/useSaveLock'
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
import {
  EntryRow,
  EntrySection,
  EntrySheet,
  PointsInput,
  SaveButton,
  ToggleChip,
  WinnerPicker,
} from '@/components/game/RoundEntryParts'

export interface OkeyYuzbirRoundInput {
  playerInputs: OkeyYuzbirPlayerInput[]
  maxOpenScore?: number // for katlamali
}

interface Props {
  game: Game
  roundNumber: number
  katlamali: boolean
  prevMaxOpenScore: number | null
  onSave: (input: OkeyYuzbirRoundInput) => Promise<boolean>
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

export function OkeyYuzbirRoundEntryModal({
  game,
  roundNumber,
  katlamali,
  prevMaxOpenScore,
  onSave,
  onClose,
}: Props) {
  const { saving, runSave } = useSaveLock()
  const handleClose = () => {
    if (!saving) onClose()
  }

  const esli = isEsliGame(game)
  const teams = esli ? getTeams(game) : []
  const entities: string[] = esli ? teams.map(teamLabel) : game.players

  const [winnerEntity, setWinnerEntity] = useState<string | null>(null)
  const [finishType, setFinishType] = useState<OkeyYuzbirFinishType>('normal')
  const [playerStates, setPlayerStates] = useState<Record<string, PlayerState>>({})
  const [maxOpenScore, setMaxOpenScore] = useState('')

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
    if (!winnerEntity) return
    const inputs = buildInputs()
    const parsedMax = katlamali && maxOpenScore ? parseInt(maxOpenScore) : undefined
    void runSave(() => onSave({ playerInputs: inputs, maxOpenScore: parsedMax }))
  }

  return (
    <EntrySheet
      title={`${roundNumber}. El`}
      onClose={handleClose}
      footer={<SaveButton saving={saving} missing={winnerEntity ? null : (esli ? 'Biten takımı seç' : 'Biten oyuncuyu seç')} onClick={handleSave} />}
    >
      <EntrySection title={esli ? 'Hangi takım bitti?' : 'Kim bitti?'}>
        <WinnerPicker
          options={entities}
          selected={winnerEntity}
          onSelect={(entity) => setWinnerEntity(winnerEntity === entity ? null : entity)}
          singleColumn={esli}
          scores={winnerEntity ? { [winnerEntity]: previewScore(winnerEntity) } : undefined}
        />
      </EntrySection>

      {winnerEntity && (
        <>
          <EntrySection title="Nasıl bitti?">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(FINISH_LABELS) as OkeyYuzbirFinishType[]).map((type) => (
                <ToggleChip
                  key={type}
                  tone="amber"
                  label={FINISH_LABELS[type]}
                  active={finishType === type}
                  onClick={() => setFinishType(type)}
                />
              ))}
            </div>
          </EntrySection>

          {katlamali && (
            <EntrySection title="Bu elin en yüksek açılışı">
              <input
                type="number"
                inputMode="numeric"
                placeholder={`En az ${minOpenScore}`}
                value={maxOpenScore}
                onChange={(e) => setMaxOpenScore(e.target.value)}
                className="w-full h-11 bg-[#1a1a2e] border border-[#2d3748] rounded-lg px-3 text-white text-base placeholder-[#4a5568] focus:outline-none focus:border-[#e94560]"
              />
              {maxOpenScore && parseInt(maxOpenScore) > 0 && (
                <p className="text-[#718096] text-xs mt-2">
                  Sonraki elde en az <span className="text-white">{parseInt(maxOpenScore) + 1}</span> ile açılır.
                </p>
              )}
            </EntrySection>
          )}

          <EntrySection title={esli ? 'Diğer takım' : 'Diğer oyuncular'}>
            <div className="flex flex-col gap-1.5">
              {entities.filter((e) => e !== winnerEntity).map((entity) => {
                const ps = playerStates[entity] ?? { hasOpened: false, tileSum: '', wrongOpen: false, okeyInHand: false }
                return (
                  <EntryRow
                    key={entity}
                    name={entity}
                    score={previewScore(entity)}
                    extra={
                      <>
                        <ToggleChip
                          size="sm"
                          label={`Açmadı +${OKEY_YUZBIR_NOT_OPENED_PENALTY}`}
                          active={!ps.hasOpened}
                          onClick={() => setPlayerState(entity, { hasOpened: false })}
                        />
                        <ToggleChip
                          size="sm"
                          label="Açtı"
                          active={ps.hasOpened}
                          onClick={() => setPlayerState(entity, { hasOpened: true })}
                        />
                        <ToggleChip
                          size="sm"
                          tone="orange"
                          label={`Yanlış +${OKEY_YUZBIR_WRONG_OPEN_PENALTY}`}
                          active={ps.wrongOpen}
                          onClick={() => setPlayerState(entity, { wrongOpen: !ps.wrongOpen })}
                        />
                        <ToggleChip
                          size="sm"
                          tone="orange"
                          label={`Okey +${OKEY_YUZBIR_OKEY_IN_HAND_PENALTY}`}
                          active={ps.okeyInHand}
                          onClick={() => setPlayerState(entity, { okeyInHand: !ps.okeyInHand })}
                        />
                      </>
                    }
                  >
                    {ps.hasOpened && (
                      <PointsInput
                        label={`${entity} taş toplamı`}
                        placeholder="Taş"
                        value={ps.tileSum}
                        onChange={(value) => setPlayerState(entity, { tileSum: value })}
                      />
                    )}
                  </EntryRow>
                )
              })}
            </div>
          </EntrySection>
        </>
      )}
    </EntrySheet>
  )
}
