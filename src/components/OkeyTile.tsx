import { useState } from 'react'

export type OkeyTileColor = 'black' | 'red' | 'yellow' | 'blue'
export type OkeyTileStatus = 0 | 1 | 2

export interface OkeyTileProps {
  number: number
  color: OkeyTileColor
  status: OkeyTileStatus
  onClick: () => void
  isFakeOkey?: boolean
  size?: 'normal' | 'small'
}

export function OkeyTile({
  number,
  color,
  status,
  onClick,
  isFakeOkey = false,
  size = 'normal',
}: OkeyTileProps) {
  const [pressing, setPressing] = useState(false)

  if (isFakeOkey) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseDown={() => setPressing(true)}
        onMouseUp={() => setPressing(false)}
        onMouseLeave={() => setPressing(false)}
        onTouchStart={() => setPressing(true)}
        onTouchEnd={() => setPressing(false)}
        className={[
          'okey-tile',
          'okey-tile--fake',
          `okey-tile--status-${status}`,
          `okey-tile--${size}`,
          pressing ? 'okey-tile--pressing' : '',
          status === 0 ? 'okey-tile--hoverable' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Sahte okey"
      >
        <span className="okey-tile-frame" aria-hidden />
        <span className="okey-tile-fake-star">★</span>
        <span className="okey-tile-fake-label">SAHTE</span>
        {status === 1 && <span className="okey-tile-overlay okey-tile-overlay--diagonal" aria-hidden />}
        {status === 2 && <span className="okey-tile-overlay okey-tile-overlay--cross" aria-hidden />}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={() => setPressing(true)}
      onMouseUp={() => setPressing(false)}
      onMouseLeave={() => setPressing(false)}
      onTouchStart={() => setPressing(true)}
      onTouchEnd={() => setPressing(false)}
      className={[
        'okey-tile',
        `okey-tile--${color}`,
        `okey-tile--status-${status}`,
        `okey-tile--${size}`,
        pressing ? 'okey-tile--pressing' : '',
        status === 0 ? 'okey-tile--hoverable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${number} numaralı taş`}
    >
      <span className="okey-tile-frame" aria-hidden />
      <span className="okey-tile-number">{number}</span>
      <span className="okey-tile-dot" aria-hidden />
      {status === 1 && <span className="okey-tile-overlay okey-tile-overlay--diagonal" aria-hidden />}
      {status === 2 && <span className="okey-tile-overlay okey-tile-overlay--cross" aria-hidden />}
    </button>
  )
}
