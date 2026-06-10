import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, signIn, resetPassword, fetchProfile } from '@/lib/supabase'
import { Eye, EyeOff, Mail, Lock, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react'

export const Route = createFileRoute('/auth')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      throw redirect({ to: '/home' })
    }
  },
  component: AuthPage,
})

type AuthMode = 'login' | 'register' | 'forgot'

function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (mode === 'forgot') {
        const { error } = await resetPassword(email)
        if (error) {
          console.error('Reset password error:', error)
          throw error
        }
        setSuccess('Şifre sıfırlama bağlantısı email adresinize gönderildi.')
      } else if (mode === 'register') {
        if (password !== confirmPassword) {
          setError('Şifreler eşleşmiyor.')
          return
        }
        if (password.length < 6) {
          setError('Şifre en az 6 karakter olmalıdır.')
          return
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: undefined,
            data: {},
          },
        })

        if (error) {
          console.error('Signup error:', error)
          throw error
        }

        if (data.user) {
          const { data: profile } = await fetchProfile(data.user.id)
          if (!profile?.username) {
            navigate({ to: '/onboarding' })
          } else {
            navigate({ to: '/home' })
          }
        }
      } else {
        const { data: signInData, error } = await signIn(email, password)
        if (error) {
          console.error('Signin error:', error)
          throw error
        }
        if (signInData.user) {
          const { data: profile } = await fetchProfile(signInData.user.id)
          if (!profile?.username) {
            navigate({ to: '/onboarding' })
          } else {
            navigate({ to: '/home' })
          }
        }
      }
    } catch (err: unknown) {
      console.error('Auth error:', err)
      const message = err instanceof Error ? err.message : 'Bir hata oluştu.'
      if (message.includes('Invalid login credentials')) {
        setError('Email veya şifre hatalı.')
      } else if (message.includes('Email not confirmed')) {
        setError('Email adresinizi doğrulamanız gerekiyor.')
      } else if (message.includes('User already registered')) {
        setError('Bu email adresi zaten kayıtlı.')
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  const titles = {
    login: 'Hoş Geldiniz',
    register: 'Hesap Oluştur',
    forgot: 'Şifremi Unuttum',
  }

  const subtitles = {
    login: 'Okey masasına dönelim!',
    register: 'Yeni bir hesap oluşturun',
    forgot: 'Email adresinizi girin',
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <div className="text-5xl mb-3">🎴</div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Yazboz</h1>
        <p className="text-[#a0aec0] text-sm mt-1">Cezalı Okey Skor Takibi</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-sm bg-[#16213e] rounded-2xl p-6 shadow-2xl border border-[#2d3748]"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <h2 className="text-xl font-semibold text-white mb-1">{titles[mode]}</h2>
            <p className="text-[#a0aec0] text-sm mb-6">{subtitles[mode]}</p>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
                <AlertCircle size={16} className="text-red-400 shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl p-3 mb-4">
                <CheckCircle size={16} className="text-green-400 shrink-0" />
                <p className="text-green-400 text-sm">{success}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096]" />
                <input
                  type="email"
                  placeholder="Email adresiniz"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-[#0f3460]/50 border border-[#2d3748] rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#718096] focus:outline-none focus:border-[#e94560] transition-colors text-sm"
                />
              </div>

              {mode !== 'forgot' && (
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Şifreniz"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-[#0f3460]/50 border border-[#2d3748] rounded-xl py-3 pl-10 pr-10 text-white placeholder-[#718096] focus:outline-none focus:border-[#e94560] transition-colors text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#718096] hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              )}

              {mode === 'register' && (
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Şifreyi tekrarla"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full bg-[#0f3460]/50 border border-[#2d3748] rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#718096] focus:outline-none focus:border-[#e94560] transition-colors text-sm"
                  />
                </div>
              )}

              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); setSuccess('') }}
                  className="text-[#e94560] text-xs text-right hover:underline"
                >
                  Şifremi unuttum
                </button>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#e94560] hover:bg-[#c73652] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors mt-1"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    {mode === 'login' ? 'Giriş Yap' : mode === 'register' ? 'Kayıt Ol' : 'Gönder'}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </AnimatePresence>

        <div className="mt-5 pt-5 border-t border-[#2d3748] text-center">
          {mode === 'login' ? (
            <p className="text-[#a0aec0] text-sm">
              Hesabın yok mu?{' '}
              <button
                onClick={() => { setMode('register'); setError(''); setSuccess('') }}
                className="text-[#e94560] font-medium hover:underline"
              >
                Kayıt Ol
              </button>
            </p>
          ) : (
            <button
              onClick={() => { setMode('login'); setError(''); setSuccess('') }}
              className="text-[#a0aec0] text-sm hover:text-white transition-colors"
            >
              ← Giriş ekranına dön
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
