# appmod

**Kullandığın masaüstü uygulamalarına kendi dilini ve küçük eklentilerini getir.**

appmod, bilgisayarında kurulu bir Electron uygulamasına eksik arayüz dilini ya da kişisel
kullanım için küçük bir özellik (bir tuş, bir kısayol, yerel bir betiğe bağlantı) ekler.
Uygulamanın dosyalarına dokunmaz: uygulamayı yerel bir hata ayıklama portuyla başlatır ve
değişiklikleri açılışta pencerelere yükler. Uygulamayı kendi kısayolundan açarsan orijinali
olduğu gibi açılır.

Yapay zekâ kodlama ajanları için tasarlandı (Claude Code, Codex, Gemini/Antigravity…).
`skills/appmod` becerisi ajana neyi kontrol edeceğini, metinlerin nerede durduğunu, nasıl
güvenle çevireceğini ve sonucu nasıl doğrulayacağını söyler. Her uygulamanın bir **tarifi**
(recipe) olur; neyin işe yaradığı ve nerede takılındığı orada yazar. Sonraki kişi sıfırdan
başlamaz.

## Örnek istekler

> "Qoder'da yalnız İngilizce ve Çince var. Türkçe ekle."
>
> "Gönder düğmesinin yanına panodaki metni kod bloğu olarak yapıştıran bir tuş ekle."

## Gerekenler

- Node.js 22 veya üstü (npm bağımlılığı yok)
- Electron uygulaması. Diğer türler için `skills/appmod/references/new-app.md`.
- Windows'ta test edildi; macOS ve Linux henüz denenmedi.

## Komutlar

```bash
node bin/appmod.mjs list                 # tarifler
node bin/appmod.mjs inspect qoder        # önce uygulamayı kapat; metinlerini çıkarır
node bin/appmod.mjs check qoder          # eksik anahtar ve bozuk yer tutucu denetimi
node bin/appmod.mjs launch qoder         # uygulamayı tarifle başlat
node bin/appmod.mjs shortcut qoder       # masaüstü kısayolu (Windows)
node bin/appmod.mjs new uygulama-adi     # şablondan yeni tarif
```

## Sınırlar

- Değişiklik uygulama güncellenene kadar geçerli; sonra `inspect` + `check` ile yeni metinler
  çevrilir.
- Tepsi menüsü, yerel menüler ve işletim sistemi pencereleri orijinal dilde kalır.
- Bu şekilde açıkken uygulamanın hata ayıklama portu (yalnız 127.0.0.1) bilgisayardaki diğer
  programlara açıktır. Ortak veya güvenilmeyen bilgisayarda kullanma.

Yalnız kişisel kullanım içindir; bazı uygulamaların kullanım şartları istemciyi değiştirmeyi
yasaklar, buna uymak kullanıcının sorumluluğundadır. MIT lisanslı.
