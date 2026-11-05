interface LogoMarkProps {
  size?: number
  className?: string
}

export function LogoMark({ size = 40, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Okeyif"
      className={className}
    >
      <rect width="100" height="100" rx="22" fill="#e94560" />
      <rect x="24" y="16" width="52" height="74" rx="9" fill="#b92f47" />
      <rect x="24" y="11" width="52" height="74" rx="9" fill="#f6eedd" />
      <circle cx="39" cy="36" r="4.6" fill="#1a1a2e" />
      <path
        d="M56 37 Q61.5 31 67 37"
        fill="none"
        stroke="#1a1a2e"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <path
        d="M35 50 Q50 72 65 50"
        fill="none"
        stroke="#e94560"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface WordmarkProps {
  className?: string
}

// "i"nin noktası okey taşındaki sayının altında duran daireden gelir, bu yüzden noktasız ı üstüne çizilir
export function Wordmark({ className = '' }: WordmarkProps) {
  return (
    <span role="img" aria-label="Okeyif" className={`font-bold tracking-tight leading-none ${className}`}>
      okey
      <span className="relative inline-block">
        ı
        <span
          className="absolute rounded-full bg-[#e94560]"
          style={{ top: '0.07em', left: '50%', width: '0.17em', height: '0.17em', transform: 'translateX(-50%)' }}
        />
      </span>
      f
    </span>
  )
}
