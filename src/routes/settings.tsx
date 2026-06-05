import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase, signOut } from '@/lib/supabase'
import { useSettingsStore } from '@/stores/gameStore'
import type { Color } from '@/types'
import { COLOR_LABELS, COLOR_HEX, DEFAULT_SETTINGS } from '@/types'
import { ArrowLeft, LogOut, RotateCcw } from 'lucide-react'

export const Route = createFileRoute('/settings')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: SettingsPage,
})

const COLORS: Color[] = ['black', 'red', 'yellow', 'green']

function SettingsPage() {
  const navigate = useNavigate()
  const { settings, updateSettings, resetSettings } = useSettingsStore()
  const [email, setEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
  }, [])

  const handleSignOut = async () => {
    await signOut()
    navigate({ to: '/auth' })
  }

  const updateMultiplier = (color: Color, value: number) => {
    updateSettings({
      colorMultipliers: { ...settings.colorMultipliers, [color]: Math.max(1, Math.min(20, value)) },
    })
  }

  const updateBonus = (color: Color, value: number) => {
    updateSettings({
      winnerBonus: { ...settings.winnerBonus, [color]: Math.max(1, Math.min(999, value)) },
    })
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col">
      <div className="bg-[#16213e] border-b border-[#2d3748] px-4 pt-safe-top">
        <div className="flex items-center justify-between py-4 max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate({ to: '/home' })}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0f3460] text-[#a0aec0]"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-lg font-bold text-white">Ayarlar</h1>
          </div>
          <button
            onClick={resetSettings}
            className="flex items-center gap-1.5 text-[#718096] text-xs hover:text-white transition-colors"
          >
            <RotateCcw size={13} />
            Sıfırla
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full overflow-y-auto">
        {/* Color Multipliers */}
        <section className="mb-6">
          <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
            Renk Çarpanları
          </h2>
          <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl overflow-hidden divide-y divide-[#2d3748]">
            {COLORS.map((color) => (
              <div key={color} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full border border-white/20" style={{ backgroundColor: COLOR_HEX[color] }} />
                  <div>
                    <p className="text-white text-sm font-medium">{COLOR_LABELS[color]}</p>
                    <p className="text-[#718096] text-xs">Varsayılan: ×{DEFAULT_SETTINGS.colorMultipliers[color]}</p>
                  </div>
                </div>
                <NumberStepper
                  value={settings.colorMultipliers[color]}
                  onChange={(v) => updateMultiplier(color, v)}
                  min={1}
                  max={20}
                  prefix="×"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Winner Bonus */}
        <section className="mb-6">
          <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
            Biten Oyuncu Düşüşü
          </h2>
          <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl overflow-hidden divide-y divide-[#2d3748]">
            {COLORS.map((color) => (
              <div key={color} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full border border-white/20" style={{ backgroundColor: COLOR_HEX[color] }} />
                  <div>
                    <p className="text-white text-sm font-medium">{COLOR_LABELS[color]}</p>
                    <p className="text-[#718096] text-xs">Varsayılan: -{DEFAULT_SETTINGS.winnerBonus[color]}</p>
                  </div>
                </div>
                <NumberStepper
                  value={settings.winnerBonus[color]}
                  onChange={(v) => updateBonus(color, v)}
                  min={1}
                  max={999}
                  prefix="-"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Default Rounds */}
        <section className="mb-6">
          <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
            Varsayılan El Sayısı
          </h2>
          <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">El Sayısı</p>
              <p className="text-[#718096] text-xs">Yeni oyun oluştururken varsayılan</p>
            </div>
            <NumberStepper
              value={settings.defaultRounds}
              onChange={(v) =>
                updateSettings({ defaultRounds: Math.max(5, Math.min(21, v)) })
              }
              min={5}
              max={21}
            />
          </div>
        </section>

        {/* Account */}
        <section>
          <h2 className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-3">
            Hesap
          </h2>
          <div className="bg-[#16213e] border border-[#2d3748] rounded-2xl overflow-hidden divide-y divide-[#2d3748]">
            <div className="p-4">
              <p className="text-[#718096] text-xs mb-1">Email</p>
              <p className="text-white text-sm">{email || '...'}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 p-4 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut size={18} />
              <span className="text-sm font-medium">Çıkış Yap</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function NumberStepper({
  value,
  onChange,
  min,
  max,
  prefix = '',
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  prefix?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-lg bg-[#0f3460] text-white text-lg flex items-center justify-center active:scale-90 transition-transform"
      >
        −
      </button>
      <span className="text-white font-bold text-sm w-10 text-center">{prefix}{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-lg bg-[#0f3460] text-white text-lg flex items-center justify-center active:scale-90 transition-transform"
      >
        +
      </button>
    </div>
  )
}
