import { useEffect, useState } from 'react'
import { useSaveLock } from '@/hooks/useSaveLock'
import type { Color, Game, Round, RoundInput, CezaliGameSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import { isCezaliSettings, teamLabel } from '@/lib/gameTypes'
import type { PlayerRoundInput } from '@/lib/calculations'
import {
  deriveOkeyBurnType,
  getFakeOkeyLoserMultiplier,
  getLoserMultiplier,
  inferRoundInputFromScores,
  previewRoundScore,
} from '@/lib/calculations'
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

interface RoundEntryModalProps {
  game: Game
  roundNumber: number
  editingRound?: Round | null
  teams?: string[][]
  onSave: (input: RoundInput) => Promise<boolean>
  onClose: () => void
}

type PlayerUIStatus = 'normal' | 'okey_burned' | 'winner'

export function RoundEntryModal({
  game,
  roundNumber,
  editingRound,
  teams,
  onSave,
  onClose,
}: RoundEntryModalProps) {
  const { saving, runSave } = useSaveLock()
  const handleClose = () => {
    if (!saving) onClose()
  }

  const settings: CezaliGameSettings = isCezaliSettings(game.settings) ? game.settings : DEFAULT_SETTINGS
  const isEditing = !!editingRound
  const teamMode = teams !== undefined && teams.length > 0
  const teamLabels = teamMode ? teams!.map(teamLabel) : []

  const [color, setColor] = useState<Color | null>(editingRound?.color ?? null)
  const [fakeOkey, setFakeOkey] = useState(editingRound?.fake_okey ?? false)
  const [okeyThrown, setOkeyThrown] = useState(editingRound?.okey_thrown ?? false)
  const [doubleFinish, setDoubleFinish] = useState(editingRound?.double_finish ?? false)
  const [noWinner, setNoWinner] = useState(false)
  const [playerStatuses, setPlayerStatuses] = useState<Record<string, PlayerUIStatus>>({})
  const [rawPoints, setRawPoints] = useState<Record<string, string>>({})
  const [winnerTeam, setWinnerTeam] = useState<string | null>(null)
  const [teamRawPoints, setTeamRawPoints] = useState<Record<string, string>>({})

  useEffect(() => {
    const initial: Record<string, PlayerUIStatus> = {}
    const initialRaw: Record<string, string> = {}
    for (const p of game.players) {
      initial[p] = 'normal'
      initialRaw[p] = ''
    }
    setPlayerStatuses(initial)
    setRawPoints(initialRaw)
    setNoWinner(false)

    if (teamMode) {
      const teamPts: Record<string, string> = {}
      for (const label of teamLabels) teamPts[label] = ''
      setTeamRawPoints(teamPts)
      setWinnerTeam(null)
    }
  }, [game.players, teamMode, teamLabels.join(',')])

  useEffect(() => {
    if (!editingRound) return

    const details = editingRound.details?.kind === 'cezali' ? editingRound.details : null

    if (details) {
      setColor(editingRound.color)
      setFakeOkey(editingRound.fake_okey ?? false)
      setOkeyThrown(editingRound.okey_thrown)
      setDoubleFinish(editingRound.double_finish)
      setNoWinner(details.no_winner)

      const raw: Record<string, string> = {}
      const statuses: Record<string, PlayerUIStatus> = {}
      for (const name of teamMode ? teamLabels : game.players) {
        const entry = details.players[name]
        raw[name] = entry?.raw ? String(entry.raw) : ''
        statuses[name] =
          entry?.status === 'winner' || entry?.status === 'okey_burned' ? entry.status : 'normal'
      }

      if (teamMode) {
        setTeamRawPoints(raw)
        setWinnerTeam(teamLabels.find((label) => details.players[label]?.status === 'winner') ?? null)
      } else {
        setPlayerStatuses(statuses)
        setRawPoints(raw)
      }
      return
    }

    if (teamMode) {
      setColor(editingRound.color)
      setFakeOkey(editingRound.fake_okey ?? false)
      setOkeyThrown(editingRound.okey_thrown)
      setDoubleFinish(editingRound.double_finish)

      const teamPts: Record<string, string> = {}
      let foundWinner: string | null = null

      for (const label of teamLabels) {
        const score = editingRound.scores[label] ?? 0
        teamPts[label] = ''
        if (score < 0) foundWinner = label
        else if (score > 0) {
          const mult = editingRound.fake_okey
            ? getFakeOkeyLoserMultiplier(editingRound.okey_thrown, editingRound.double_finish)
            : getLoserMultiplier(
                editingRound.color,
                editingRound.okey_thrown,
                editingRound.double_finish,
                settings.colorMultipliers
              )
          if (mult > 0) teamPts[label] = String(Math.round(score / mult))
        }
      }

      setTeamRawPoints(teamPts)
      setWinnerTeam(foundWinner)
      setNoWinner(!foundWinner && teamLabels.every((l) => (editingRound.scores[l] ?? 0) > 0))
      return
    }

    const inferred = inferRoundInputFromScores(editingRound, game.players, settings)
    setColor(editingRound.color)
    setFakeOkey(inferred.fakeOkey)
    setOkeyThrown(editingRound.okey_thrown)
    setDoubleFinish(editingRound.double_finish)
    setNoWinner(inferred.noWinner)
    setPlayerStatuses(inferred.playerStatuses)
    setRawPoints(inferred.rawPoints)
  }, [editingRound, game.players, settings, teamMode, teamLabels.join(',')])

  const winner = teamMode
    ? winnerTeam
    : game.players.find((p) => playerStatuses[p] === 'winner') ?? null

  const handleColorSelect = (next: Color) => {
    setColor(next)
    setFakeOkey(false)
  }

  const handleFakeOkeySelect = () => {
    setFakeOkey(true)
    setOkeyThrown(false)
    if (!color) setColor('black')
  }

  const handleNoWinnerToggle = () => {
    const next = !noWinner
    setNoWinner(next)
    if (next) {
      if (teamMode) {
        setWinnerTeam(null)
      } else {
        const updated: Record<string, PlayerUIStatus> = {}
        for (const p of game.players) updated[p] = 'normal'
        setPlayerStatuses(updated)
      }
      setOkeyThrown(false)
      setDoubleFinish(false)
    }
  }

  const handleWinnerSelect = (option: string) => {
    setNoWinner(false)

    if (teamMode) {
      setWinnerTeam(winnerTeam === option ? null : option)
      return
    }

    setPlayerStatuses((prev) => {
      const next = { ...prev }
      for (const p of game.players) {
        if (next[p] === 'winner') next[p] = 'normal'
      }
      if (prev[option] !== 'winner') next[option] = 'winner'
      return next
    })
  }

  const toggleBurned = (player: string) => {
    setPlayerStatuses((prev) => ({
      ...prev,
      [player]: prev[player] === 'okey_burned' ? 'normal' : 'okey_burned',
    }))
  }

  const buildTeamInput = (label: string): PlayerRoundInput => {
    if (noWinner) {
      return {
        playerName: label,
        status: 'no_winner',
        rawPoints: parseInt(teamRawPoints[label] || '0', 10) || 0,
      }
    }
    if (winnerTeam === label) {
      return { playerName: label, status: 'winner' }
    }
    return {
      playerName: label,
      status: 'loser',
      rawPoints: parseInt(teamRawPoints[label] || '0', 10) || 0,
    }
  }

  const buildPlayerInput = (player: string): PlayerRoundInput => {
    const status = playerStatuses[player] ?? 'normal'

    if (noWinner) {
      return {
        playerName: player,
        status: 'no_winner',
        rawPoints: parseInt(rawPoints[player] || '0', 10) || 0,
      }
    }

    if (status === 'winner') {
      return { playerName: player, status: 'winner' }
    }

    if (status === 'okey_burned') {
      return {
        playerName: player,
        status: 'okey_burned',
        okeyBurnType: deriveOkeyBurnType(okeyThrown, doubleFinish),
      }
    }

    return {
      playerName: player,
      status: 'loser',
      rawPoints: parseInt(rawPoints[player] || '0', 10) || 0,
    }
  }

  const effectiveColor = color ?? 'black'

  const getPreviewScore = (input: PlayerRoundInput): number | null => {
    if (!fakeOkey && !color) return null
    if (!noWinner && !winner) return null
    return previewRoundScore(input, effectiveColor, okeyThrown, doubleFinish, settings, fakeOkey)
  }

  const entities = teamMode ? teamLabels : game.players
  const buildInput = teamMode ? buildTeamInput : buildPlayerInput

  const missing = !noWinner && !winner
    ? (teamMode ? 'Biten takımı seç' : 'Biten oyuncuyu seç')
    : !fakeOkey && !color
      ? 'Okey rengini seç'
      : null

  const handleSave = () => {
    if (missing) return

    const playerResults = entities.map(buildInput)

    void runSave(() =>
      onSave({
        color: effectiveColor,
        okeyThrown: fakeOkey ? false : okeyThrown,
        doubleFinish,
        fakeOkey,
        noWinner,
        playerResults,
      })
    )
  }

  return (
    <EntrySheet
      title={isEditing ? `${editingRound.round_number}. El · Düzenle` : `${roundNumber}. El`}
      onClose={handleClose}
      footer={<SaveButton saving={saving} missing={missing} onClick={handleSave} />}
    >
      <EntrySection title={teamMode ? 'Hangi takım bitti?' : 'Kim bitti?'}>
        <WinnerPicker
          options={entities}
          selected={winner}
          onSelect={handleWinnerSelect}
          singleColumn={teamMode}
          scores={winner ? { [winner]: getPreviewScore(buildInput(winner)) } : undefined}
          noWinner={{ selected: noWinner, onSelect: handleNoWinnerToggle }}
        />
      </EntrySection>

      <EntrySection title="Okey rengi">
        <ColorPicker
          color={color}
          fakeOkey={fakeOkey}
          onColor={handleColorSelect}
          onFakeOkey={handleFakeOkeySelect}
          multipliers={settings.colorMultipliers}
          fakeMultiplier={getFakeOkeyLoserMultiplier(false, false)}
        />
      </EntrySection>

      {winner && (
        <EntrySection title="Nasıl bitti?">
          <div className="flex gap-2">
            {!fakeOkey && (
              <ToggleChip
                label="Okey attı"
                active={okeyThrown}
                onClick={() => setOkeyThrown(!okeyThrown)}
              />
            )}
            <ToggleChip
              label="Çiftten bitti"
              active={doubleFinish}
              onClick={() => setDoubleFinish(!doubleFinish)}
            />
          </div>
        </EntrySection>
      )}

      {(winner || noWinner) && (
        <EntrySection title={teamMode ? 'Takım cezaları' : 'Elindeki puanlar'}>
          <div className="flex flex-col gap-1.5">
            {entities.filter((name) => name !== winner).map((name) => {
              const isBurned = !teamMode && playerStatuses[name] === 'okey_burned'
              const points = teamMode ? teamRawPoints : rawPoints
              const setPoints = teamMode ? setTeamRawPoints : setRawPoints

              return (
                <EntryRow key={name} name={name} score={getPreviewScore(buildInput(name))}>
                  {!teamMode && !noWinner && (
                    <ToggleChip
                      size="sm"
                      tone="orange"
                      label="🔥 Yaktı"
                      active={isBurned}
                      onClick={() => toggleBurned(name)}
                    />
                  )}
                  {!isBurned && (
                    <PointsInput
                      label={`${name} puanı`}
                      value={points[name] ?? ''}
                      onChange={(value) => setPoints((p) => ({ ...p, [name]: value }))}
                    />
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
