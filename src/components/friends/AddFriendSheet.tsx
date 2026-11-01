import { useEffect, useState } from 'react'
import { Check, Copy, UserPlus } from 'lucide-react'
import {
  fetchMyGroupSummaries,
  getSupabaseErrorMessage,
  searchProfileByUsername,
} from '@/lib/socialSupabase'
import { sendFriendRequest } from '@/lib/friendUtils'
import { EntrySheet } from '@/components/game/RoundEntryParts'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import type { Profile } from '@/types'

type SearchResult = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>

interface GroupSuggestion {
  id: string
  name: string
  avatarUrl: string | null
  groupName: string
}

export function AddFriendSheet({
  userId,
  username,
  friendIds,
  sentIds,
  incomingIds,
  onClose,
  onChanged,
}: {
  userId: string
  username: string | null
  friendIds: Set<string>
  sentIds: Set<string>
  incomingIds: Set<string>
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult | 'not_found' | null>(null)
  const [searching, setSearching] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [suggestions, setSuggestions] = useState<GroupSuggestion[]>([])

  useEffect(() => {
    fetchMyGroupSummaries(userId).then((groups) => {
      const seen = new Set<string>()
      const list: GroupSuggestion[] = []
      for (const group of groups) {
        for (const member of group.members) {
          if (member.user_id === userId || seen.has(member.user_id)) continue
          seen.add(member.user_id)
          list.push({
            id: member.user_id,
            name: member.name,
            avatarUrl: member.avatar_url,
            groupName: group.name,
          })
        }
      }
      setSuggestions(list)
    })
  }, [userId])

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setError('')
    const { data, error: searchError } = await searchProfileByUsername(query)
    if (searchError) {
      console.error('Arkadaş arama hatası:', searchError)
      setError('Arama başarısız')
    }
    setResult(data ?? 'not_found')
    setSearching(false)
  }

  const handleSend = async (receiverId: string, receiverName: string) => {
    setSendingId(receiverId)
    setError('')
    try {
      await sendFriendRequest(receiverId, receiverName)
      await onChanged()
    } catch (err: unknown) {
      console.error('İstek gönderme hatası:', err)
      setError(getSupabaseErrorMessage(err, 'İstek gönderilemedi'))
    } finally {
      setSendingId(null)
    }
  }

  const handleCopy = async () => {
    if (!username) return
    await navigator.clipboard.writeText(username)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const renderAction = (id: string, name: string) => {
    if (id === userId) return <span className="text-[#718096] text-xs font-medium px-1 shrink-0">Bu sensin</span>
    if (friendIds.has(id)) return <span className="text-green-400 text-xs font-semibold px-1 shrink-0">✓ Arkadaşsın</span>
    if (sentIds.has(id)) return <span className="text-[#718096] text-xs font-medium px-1 shrink-0">İstek gönderildi</span>

    return (
      <button
        type="button"
        onClick={() => handleSend(id, name)}
        disabled={!!sendingId}
        className="flex items-center gap-1 shrink-0 bg-[#e94560] disabled:opacity-50 text-white text-xs font-bold px-3 h-9 rounded-lg"
      >
        <UserPlus size={13} />
        {sendingId === id ? '...' : incomingIds.has(id) ? 'Kabul Et' : 'Ekle'}
      </button>
    )
  }

  const visibleSuggestions = suggestions.filter((s) => !friendIds.has(s.id))

  return (
    <EntrySheet title="Arkadaş Ekle" onClose={onClose}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096] text-sm">@</span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setResult(null)
              setError('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="kullaniciadi"
            aria-label="Kullanıcı adı"
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full h-11 bg-[#0f3460]/50 border border-[#2d3748] rounded-xl pl-7 pr-3 text-white placeholder-[#718096] text-base focus:outline-none focus:border-[#e94560]"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="bg-[#e94560] disabled:opacity-50 text-white px-4 rounded-xl text-sm font-bold"
        >
          {searching ? '...' : 'Ara'}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {result === 'not_found' && (
        <p className="text-[#718096] text-sm text-center py-2">Bu kullanıcı adıyla kimse bulunamadı</p>
      )}

      {result && result !== 'not_found' && (
        <div className="bg-[#0f3460]/40 border border-[#2d3748] rounded-xl p-3 flex items-center gap-3">
          <PlayerAvatar name={result.display_name ?? '?'} avatarUrl={result.avatar_url} size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">{result.display_name}</p>
            <p className="text-[#718096] text-xs truncate">@{result.username}</p>
          </div>
          {renderAction(result.id, result.display_name ?? 'Kullanıcı')}
        </div>
      )}

      {visibleSuggestions.length > 0 && (
        <section>
          <p className="text-[#a0aec0] text-sm font-medium mb-1.5">Grubundaki kişiler</p>
          <div className="flex flex-col gap-1.5">
            {visibleSuggestions.map((s) => (
              <div
                key={s.id}
                className="bg-[#0f3460]/40 border border-[#2d3748] rounded-xl px-3 py-2 flex items-center gap-3"
              >
                <PlayerAvatar name={s.name} avatarUrl={s.avatarUrl} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{s.name}</p>
                  <p className="text-[#718096] text-xs truncate">{s.groupName}</p>
                </div>
                {renderAction(s.id, s.name)}
              </div>
            ))}
          </div>
        </section>
      )}

      {username && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[#718096] text-sm min-w-0 truncate">
            Senin kullanıcı adın: <span className="text-white font-medium">@{username}</span>
          </p>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 shrink-0 bg-[#0f3460] text-[#a0aec0] text-xs font-semibold px-3 h-9 rounded-lg"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
        </div>
      )}
    </EntrySheet>
  )
}
