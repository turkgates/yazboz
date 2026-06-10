import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase, uploadAvatar } from '@/lib/supabase'
import { checkUsernameAvailable, upsertProfile } from '@/lib/socialSupabase'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { ArrowRight, Check, X, Camera } from 'lucide-react'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: OnboardingPage,
})

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

function OnboardingPage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [userId, setUserId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id)
    })
  }, [])

  const onUsernameChange = (val: string) => {
    const lower = val.toLowerCase().replace(/[^a-z0-9_]/g, '')
    setUsername(lower)
    if (!lower) { setUsernameStatus('idle'); return }
    if (!USERNAME_RE.test(lower)) { setUsernameStatus('invalid'); return }
    setUsernameStatus('checking')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const available = await checkUsernameAvailable(lower)
      setUsernameStatus(available ? 'ok' : 'taken')
    }, 500)
  }

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setAvatarPreview(URL.createObjectURL(file))
    try {
      const url = await uploadAvatar(file, userId)
      setAvatarUrl(url)
    } catch {
      setAvatarPreview(null)
    }
  }

  const handleSubmit = async () => {
    if (!displayName.trim()) { setError('Adın zorunlu'); return }
    if (!USERNAME_RE.test(username)) { setError('Geçerli bir kullanıcı adı gir'); return }
    if (usernameStatus !== 'ok') { setError('Kullanıcı adı kullanılabilir değil'); return }
    setSaving(true)
    setError('')
    try {
      await upsertProfile(userId, {
        username,
        display_name: displayName.trim(),
        avatar_url: avatarUrl ?? undefined,
      })
      navigate({ to: '/home' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  const UsernameIcon = () => {
    if (usernameStatus === 'checking') return <div className="w-4 h-4 border-2 border-[#a0aec0] border-t-transparent rounded-full animate-spin" />
    if (usernameStatus === 'ok') return <Check size={16} className="text-green-400" />
    if (usernameStatus === 'taken') return <X size={16} className="text-red-400" />
    if (usernameStatus === 'invalid') return <X size={16} className="text-orange-400" />
    return null
  }

  const statusText = {
    ok: 'Kullanılabilir ✓',
    taken: 'Bu kullanıcı adı alınmış',
    invalid: '3-20 karakter, sadece harf/rakam/_',
  } as const

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎉</div>
          <h1 className="text-2xl font-bold text-white">Hoş Geldin!</h1>
          <p className="text-[#a0aec0] text-sm mt-1">Profilini tamamla</p>
        </div>

        <div className="bg-[#16213e] rounded-2xl p-6 border border-[#2d3748] flex flex-col gap-5">
          {/* Avatar */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative"
            >
              <PlayerAvatar
                name={displayName || 'U'}
                avatarUrl={avatarPreview}
                size={80}
              />
              <div className="absolute bottom-0 right-0 bg-[#e94560] rounded-full p-1.5 border-2 border-[#16213e]">
                <Camera size={12} className="text-white" />
              </div>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarSelect}
            />
          </div>

          {/* Display name */}
          <div>
            <label className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2 block">
              Adın
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ali Yılmaz"
              maxLength={40}
              className="w-full bg-[#0f3460]/50 border border-[#2d3748] rounded-xl py-3 px-4 text-white placeholder-[#718096] focus:outline-none focus:border-[#e94560] text-sm"
            />
          </div>

          {/* Username */}
          <div>
            <label className="text-[#a0aec0] text-xs font-semibold uppercase tracking-wider mb-2 block">
              Kullanıcı Adı{' '}
              <span className="text-[#718096] font-normal normal-case">(değiştirilemez)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096] text-sm">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => onUsernameChange(e.target.value)}
                placeholder="aliyilmaz"
                maxLength={20}
                className="w-full bg-[#0f3460]/50 border border-[#2d3748] rounded-xl py-3 pl-8 pr-10 text-white placeholder-[#718096] focus:outline-none focus:border-[#e94560] text-sm"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <UsernameIcon />
              </div>
            </div>
            {usernameStatus !== 'idle' && usernameStatus !== 'checking' && (
              <p className={`text-xs mt-1 ${usernameStatus === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                {statusText[usernameStatus as keyof typeof statusText]}
              </p>
            )}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || usernameStatus !== 'ok' || !displayName.trim()}
            className="w-full bg-[#e94560] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>Devam Et <ArrowRight size={16} /></>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
