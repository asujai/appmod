# appmod

**Kullandığın masaüstü uygulamalarına kendi dilini ve küçük eklentilerini getir.**

appmod, bilgisayarında kurulu bir Electron uygulamasına eksik arayüz dilini ya da kişisel
kullanım için küçük bir özellik (bir tuş, bir kısayol, yerel bir betiğe bağlantı) ekler.
Uygulamanın dosyalarına dokunmaz: uygulamayı yerel bir hata ayıklama portuyla başlatır ve
değişiklikleri açılışta pencerelere yükler. Uygulamayı kendi kısayolundan açarsan orijinali
olduğu gibi açılır.

Ajanın ihtiyaç duyduğu her şey bu tek depoda: uygulamayı **okur** (asar, Electron fuse'ları,
çeviri kütüphanesi, ortam değişkenleri, komut satırı anahtarları, eklenti klasörleri, IPC),
çalışan uygulamayı **gözler ve kullanır** (metin, seçiciler, tıklama, ekran görüntüsü) ve
**değiştirir** (dil paketi, özellik, yerel eylemler). Ayrıca bir tersine mühendislik aracı
kurmak gerekmez.

Yapay zekâ kodlama ajanları için tasarlandı (Claude Code, Codex, Gemini/Antigravity…).
`skills/appmod` becerisi ajana neyi kontrol edeceğini, metinlerin nerede durduğunu, nasıl
güvenle çevireceğini ve sonucu nasıl doğrulayacağını söyler. Her uygulamanın bir **tarifi**
(recipe) olur; neyin işe yaradığı ve nerede takılındığı orada yazar. Sonraki kişi sıfırdan
başlamaz.

## Örnek istekler

> "Qoder'da yalnız İngilizce ve Çince var. Türkçe ekle."
>
> "Gönder düğmesinin yanına panodaki metni kod bloğu olarak yapıştıran bir tuş ekle."
>
> "Discord'da mesajın yanındaki simgeye tıklayınca Türkçeye çevrilsin."

## Gerekenler

- Node.js 22 veya üstü (npm bağımlılığı yok)
- Electron uygulaması. Diğer türler için `skills/appmod/references/new-app.md`.
- Windows'ta test edildi; macOS ve Linux henüz denenmedi.

## Komutlar

```bash
node bin/appmod.mjs list                 # tarifler
node bin/appmod.mjs analyze qoder        # gönderilen kodu okur: fuse, çeviri sistemi, kancalar
node bin/appmod.mjs search qoder "PLUGIN_DEV"   # kodda arama, çevresiyle birlikte
node bin/appmod.mjs inspect qoder        # önce uygulamayı kapat; metinlerini çıkarır
node bin/appmod.mjs check qoder          # eksik anahtar ve bozuk yer tutucu denetimi
node bin/appmod.mjs launch qoder         # uygulamayı tarifle başlat
node bin/appmod.mjs shortcut qoder       # masaüstü kısayolu (Windows)
node bin/appmod.mjs live qoder text      # açık pencerede ne yazıyor
node bin/appmod.mjs live qoder shot a.png # açık pencerenin ekran görüntüsü
node bin/appmod.mjs new uygulama-adi     # şablondan yeni tarif
```

## Tarifler

| Uygulama | Dil | Özellikler | Denenen |
|---|---|---|---|
| [Qoder](recipes/qoder/NOTES.md) | Türkçe (9.182 anahtar + 209 metin) | — | 0.4.8, Windows 11 |
| [Discord](recipes/discord/NOTES.md) | — | Mesaj çeviri düğmesi (varsayılan Türkçe) | 1.0.9264, Windows 11 |

## Sınırlar

- Değişiklik uygulama güncellenene kadar geçerli; sonra `inspect` + `check` ile yeni metinler
  çevrilir.
- Tepsi menüsü, yerel menüler ve işletim sistemi pencereleri orijinal dilde kalır.
- Yalnız Electron/JavaScript uygulamaları. Yerel programlar, .NET, oyunlar ve Android için
  ayrıştırıcı gerekir (ör. REA); appmod bunları kapsamaz.
- Bu şekilde açıkken uygulamanın hata ayıklama portu (yalnız 127.0.0.1) bilgisayardaki diğer
  programlara açıktır. Ortak veya güvenilmeyen bilgisayarda kullanma.

Yalnız kişisel kullanım içindir; bazı uygulamaların kullanım şartları istemciyi değiştirmeyi
yasaklar, buna uymak kullanıcının sorumluluğundadır. MIT lisanslı. Analiz yönergeleri REA'dan (MIT) uyarlandı; bkz. `THIRD_PARTY_NOTICES.md`.
