import { motion } from 'framer-motion'

const DOT_POSITIONS: Record<1 | 2 | 3 | 4 | 5 | 6, [number, number][]> = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
}

export interface DiceFaceProps {
  value: 1 | 2 | 3 | 4 | 5 | 6
  size?: number
  isRolling?: boolean
}

export function DiceFace({ value, size = 100, isRolling = false }: DiceFaceProps) {
  const positions = DOT_POSITIONS[value]

  return (
    <motion.div
      animate={
        isRolling
          ? { rotateX: [0, 360, 720], rotateY: [0, 180, 360] }
          : { rotateX: 0, rotateY: 0, scale: [1, 1.08, 1] }
      }
      transition={
        isRolling
          ? { duration: 0.6, ease: 'easeOut' }
          : { duration: 0.3, ease: 'easeOut' }
      }
      style={{ width: size, height: size }}
      className="relative shrink-0"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)]"
      >
        <rect
          x="4"
          y="4"
          width="92"
          height="92"
          rx="14"
          fill="#f5f0e6"
          stroke="#d4cfc4"
          strokeWidth="2"
        />
        {positions.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={8} fill="#1a1a2e" />
        ))}
      </svg>
    </motion.div>
  )
}

export function MiniDiceFace({ value, size = 20 }: { value: number; size?: number }) {
  const v = Math.max(1, Math.min(6, value)) as 1 | 2 | 3 | 4 | 5 | 6
  return <DiceFace value={v} size={size} />
}
