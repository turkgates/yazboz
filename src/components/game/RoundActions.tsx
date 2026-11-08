import { motion } from 'framer-motion'
import { Eye, EyeOff, Pencil, Trash2 } from 'lucide-react'
import { useViewStore } from '@/stores/viewStore'

interface RoundActionSheetProps {
  roundNumber: number
  title?: string
  onEdit?: () => void
  onDelete: () => void
  onClose: () => void
}

export function RoundActionSheet({ roundNumber, title, onEdit, onDelete, onClose }: RoundActionSheetProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-[#16213e] rounded-t-3xl border-t border-x border-[#2d3748] safe-bottom p-5"
      >
        <h3 className="text-white font-bold text-center mb-4">{title ?? `${roundNumber}. El`}</h3>
        <div className="flex flex-col gap-2">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="w-full bg-[#0f3460] hover:bg-[#1a4a7a] text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2"
            >
              <Pencil size={18} />
              Düzenle
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="w-full bg-[#0f3460] hover:bg-[#1a4a7a] text-red-400 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2"
          >
            <Trash2 size={18} />
            Sil
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full text-[#a0aec0] font-semibold py-3 rounded-xl"
          >
            Vazgeç
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

interface ConfirmDialogProps {
  message: string
  detail?: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  message,
  detail,
  confirmLabel = 'Sil',
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
    >
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="relative bg-[#16213e] border border-[#2d3748] rounded-2xl p-5 max-w-sm w-full"
      >
        <p className="text-white text-center">{message}</p>
        {detail && <p className="text-[#a0aec0] text-sm text-center mt-2">{detail}</p>}
        <div className="flex gap-3 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 bg-[#0f3460] text-[#a0aec0] font-semibold py-3 rounded-xl"
          >
            İptal
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl"
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function TotalsToggle({ className = '' }: { className?: string }) {
  const { hideTotals, toggleTotals } = useViewStore()
  return (
    <button
      type="button"
      onClick={toggleTotals}
      aria-label={hideTotals ? 'Toplamı göster' : 'Toplamı gizle'}
      aria-pressed={hideTotals}
      className={`w-8 h-8 flex items-center justify-center rounded-lg text-[#a0aec0] hover:text-white hover:bg-[#16213e] ${className}`}
    >
      {hideTotals ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  )
}

export function HiddenTotal({ className = '' }: { className?: string }) {
  return (
    <span className={`text-[#4a5568] tracking-widest ${className}`} aria-label="Gizli">
      •••
    </span>
  )
}

export const ROUND_TAP_HINT = 'Düzeltmek veya silmek için ele dokun'

export const DELETE_REOPENS_HINT = 'Oyun yeniden açılır; eli tekrar girebilirsin.'
