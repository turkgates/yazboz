import type { Round } from '@/types'
import { teamLabel } from '@/lib/gameTypes'

interface TeamScoreTableProps {
  teams: string[][]
  rounds: Round[]
  teamTotals: Record<string, number>
}

export function TeamScoreTable({ teams, rounds, teamTotals }: TeamScoreTableProps) {
  const labels = teams.map(teamLabel)

  const teamRoundTotal = (round: Round, team: string[]) =>
    team.reduce((sum, p) => sum + (round.scores[p] ?? 0), 0)

  return (
    <div className="bg-[#16213e] rounded-2xl border border-[#2d3748] overflow-hidden">
      <div className="flex border-b border-[#2d3748] bg-[#0f3460]">
        <div className="w-10 shrink-0" />
        {labels.map((label) => (
          <div key={label} className="flex-1 py-3 px-2 text-center">
            <p className="text-white text-xs font-semibold">{label}</p>
          </div>
        ))}
      </div>

      {rounds.map((round, idx) => (
        <div
          key={round.id}
          className={`flex border-b border-[#2d3748]/50 ${idx % 2 !== 0 ? 'bg-[#0f3460]/20' : ''}`}
        >
          <div className="w-10 shrink-0 flex items-center justify-center">
            <span className="text-[#718096] text-xs">{round.round_number}</span>
          </div>
          {teams.map((team, i) => {
            const total = teamRoundTotal(round, team)
            return (
              <div key={labels[i]} className="flex-1 py-2.5 px-1 text-center">
                <span
                  className={`text-xs font-medium ${
                    total < 0 ? 'text-green-400' : total > 0 ? 'text-red-400' : 'text-[#718096]'
                  }`}
                >
                  {total === 0 ? '-' : total > 0 ? `+${total}` : total}
                </span>
              </div>
            )
          })}
        </div>
      ))}

      <div className="flex bg-[#0f3460] border-t-2 border-[#2d3748]">
        <div className="w-10 shrink-0" />
        {labels.map((label) => {
          const total = teamTotals[label] ?? 0
          return (
            <div key={label} className="flex-1 py-3 px-1 text-center">
              <p
                className={`text-sm font-bold ${
                  total < 0 ? 'text-green-400' : total > 0 ? 'text-red-400' : 'text-white'
                }`}
              >
                {total}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
