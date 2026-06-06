interface PlayerAvatarProps {
  name: string
  avatarUrl?: string | null
  size?: number
  onClick?: () => void
  className?: string
}

const INITIAL_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
]

export function PlayerAvatar({
  name,
  avatarUrl,
  size = 40,
  onClick,
  className = '',
}: PlayerAvatarProps) {
  const clickable = onClick ? 'cursor-pointer' : ''
  const fontSize = Math.max(10, Math.round(size * 0.38))

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover border-2 border-white/10 shrink-0 ${clickable} ${className}`}
        onClick={onClick}
      />
    )
  }

  const colorIndex = name.charCodeAt(0) % INITIAL_COLORS.length

  return (
    <div
      style={{ width: size, height: size, fontSize }}
      className={`rounded-full ${INITIAL_COLORS[colorIndex]} flex items-center justify-center text-white font-bold border-2 border-white/10 shrink-0 ${clickable} ${className}`}
      onClick={onClick}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
