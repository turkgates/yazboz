import { useRef, useState } from 'react'

// Kaydet düğmesine iki kez basılınca aynı el iki kez gönderilmesin. Kayıt başarılıysa
// kilit açılmaz: pencere kapanma animasyonu sırasında da düğme çalışmamalı.
export function useSaveLock() {
  const lockRef = useRef(false)
  const [saving, setSaving] = useState(false)

  const runSave = async (save: () => Promise<boolean>) => {
    if (lockRef.current) return
    lockRef.current = true
    setSaving(true)

    let saved = false
    try {
      saved = await save()
    } finally {
      if (!saved) {
        lockRef.current = false
        setSaving(false)
      }
    }
  }

  return { saving, runSave }
}
