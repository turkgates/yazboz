import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Camera, X } from 'lucide-react'
import { supabase, createPlayer, updatePlayer, uploadAvatar } from '@/lib/supabase'
import type { SavedPlayer } from '@/types'
import { PlayerAvatar } from '@/components/ui/PlayerAvatar'
import { v4 as uuidv4 } from 'uuid'

interface PlayerFormModalProps {
  player?: SavedPlayer | null
  onClose: () => void
  onSaved: () => void
}

export function PlayerFormModal({ player, onClose, onSaved }: PlayerFormModalProps) {
  const [name, setName] = useState(player?.name ?? '')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(player?.avatar_url ?? null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(player?.name ?? '')
    setAvatarUrl(player?.avatar_url ?? null)
    setAvatarFile(null)
  }, [player])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarUrl(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('İsim gerekli')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum bulunamadı')

      let finalAvatarUrl = player?.avatar_url ?? null
      if (avatarFile) {
        const uploaded = await uploadAvatar(user.id, avatarFile)
        if (uploaded) finalAvatarUrl = uploaded
      } else if (!avatarUrl) {
        finalAvatarUrl = null
      } else if (player?.avatar_url) {
        finalAvatarUrl = player.avatar_url
      }

      if (player) {
        const { error } = await updatePlayer(player.id, { name: trimmed, avatar_url: finalAvatarUrl })
        if (error) {
          console.error('Update player error:', error)
          throw error
        }
      } else {
        const { error } = await createPlayer({
          id: uuidv4(),
          user_id: user.id,
          name: trimmed,
          avatar_url: finalAvatarUrl,
        })
        if (error) {
          console.error('Create player error:', error)
          throw error
        }
      }

      onSaved()
      onClose()
    } catch (err: unknown) {
      console.error('Player save error:', err)
      setError(err instanceof Error ? err.message : 'Kayıt başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-[#16213e] rounded-t-3xl border-t border-x border-[#2d3748] safe-bottom"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#4a5568]" />
        </div>

        <div className="px-5 pb-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-white font-bold text-lg">
              {player ? 'Oyuncu Düzenle' : 'Oyuncu Ekle'}
            </h3>
            <button onClick={onClose} className="text-[#718096] hover:text-white">
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-col items-center gap-3 mb-5">
            <PlayerAvatar name={name || 'Oyuncu'} avatarUrl={avatarUrl} size="lg" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 text-sm text-[#e94560] font-medium"
            >
              <Camera size={16} />
              Fotoğraf Yükle
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={handleFileChange}
            />
            {avatarUrl && (
              <button
                type="button"
                onClick={() => { setAvatarUrl(null); setAvatarFile(null) }}
                className="text-xs text-[#718096] hover:text-white"
              >
                Fotoğrafı kaldır (baş harf avatar kullan)
              </button>
            )}
          </div>

          <input
            type="text"
            placeholder="Oyuncu adı"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            className="w-full bg-[#0f3460]/50 border border-[#2d3748] rounded-xl py-3 px-4 text-white placeholder-[#718096] focus:outline-none focus:border-[#e94560] text-sm mb-4"
          />

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3.5 rounded-xl"
            >
              İptal
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-[2] bg-[#e94560] disabled:opacity-60 text-white font-bold py-3.5 rounded-xl"
            >
              {loading ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
