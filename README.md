# 🎴 Yazboz - Cezalı Okey Skor Takibi

Türkiye'nin en sevilen kart oyunu Cezalı Okey için dijital yazboz uygulaması.

## Özellikler

- 📱 Mobile-first, PWA desteği (çevrimdışı çalışır, masaüstüne eklenebilir)
- 🔐 Supabase Auth ile güvenli giriş/kayıt
- 🎮 2-4 oyunculu oyun desteği
- 🧮 Otomatik puan hesaplama (okey atma, çiftten bitme çarpanları)
- 📊 İstatistikler ve oyun geçmişi
- 🏆 Oyun sonu sıralama ve konfeti animasyonu
- 🔄 Offline-first: internet yokken oyun devam eder, bağlantı gelince sync

## Kurulum

```bash
npm install
```

### Supabase Ayarları

1. [supabase.com](https://supabase.com)'da yeni proje oluştur
2. `supabase-schema.sql` dosyasını SQL Editor'de çalıştır
3. `.env.local` dosyasını düzenle:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### Geliştirme

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

## Teknolojiler

- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS v4** - Styling
- **TanStack Router** - Type-safe routing
- **Zustand** - State yönetimi (persist ile offline destek)
- **Supabase** - Auth + PostgreSQL veritabanı
- **Framer Motion** - Animasyonlar
- **vite-plugin-pwa** - PWA / Service Worker

## Puan Hesaplama

```
Puan = Ham Puan × Renk Çarpanı × Özel Çarpan

Renk çarpanları: Siyah×5, Kırmızı×4, Sarı×3, Yeşil×2
Özel: Okey Atıldı ×2, Çiftten Bitti ×2 (ikisi birden ×4)

Biten oyuncu: -(Düşüş Puanı × Toplam Çarpan)
```

## Supabase Şeması

`supabase-schema.sql` dosyasına bakın.
