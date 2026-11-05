import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase, initialAuthHash, updatePassword } from '@/lib/supabase'
import { Eye, EyeOff, Lock, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react'
import { LogoMark, Wordmark } from '@/components/Logo'

export const Route = createFileRoute('/reset-password')({
  component: ResetPasswordPage,
})

type PageState = 'checking' | 'ready' | 'invalid' | 'done'

// Şifre yalnızca e-postadaki kurtarma bağlantısıyla gelen oturumda değiştirilebilir
const isRecoveryLink = new URLSearchParams(initialAuthHash.slice(1)).get('type') === 'recovery'

function ResetPasswordPage() {
  const navigate = useNavigate()
  const [pageState, setPageState] = useState<PageState>(isRecoveryLink ? 'checking' : 'invalid')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isRecoveryLink) return
    supabase.auth.getSession().then(({ data }) => {
      setPageState(data.session ? 'ready' : 'invalid')
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor.')
      return
    }
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.')
      return
    }

    setLoading(true)
    const { error: updateError } = await updatePassword(password)
    setLoading(false)

    if (updateError) {
      console.error('Update password error:', updateError)
      setError(
        updateError.message.includes('different from the old password')
          ? 'Yeni şifre eskisinden farklı olmalıdır.'
          : updateError.message
      )
      return
    }

    setPageState('done')
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <LogoMark size={88} className="mx-auto mb-4" />
        <h1 className="text-4xl text-white">
          <Wordmark />
        </h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-sm bg-[#16213e] rounded-2xl p-6 shadow-2xl border border-[#2d3748]"
      >
        {pageState === 'checking' && (
          <div className="flex justify-center py-6">
            <div className="w-10 h-10 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {pageState === 'invalid' && (
          <>
            <h2 className="text-xl font-semibold text-white mb-1">Bağlantı Geçersiz</h2>
            <p className="text-[#a0aec0] text-sm mb-6">
              Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş. Giriş ekranından yeni bir bağlantı isteyebilirsin.
            </p>
            <button
              onClick={() => navigate({ to: '/auth', replace: true })}
              className="w-full bg-[#e94560] hover:bg-[#c73652] text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              Giriş Ekranına Dön
              <ArrowRight size={16} />
            </button>
          </>
        )}

        {pageState === 'ready' && (
          <>
            <h2 className="text-xl font-semibold text-white mb-1">Yeni Şifre</h2>
            <p className="text-[#a0aec0] text-sm mb-6">Hesabın için yeni bir şifre belirle</p>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
                <AlertCircle size={16} className="text-red-400 shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Yeni şifre"
                  autoComplete="new-password"
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

              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Yeni şifreyi tekrarla"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full bg-[#0f3460]/50 border border-[#2d3748] rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#718096] focus:outline-none focus:border-[#e94560] transition-colors text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#e94560] hover:bg-[#c73652] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors mt-1"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Şifreyi Güncelle
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </>
        )}

        {pageState === 'done' && (
          <>
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl p-3 mb-6">
              <CheckCircle size={16} className="text-green-400 shrink-0" />
              <p className="text-green-400 text-sm">Şifren güncellendi.</p>
            </div>
            <button
              onClick={() => navigate({ to: '/home', replace: true })}
              className="w-full bg-[#e94560] hover:bg-[#c73652] text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              Devam Et
              <ArrowRight size={16} />
            </button>
          </>
        )}
      </motion.div>
    </div>
  )
}
