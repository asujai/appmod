# appmod

**Kullandığın uygulamalara ve sitelere kendi dilini ve küçük eklentilerini getir.**

appmod, sahibi olmadığın uygulamaları kendin için değiştirmeye yarayan açık bir standart ve
araç takımı: eksik arayüz dilini ya da küçük bir kişisel özelliği (bir tuş, bir kısayol, yerel
bir betiğe bağlantı) ekler. Uygulamanın dosyalarına dokunmaz. Her değişiklik bir **tarifte**
(recipe) durur; tarif neyin işe yaradığını ve nerede takılındığını da yazar, sonraki kişi
sıfırdan başlamaz.

Yapay zekâ kodlama ajanları için tasarlandı (Claude Code, Codex, Gemini/Antigravity…).
`skills/appmod` becerisi ajana neyi kontrol edeceğini, hedefi nasıl okuyacağını, değişikliği
nasıl güvenle uygulayacağını ve ekranda nasıl doğrulayacağını söyler.

## Kapsam

| Tür | Örnek | Nasıl okur | Nasıl değiştirir | Geri alma |
|---|---|---|---|---|
| `electron` | Qoder, Discord, Slack, VS Code türevleri | asar, fuse, çeviri sistemi, ortam değişkenleri, IPC (yerleşik) | açılışta CDP ile yükler | uygulamayı normal aç |
| `web` | herhangi bir site | canlı sayfa (yerleşik) | ayrı tarayıcı profili ya da paketlenmemiş eklenti | kapat / eklentiyi kaldır |
| `android` | ADB ile telefon veya TV uygulamaları | `aapt2` ile gelen diller; kod için REA | resmî uygulama başına dil (Android 13+) | `reset` |
| `native` | diğer masaüstü uygulamaları | REA | uygulamanın resmî yolları: dil/eklenti klasörü, argüman, ortam değişkeni | `reset` |

appmod Electron uygulamalarını ve siteleri kendisi okur. Yerel program, .NET ve APK kodu için
gerektiğinde [REA](https://github.com/morluto/rea)'yı çağırır (kuruluysa onu, değilse `npx` ile
bir kez indirir); sen yalnız appmod'u çalıştırırsın. REA hedefi anlar; appmod REA'nın bilerek
yapmadığı kısmı ekler: değişikliği uygulamak ve paylaşmak.

## Örnek istekler

> "Qoder'da yalnız İngilizce ve Çince var. Türkçe ekle."
>
> "Hacker News'te her başlığın yanına çeviri düğmesi koy."
>
> "Bu Android TV uygulaması Türkçe açılsın."

## Gerekenler

- Node.js 22 veya üstü (npm bağımlılığı yok)
- Web tarifleri: Chrome veya Edge. Android tarifleri: `adb` (ve `aapt2` için Android SDK
  build-tools).
- Windows'ta test edildi; macOS ve Linux henüz denenmedi.

## Komutlar

```bash
node bin/appmod.mjs list                         # tarifler ve türleri
node bin/appmod.mjs new uygulama --kind web      # şablondan yeni tarif
node bin/appmod.mjs analyze qoder                # hedefi çalıştırmadan oku
node bin/appmod.mjs search qoder "PLUGIN_DEV"    # Electron kodunda arama
node bin/appmod.mjs inspect qoder                # Electron uygulamasının metinlerini çıkar
node bin/appmod.mjs check qoder                  # eksik anahtar, bozuk yer tutucu denetimi
node bin/appmod.mjs launch hacker-news           # tarifi uygula ve başlat
node bin/appmod.mjs live hacker-news shot a.png  # açık hedefin ekran görüntüsü
node bin/appmod.mjs extension hacker-news        # web: kendi tarayıcın için eklenti
node bin/appmod.mjs reset android-uygulamam      # android/native: geri al
node bin/appmod.mjs rea doctor --json            # herhangi bir REA komutunu appmod üzerinden çalıştır
```

## Tarifler

| Tarif | Tür | Dil | Özellik | Denenen |
|---|---|---|---|---|
| [Qoder](recipes/qoder/NOTES.md) | electron | Türkçe (9.182 anahtar + 209 metin) | — | 0.4.8, Windows 11 |
| [Discord](recipes/discord/NOTES.md) | electron | — | mesaj çeviri düğmesi | 1.0.9264, Windows 11 |
| [Hacker News](recipes/hacker-news/NOTES.md) | web | — | başlık ve yorumlarda çeviri düğmesi | 2026-10-22, Chrome, Windows 11 |

Her tür için şablon: `recipes/_template*`.

## Sınırlar

- Değişiklik uygulama güncellenene kadar geçerli; sonra yeniden analiz edilir.
- Electron'da tepsi menüsü, yerel menüler ve işletim sistemi pencereleri olduğu gibi kalır.
- Android ve yerel uygulamalara tuş eklenemez (root ya da uygulamanın kendi eklenti sistemi
  olmadan içine yükleme yapılamaz). Android'de uygulama başına dil yalnız uygulamanın taşıdığı
  dillerden seçer.
- `launch` ile açıkken hata ayıklama portu (yalnız 127.0.0.1) bilgisayardaki diğer programlara
  açıktır. Ortak veya güvenilmeyen bilgisayarda kullanma.

Yalnız kişisel kullanım içindir. Bazı uygulamaların kullanım şartları istemciyi değiştirmeyi
yasaklar; uymak kullanıcının sorumluluğundadır. appmod hesaplara, ödemelere, DRM'e ve hile
önleme sistemlerine dokunmaz, ücretli özellik açmaz. MIT lisanslı. Analiz yönergeleri REA'dan
(MIT) uyarlandı; bkz. `THIRD_PARTY_NOTICES.md`.
