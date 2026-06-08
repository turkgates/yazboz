import { PlayerAvatar } from '@/components/PlayerAvatar'

interface TeamAvatarsProps {
  players: string[]
  avatarUrls: (string | null)[]
  size?: number
  ringColor?: 'yellow' | 'white'
  className?: string
}

const RING_CLASSES = {
  yellow: 'ring-[#f5a623] shadow-[#f5a623]/30',
  white: 'ring-white/30 shadow-black/20',
}

export function TeamAvatars({
  players,
  avatarUrls,
  size = 64,
  ringColor = 'yellow',
  className = '',
}: TeamAvatarsProps) {
  const ring = RING_CLASSES[ringColor]
  const overlap = Math.round(size * 0.3)

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {players.map((player, index) => (
        <div
          key={player}
          style={{
            marginLeft: index > 0 ? -overlap : 0,
            zIndex: players.length - index,
          }}
          className="relative"
        >
          <PlayerAvatar
            name={player}
            avatarUrl={avatarUrls[index] ?? null}
            size={size}
            className={`ring-4 ${ring} shadow-lg`}
          />
        </div>
      ))}
    </div>
  )
}
