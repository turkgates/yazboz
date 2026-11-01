import type { Game, Round } from '@/types'
import {
  getGameBadgeLabel,
  getGameRanking,
  getWinnersCount,
  isBankoluGame,
  isCezaliGame,
  isEsliGame,
} from '@/lib/gameTypes'
import { computeEsliTeamStats } from '@/lib/teamStatsUtils'
import {
  computeComparisonStats,
  filterGamesWithPlayer,
  getPlayerGameResult,
  getPlayerRoundScore,
  isOkeyBurn,
  type ComparisonStats,
} from '@/lib/statsUtils'
import { formatDistanceToNow } from '@/lib/dateUtils'

// Az oyunla %100 çıkan oran yanıltıcı olmasın
const MIN_GAMES_FOR_RATE = 3

export interface GroupMemberInput {
  userId: string
  name: string
  avatarUrl: string | null
}

interface ScoreMark {
  score: number
  game: Game
}

export interface GroupMemberStats extends ComparisonStats, GroupMemberInput {
  lastPlaces: number
  longestStreak: number
  bestRound: ScoreMark | null
  worstRound: ScoreMark | null
  bestGame: ScoreMark | null
}

export interface GroupRecord {
  key: string
  emoji: string
  title: string
  holders: GroupMemberInput[]
  value: string
  detail?: string
  gameId?: string
}

export interface GroupStats {
  games: number
  rounds: number
  okeyThrows: number
  okeyBurns: number
  lastPlayedAt: string | null
  members: GroupMemberStats[]
  bestRecords: GroupRecord[]
  worstRecords: GroupRecord[]
  gameRecords: GroupRecord[]
}

const gameDate = (game: Game) => game.finished_at ?? game.created_at
const formatScore = (score: number) => (score > 0 ? `+${score}` : String(score))
const gameDetail = (game: Game) => `${getGameBadgeLabel(game)} · ${formatDistanceToNow(gameDate(game))}`

function computeMemberStats(
  member: GroupMemberInput,
  chronologicalGames: Game[],
  roundsByGame: Record<string, Round[]>
): GroupMemberStats {
  const games = filterGamesWithPlayer(chronologicalGames, member.name)
  let streak = 0
  let longestStreak = 0
  let lastPlaces = 0
  let bestRound: ScoreMark | null = null
  let worstRound: ScoreMark | null = null
  let bestGame: ScoreMark | null = null

  for (const game of games) {
    const rounds = roundsByGame[game.id] ?? []
    const result = getPlayerGameResult(game, rounds, member.name)
    if (!result) continue

    streak = result.won ? streak + 1 : 0
    longestStreak = Math.max(longestStreak, streak)
    if (result.last) lastPlaces++

    let total = 0
    for (const round of rounds) {
      const score = getPlayerRoundScore(game, round, member.name)
      total += score
      if (round.is_indicator_only) continue
      if (score < 0 && (!bestRound || score < bestRound.score)) bestRound = { score, game }
      if (score > 0 && (!worstRound || score > worstRound.score)) worstRound = { score, game }
    }
    if (!bestGame || total < bestGame.score) bestGame = { score: total, game }
  }

  return {
    ...member,
    ...computeComparisonStats(member.name, games, roundsByGame),
    lastPlaces,
    longestStreak,
    bestRound,
    worstRound,
    bestGame,
  }
}

function countRecord(
  members: GroupMemberStats[],
  base: Pick<GroupRecord, 'key' | 'emoji' | 'title'>,
  getValue: (member: GroupMemberStats) => number,
  format: (value: number) => string,
  minValue = 1
): GroupRecord | null {
  const best = Math.max(0, ...members.map(getValue))
  if (best < minValue) return null
  return {
    ...base,
    holders: members.filter((m) => getValue(m) === best),
    value: format(best),
  }
}

function scoreRecord(
  members: GroupMemberStats[],
  base: Pick<GroupRecord, 'key' | 'emoji' | 'title'>,
  getMark: (member: GroupMemberStats) => ScoreMark | null,
  isBetter: (a: number, b: number) => boolean
): GroupRecord | null {
  let best: ScoreMark | null = null
  for (const member of members) {
    const mark = getMark(member)
    if (mark && (!best || isBetter(mark.score, best.score))) best = mark
  }
  if (!best) return null

  const score = best.score
  return {
    ...base,
    holders: members.filter((m) => getMark(m)?.score === score),
    value: formatScore(score),
    detail: gameDetail(best.game),
    gameId: best.game.id,
  }
}

function withoutEmpty(records: (GroupRecord | null)[]): GroupRecord[] {
  return records.filter((record): record is GroupRecord => record !== null)
}

function compareMembers(a: GroupMemberStats, b: GroupMemberStats) {
  return (
    b.wins - a.wins ||
    b.winRate - a.winRate ||
    (a.avgRank ?? Infinity) - (b.avgRank ?? Infinity) ||
    b.games - a.games ||
    a.name.localeCompare(b.name, 'tr')
  )
}

export function computeGroupStats(
  members: GroupMemberInput[],
  games: Game[],
  roundsByGame: Record<string, Round[]>
): GroupStats {
  const chronological = [...games].sort(
    (a, b) => new Date(gameDate(a)).getTime() - new Date(gameDate(b)).getTime()
  )
  const memberStats = members
    .map((member) => computeMemberStats(member, chronological, roundsByGame))
    .sort(compareMembers)

  let playedGames = 0
  let rounds = 0
  let okeyThrows = 0
  let okeyBurns = 0
  let longestGame: { rounds: number; game: Game } | null = null

  for (const game of games) {
    const playedRounds = (roundsByGame[game.id] ?? []).filter((r) => !r.is_indicator_only)
    rounds += playedRounds.length
    if (playedRounds.length > 0) {
      playedGames++
      if (!longestGame || playedRounds.length > longestGame.rounds) {
        longestGame = { rounds: playedRounds.length, game }
      }
    }

    const hasOkey = isCezaliGame(game) || isBankoluGame(game)
    for (const round of playedRounds) {
      if (hasOkey && round.okey_thrown) okeyThrows++
      if (isCezaliGame(game)) {
        okeyBurns += game.players.filter((p) => isOkeyBurn(game, round, p)).length
      }
    }
  }

  const rateCandidates = memberStats.filter((m) => m.games >= MIN_GAMES_FOR_RATE)
  const bestRate = Math.max(0, ...rateCandidates.map((m) => m.winRate))

  const memberNames = new Set(members.map((m) => m.name.toLowerCase()))
  const bestPair = computeEsliTeamStats(games, roundsByGame).topTeams.find(
    (team) => team.wins > 0 && team.players.every((p) => memberNames.has(p.toLowerCase()))
  )
  const pairMembers = bestPair
    ? members.filter((m) => bestPair.players.some((p) => p.toLowerCase() === m.name.toLowerCase()))
    : []

  return {
    games: playedGames,
    rounds,
    okeyThrows,
    okeyBurns,
    lastPlayedAt: games.length
      ? gameDate(chronological[chronological.length - 1])
      : null,
    members: memberStats,
    bestRecords: withoutEmpty([
      countRecord(memberStats, { key: 'wins', emoji: '🏆', title: 'En çok kazanan' }, (m) => m.wins, (v) => `${v} oyun`),
      bestRate > 0
        ? {
            key: 'rate',
            emoji: '📈',
            title: 'En yüksek oran',
            holders: rateCandidates.filter((m) => m.winRate === bestRate),
            value: `%${bestRate}`,
            detail: `En az ${MIN_GAMES_FOR_RATE} oyun`,
          }
        : null,
      countRecord(memberStats, { key: 'streak', emoji: '🔥', title: 'En uzun seri' }, (m) => m.longestStreak, (v) => `${v} oyun üst üste`, 2),
      countRecord(memberStats, { key: 'okey', emoji: '🃏', title: 'Okey kralı' }, (m) => m.okeyThrows, (v) => `${v} okey`),
      countRecord(memberStats, { key: 'hands', emoji: '🎯', title: 'En çok el alan' }, (m) => m.roundWins, (v) => `${v} el`),
      scoreRecord(memberStats, { key: 'best-round', emoji: '💎', title: 'En iyi el' }, (m) => m.bestRound, (a, b) => a < b),
      scoreRecord(memberStats, { key: 'best-game', emoji: '🌟', title: 'En iyi oyun' }, (m) => m.bestGame, (a, b) => a < b),
      countRecord(memberStats, { key: 'played', emoji: '🎮', title: 'Müdavim' }, (m) => m.games, (v) => `${v} oyun`),
    ]),
    worstRecords: withoutEmpty([
      countRecord(memberStats, { key: 'burns', emoji: '🧯', title: 'En çok yakan' }, (m) => m.okeyBurns, (v) => `${v} kez`),
      scoreRecord(memberStats, { key: 'worst-round', emoji: '💀', title: 'En ağır ceza' }, (m) => m.worstRound, (a, b) => a > b),
      countRecord(memberStats, { key: 'last', emoji: '🐢', title: 'En çok sonuncu olan' }, (m) => m.lastPlaces, (v) => `${v} kez`),
    ]),
    gameRecords: withoutEmpty([
      bestPair
        ? {
            key: 'pair',
            emoji: '🤝',
            title: 'En iyi ikili',
            holders: pairMembers,
            value: `${bestPair.wins} galibiyet`,
            detail: `${bestPair.gamesPlayed} oyunda`,
          }
        : null,
      longestGame
        ? {
            key: 'longest',
            emoji: '⏳',
            title: 'En uzun oyun',
            holders: [],
            value: `${longestGame.rounds} el`,
            detail: gameDetail(longestGame.game),
            gameId: longestGame.game.id,
          }
        : null,
    ]),
  }
}

export function getGroupGameWinners(game: Game, rounds: Round[]): string[] {
  if (rounds.length === 0) return []
  const ranking = getGameRanking(game, rounds)
  const winnersCount = isEsliGame(game) ? 1 : getWinnersCount(game.settings)
  return ranking
    .filter((row) => 1 + ranking.filter((r) => r.total < row.total).length <= winnersCount)
    .map((row) => row.name)
}
