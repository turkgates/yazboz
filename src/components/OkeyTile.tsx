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

  const baseClass = [
    'okey-tile',
    isFakeOkey ? 'okey-tile--fake' : `okey-tile--${color}`,
    `okey-tile--status-${status}`,
    `okey-tile--${size}`,
    pressing ? 'okey-tile--pressing' : '',
    status === 0 ? 'okey-tile--hoverable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const pressHandlers = {
    onMouseDown: () => setPressing(true),
    onMouseUp: () => setPressing(false),
    onMouseLeave: () => setPressing(false),
    onTouchStart: () => setPressing(true),
    onTouchEnd: () => setPressing(false),
  }

  if (isFakeOkey) {
    return (
      <button
        type="button"
        onClick={onClick}
        {...pressHandlers}
        className={baseClass}
        aria-label="Sahte okey"
      >
        <div className="tile-inner">
          <span className="okey-tile-frame" aria-hidden />
          <span className="okey-tile-fake-star tile-number">★</span>
          <span className="okey-tile-fake-label">SAHTE</span>
        </div>
        {status === 1 && <span className="okey-tile-overlay okey-tile-overlay--diagonal" aria-hidden />}
        {status === 2 && <span className="okey-tile-overlay okey-tile-overlay--cross" aria-hidden />}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      {...pressHandlers}
      className={baseClass}
      aria-label={`${number} numaralı taş`}
    >
      <div className="tile-inner">
        <span className="okey-tile-frame" aria-hidden />
        <span className="tile-number okey-tile-number">{number}</span>
        <span className="tile-dot okey-tile-dot" aria-hidden />
      </div>
      {status === 1 && <span className="okey-tile-overlay okey-tile-overlay--diagonal" aria-hidden />}
      {status === 2 && <span className="okey-tile-overlay okey-tile-overlay--cross" aria-hidden />}
    </button>
  )
}
