import { useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

interface BackButtonProps {
  showLabel?: boolean
  className?: string
}

export function BackButton({ showLabel = false, className = '' }: BackButtonProps) {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => router.history.back()}
      className={`flex items-center gap-1.5 text-[#a0aec0] hover:text-white transition-colors ${className}`}
    >
      <ArrowLeft size={18} />
      {showLabel && <span className="text-sm font-medium">Geri</span>}
    </button>
  )
}
