import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, Share2 } from 'lucide-react'

export function ShareCodeBlock({
  code,
  link,
  note,
  shareTitle,
  shareText,
}: {
  code: string
  link: string
  note: string
  shareTitle: string
  shareText: string
}) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)

  const copy = async (text: string, kind: 'code' | 'link') => {
    await navigator.clipboard.writeText(text)
    setCopied(kind)
    setTimeout(() => setCopied(null), 2000)
  }

  const share = async () => {
    if (!navigator.share) {
      await copy(link, 'link')
      return
    }
    try {
      await navigator.share({ title: shareTitle, text: shareText, url: link })
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        console.error('Paylaşma hatası:', err)
      }
    }
  }

  return (
    <>
      <div className="flex justify-center">
        <div className="bg-white rounded-2xl p-3">
          <QRCodeSVG value={link} size={160} />
        </div>
      </div>
      <p className="text-[#a0aec0] text-sm text-center">{note}</p>
      <div className="bg-[#0f3460]/40 border border-[#2d3748] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-white font-mono text-2xl font-bold tracking-widest">{code}</span>
        <button
          type="button"
          onClick={() => copy(code, 'code')}
          className="flex items-center gap-1.5 shrink-0 bg-[#0f3460] text-[#a0aec0] text-xs font-semibold px-3 h-9 rounded-lg"
        >
          {copied === 'code' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          {copied === 'code' ? 'Kopyalandı' : 'Kopyala'}
        </button>
      </div>
      <button
        type="button"
        onClick={share}
        className="w-full h-12 bg-[#e94560] text-white font-bold rounded-xl flex items-center justify-center gap-2"
      >
        {copied === 'link' ? <Check size={18} /> : <Share2 size={18} />}
        {copied === 'link' ? 'Bağlantı kopyalandı' : 'Bağlantıyı Paylaş'}
      </button>
    </>
  )
}
