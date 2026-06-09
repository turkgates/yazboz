export interface ShareRankingItem {
  name: string
  total: number
}

interface ShareCardProps {
  id: string
  gameTypeLabel: string
  gameDate: string
  rankings: ShareRankingItem[]
  winnersCount: number
}

function rankEmoji(index: number): string {
  if (index === 0) return '🏆'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return `${index + 1}.`
}

export function ShareCard({
  id,
  gameTypeLabel,
  gameDate,
  rankings,
  winnersCount,
}: ShareCardProps) {
  return (
    <div
      id={id}
      style={{
        position: 'fixed',
        left: '-9999px',
        width: '400px',
        background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
        borderRadius: '16px',
        padding: '24px',
        color: 'white',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '28px' }}>🎮</div>
        <h2
          style={{
            fontSize: '18px',
            color: '#FFD700',
            margin: '4px 0',
            fontWeight: 'bold',
          }}
        >
          Okey Yazboz
        </h2>
        <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
          {gameTypeLabel} • {gameDate}
        </p>
      </div>

      {rankings.map((player, index) => {
        const isWinner = index < winnersCount
        return (
          <div
            key={player.name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              marginBottom: '6px',
              background: isWinner
                ? 'rgba(255,215,0,0.15)'
                : 'rgba(255,255,255,0.05)',
              borderRadius: '8px',
              border: isWinner
                ? '1px solid rgba(255,215,0,0.4)'
                : '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <span style={{ fontSize: '14px' }}>
              {rankEmoji(index)} {player.name}
            </span>
            <span
              style={{
                color: player.total <= 0 ? '#4ade80' : '#f87171',
                fontWeight: 'bold',
                fontSize: '14px',
              }}
            >
              {player.total > 0 ? '+' : ''}
              {player.total}
            </span>
          </div>
        )
      })}

      <div
        style={{
          textAlign: 'center',
          marginTop: '16px',
          paddingTop: '12px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          fontSize: '11px',
          color: '#555',
        }}
      >
        okeyyazboz.app
      </div>
    </div>
  )
}
