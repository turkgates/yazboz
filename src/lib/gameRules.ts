export type GameRulesKey = 'cezali_okey' | 'sayili_okey' | 'yuzbir_okey'

export interface GameRuleSection {
  title: string
  content: string | string[]
}

export interface GameRules {
  title: string
  description: string
  sections: GameRuleSection[]
}

export const GAME_RULES: Record<GameRulesKey, GameRules> = {
  cezali_okey: {
    title: 'Cezalı Okey',
    description: 'Elindeki ceza taşlarına göre çarpan uygulanır.',
    sections: [
      {
        title: '🎯 Amaç',
        content: 'Elindeki taşları bitirerek en az ceza almak.',
      },
      {
        title: '🎨 Renk Çarpanları',
        content: [
          '⬛ Siyah → ×5',
          '🔴 Kırmızı → ×4',
          '🟡 Sarı → ×3',
          '🟢 Yeşil → ×2',
        ],
      },
      {
        title: '✅ Biten Oyuncu',
        content: [
          'Normal bitti → Renk bonusu düşer (Siyah -50)',
          'Okey attı → 10 katı düşer (Siyah -500)',
          'Çiftten bitti → 10 katı düşer (Siyah -500)',
          'Çiftten + Okey → 20 katı düşer (Siyah -1000)',
        ],
      },
      {
        title: '❌ Bitmeyen Oyuncu',
        content: [
          'Elindeki puan × renk çarpanı',
          'Okey atıldıysa × 2 katı',
          'Çiftten bittiyse × 2 katı',
          'İkisi birden → × 4 katı',
        ],
      },
      {
        title: '🔥 Okeyi Yakma',
        content: [
          'Okeye dönerken başkası normal bitti → Siyah +500',
          'Okeye dönerken başkası okey attı → Siyah +1000',
          'Okeye dönerken çiftten okey atıldı → Siyah +1500',
        ],
      },
      {
        title: '🃏 Sahte Okey',
        content: [
          'Renk çarpanından bağımsız, sabit ×10',
          'Normal sahte okey → Biten -100, Rakip ×10',
          'Sahte okey + Okey → Biten -1000, Rakip ×20',
          'Çiftten sahte okey → Biten -2000, Rakip ×40',
        ],
      },
      {
        title: '🏆 Oyun Sonu',
        content: '11 el (ayarlanabilir) sonunda en az ceza alan kazanır.',
      },
    ],
  },

  sayili_okey: {
    title: 'Sayılı Okey',
    description: 'Belirli sayıdan başlanır, sıfıra ilk düşen kazanır.',
    sections: [
      {
        title: '🎯 Amaç',
        content: 'Başlangıç sayısını (21) sıfıra indirmek. İlk sıfıra düşen kazanır.',
      },
      {
        title: '✅ Puan Düşme',
        content: [
          'Normal bitti → -2',
          'Okey attı → -4',
          'Çiftten bitti → -4',
          'Çiftten + Okey → -8',
        ],
      },
      {
        title: '⭐ Gösterge',
        content: [
          'Elinde gösterge taşı varsa gösterge butonuna bas',
          'Anında 1 sayı düşer',
          'Her elde sadece 1 kez yapılabilir',
          '1 sayı kalmışken gösterge yapılamaz',
        ],
      },
      {
        title: '⚠️ Önemli Kural',
        content: 'Sayısı 0 veya altına düşen oyuncu kazanır. Diğerleri mevcut sayılarına göre sıralanır.',
      },
      {
        title: '🏆 Oyun Sonu',
        content: 'Bir oyuncunun sayısı 0\'a düşünce oyun biter. Manuel "Oyunu Bitir" butonu ile de sonlandırılabilir.',
      },
    ],
  },

  yuzbir_okey: {
    title: '101 Okey',
    description: 'En az puan toplayan kazanır. Açılış için 101 puan gerekli.',
    sections: [
      {
        title: '🎯 Amaç',
        content: 'Belirlenen el sonunda en az puana sahip olmak. Negatif puan mümkün.',
      },
      {
        title: '🔓 Açılış Kuralı',
        content: 'Yere taş bırakmak için önce en az 101 puanlık per açılması gerekir.',
      },
      {
        title: '✅ Biten Oyuncu',
        content: [
          'Normal bitiş → -101',
          'Elden bitiş → -202',
          'Okey ile bitiş → -202',
          'Elden + Okey → -303',
        ],
      },
      {
        title: '❌ Bitmeyen Oyuncu',
        content: [
          'Açmadıysa → +202 sabit ceza',
          'Açtıysa → elindeki taşların toplamı',
          'Yanlış açma → +101 ekstra ceza',
          'Okey elde kaldı → +101 ekstra ceza',
        ],
      },
      {
        title: '🔄 Katlamalı Kural',
        content: [
          'Opsiyonel, oyun başında açılır/kapatılır',
          'İlk açan 110 puanla açtıysa',
          'Sonraki oyuncu en az 111 puanla açmak zorunda',
        ],
      },
      {
        title: '🏆 Oyun Sonu',
        content: 'Belirlenen el sayısı (11) sonunda en düşük puan kazanır.',
      },
    ],
  },
}

export function toRulesKey(gameType: string): GameRulesKey | null {
  if (gameType === 'cezali_okey' || gameType === 'cezali_esli') return 'cezali_okey'
  if (gameType === 'sayili_okey') return 'sayili_okey'
  if (gameType === '101_okey') return 'yuzbir_okey'
  return null
}
