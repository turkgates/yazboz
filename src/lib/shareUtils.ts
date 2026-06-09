import html2canvas from 'html2canvas'

export async function shareGameResult(
  cardId: string,
  winnerName: string
): Promise<void> {
  const card = document.getElementById(cardId)
  if (!card) return

  try {
    card.style.left = '0'
    card.style.top = '0'
    card.style.zIndex = '-1'

    const canvas = await html2canvas(card, {
      backgroundColor: null,
      scale: 2,
    })

    card.style.left = '-9999px'

    await new Promise<void>((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          resolve()
          return
        }

        const file = new File([blob], 'okey-sonuc.png', { type: 'image/png' })

        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({
              title: 'Okey Yazboz Sonucu',
              text: `${winnerName} kazandı! 🏆`,
              files: [file],
            })
          } catch {
            // kullanıcı iptal etti
          }
        } else {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'okey-sonuc.png'
          a.click()
          URL.revokeObjectURL(url)
        }
        resolve()
      })
    })
  } catch (error) {
    console.error('Paylaşım hatası:', error)
  }
}
