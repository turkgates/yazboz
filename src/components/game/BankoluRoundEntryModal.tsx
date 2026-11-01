import { useEffect, useMemo, useState } from 'react'
import { useSaveLock } from '@/hooks/useSaveLock'
import type { Color, Game } from '@/types'
import { getTeams, isBankoluEsli, teamLabel } from '@/lib/gameTypes'
import { playerIsBanko } from '@/lib/bankoluUtils'
import {
  type BankoluColor,
  type BankoluPlayerInput,
  type BankoluRoundInput,
  calculateBankoluScores,
} from '@/lib/bankoluCalculations'
import {
  ColorPicker,
  EntryRow,
  EntrySection,
  EntrySheet,
  PointsInput,
  SaveButton,
  ToggleChip,
  WinnerPicker,
} from '@/components/game/RoundEntryParts'

export interface BankoluRoundSavePayload {
  color: Color
  fakeOkey: boolean
  okeyThrown: boolean
  doubleFinish: boolean
  scores: Record<string, number>
  bankoPlayers: string[]
}

interface Props {
  game: Game
  roundNumber: number
  currentBankos: string[]
  onSave: (payload: BankoluRoundSavePayload) => Promise<boolean>
  onClose: () => void
}

type PlayerUIStatus = 'normal' | 'winner' | 'okey_burned'

export function BankoluRoundEntryModal({
  game,
  roundNumber,
  currentBankos,
  onSave,
  onClose,
}: Props) {
  const { saving, runSave } = useSaveLock()
  const handleClose = () => {
    if (!saving) onClose()
  }

  const esli = isBankoluEsli(game)
  const teams = esli ? getTeams(game) : []

  const [color, setColor] = useState<Color | null>(null)
  const [fakeOkey, setFakeOkey] = useState(false)
  const [okeyThrown, setOkeyThrown] = useState(false)
  const [doubleFinish, setDoubleFinish] = useState(false)
  const [playerStatuses, setPlayerStatuses] = useState<Record<string, PlayerUIStatus>>({})
  const [rawPoints, setRawPoints] = useState<Record<string, string>>({})
  const [fakeOpeners, setFakeOpeners] = useState<Record<string, boolean>>({})
  const [winnerTeam, setWinnerTeam] = useState<string | null>(null)

  useEffect(() => {
    const statuses: Record<string, PlayerUIStatus> = {}
    const pts: Record<string, string> = {}
    const openers: Record<string, boolean> = {}
    for (const p of game.players) {
      statuses[p] = 'normal'
      pts[p] = ''
      openers[p] = false
    }
    setPlayerStatuses(statuses)
    setRawPoints(pts)
    setFakeOpeners(openers)
    setColor(null)
    setFakeOkey(false)
    setOkeyThrown(false)
    setDoubleFinish(false)
    setWinnerTeam(null)
  }, [game.players.join(','), roundNumber])

  const bankoluColor = (): BankoluColor => {
    if (fakeOkey) return 'fake'
    return color ?? 'black'
  }

  const buildRoundInput = (): BankoluRoundInput | null => {
    if (!fakeOkey && !color) return null

    const players: BankoluPlayerInput[] = game.players.map((name) => {
      const isBanko = playerIsBanko(name, currentBankos, game)
      let isWinner = playerStatuses[name] === 'winner'
      if (esli && winnerTeam) {
        const team = teams.find((t) => teamLabel(t) === winnerTeam)
        isWinner = team?.includes(name) ?? false
      }
      return {
        name,
        isBanko,
        isWinner,
        isFakeOkeyOpener: fakeOpeners[name] ?? false,
        isOkeyBurned: playerStatuses[name] === 'okey_burned',
        rawPoints: parseInt(rawPoints[name] || '0') || 0,
      }
    })

    return {
      color: bankoluColor(),
      okeyThrown,
      doubleFinish,
      players,
    }
  }

  const previewScores = useMemo(() => {
    const input = buildRoundInput()
    if (!input) return null
    return calculateBankoluScores(input)
  }, [color, fakeOkey, okeyThrown, doubleFinish, playerStatuses, rawPoints, fakeOpeners, winnerTeam, currentBankos.join(',')])

  const previewDisplay = useMemo(() => {
    if (!previewScores) return null
    if (!esli) return previewScores

    const teamScores: Record<string, number> = {}
    for (const team of teams) {
      const label = teamLabel(team)
      teamScores[label] = team.reduce((sum, p) => sum + (previewScores[p] ?? 0), 0)
    }
    return teamScores
  }, [previewScores, esli, teams])

  const winnerPlayer = game.players.find((p) => playerStatuses[p] === 'winner') ?? null

  const handleSave = () => {
    if (missing) return

    const input = buildRoundInput()
    if (!input) return

    const playerScores = calculateBankoluScores(input)
    let scores: Record<string, number> = playerScores

    if (esli) {
      scores = {}
      for (const team of teams) {
        const label = teamLabel(team)
        scores[label] = team.reduce((sum, p) => sum + (playerScores[p] ?? 0), 0)
      }
    }

    void runSave(() =>
      onSave({
        color: fakeOkey ? 'black' : color!,
        fakeOkey,
        okeyThrown,
        doubleFinish,
        scores,
        bankoPlayers: currentBankos,
      })
    )
  }

  const handleWinnerSelect = (option: string) => {
    if (esli) {
      setWinnerTeam(winnerTeam === option ? null : option)
      return
    }
    setStatus(option, winnerPlayer === option ? 'normal' : 'winner')
  }

  const handleFakeOkeySelect = () => {
    setFakeOkey(true)
    setColor(null)
    setOkeyThrown(false)
    setDoubleFinish(false)
  }

  const setStatus = (player: string, status: PlayerUIStatus) => {
    if (esli) return
    setPlayerStatuses((prev) => {
      const next = { ...prev }
      if (status === 'winner') {
        for (const p of game.players) {
          if (next[p] === 'winner') next[p] = 'normal'
        }
      }
      next[player] = status
      return next
    })
  }

  const hasWinner = esli ? !!winnerTeam : !!winnerPlayer
  const missing = !hasWinner
    ? (esli ? 'Biten takımı seç' : 'Biten oyuncuyu seç')
    : !fakeOkey && !color
      ? 'Okey rengini seç'
      : null

  const winnerTeamPlayers = teams.find((t) => teamLabel(t) === winnerTeam) ?? []
  const entities = esli ? teams.map(teamLabel) : game.players
  const winnerOption = esli ? winnerTeam : winnerPlayer

  // Kazanan seçilmeden gösterilen puan yanıltıcı olur
  const shownScores = hasWinner ? previewDisplay : null

  return (
    <EntrySheet
      title={`${roundNumber}. El`}
      onClose={handleClose}
      footer={<SaveButton saving={saving} missing={missing} onClick={handleSave} />}
    >
      <EntrySection title={esli ? 'Hangi takım bitti?' : 'Kim bitti?'}>
        <WinnerPicker
          options={entities}
          selected={winnerOption}
          onSelect={handleWinnerSelect}
          singleColumn={esli}
          scores={esli
            ? shownScores ?? undefined
            : winnerPlayer
              ? { [winnerPlayer]: shownScores?.[winnerPlayer] }
              : undefined}
        />
      </EntrySection>

      <EntrySection title="Okey rengi">
        <ColorPicker
          color={color}
          fakeOkey={fakeOkey}
          onColor={(c) => { setColor(c); setFakeOkey(false) }}
          onFakeOkey={handleFakeOkeySelect}
        />
      </EntrySection>

      {hasWinner && !fakeOkey && (
        <EntrySection title="Nasıl bitti?">
          <div className="flex gap-2">
            <ToggleChip label="Okey attı" active={okeyThrown} onClick={() => setOkeyThrown(!okeyThrown)} />
            <ToggleChip label="Çiftten bitti" active={doubleFinish} onClick={() => setDoubleFinish(!doubleFinish)} />
          </div>
        </EntrySection>
      )}

      {hasWinner && (
        <EntrySection title="Elindeki puanlar">
          <div className="flex flex-col gap-2">
            {game.players.map((player) => {
              const isWinner = esli ? winnerTeamPlayers.includes(player) : player === winnerPlayer
              const isBurned = playerStatuses[player] === 'okey_burned'
              const isBanko = playerIsBanko(player, currentBankos, game)

              return (
                <EntryRow
                  key={player}
                  name={<>{isBanko && <span title="Bankocu">💥 </span>}{player}</>}
                  score={previewScores?.[player]}
                  extra={fakeOkey && (
                    <ToggleChip
                      size="sm"
                      tone="purple"
                      label="🃏 Sahte okey açtı (+100)"
                      active={fakeOpeners[player] ?? false}
                      onClick={() => setFakeOpeners((prev) => ({ ...prev, [player]: !prev[player] }))}
                    />
                  )}
                >
                  {isWinner ? (
                    <span className="text-green-400 text-xs font-semibold shrink-0">Bitti</span>
                  ) : (
                    <>
                      {!esli && (
                        <ToggleChip
                          size="sm"
                          tone="orange"
                          label="🔥 Yaktı"
                          active={isBurned}
                          onClick={() => setStatus(player, isBurned ? 'normal' : 'okey_burned')}
                        />
                      )}
                      <PointsInput
                        label={`${player} puanı`}
                        value={rawPoints[player] ?? ''}
                        onChange={(value) => setRawPoints((prev) => ({ ...prev, [player]: value }))}
                      />
                    </>
                  )}
                </EntryRow>
              )
            })}
          </div>
        </EntrySection>
      )}
    </EntrySheet>
  )
}
