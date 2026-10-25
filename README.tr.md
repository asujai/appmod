# appmod

[![testler](https://github.com/asujai/appmod/actions/workflows/test.yml/badge.svg)](https://github.com/asujai/appmod/actions/workflows/test.yml)

**Kullandığın uygulamalara ve sitelere kendi dilini, kendi görünümünü ve küçük eklentilerini
getir. Yapay zekâ ajanına bir kez söyle; masaüstünde uygulamayı senin istediğin gibi açan tek
bir kısayol olsun.**

appmod, sahibi olmadığın uygulamaları kendin için değiştirmeye yarayan açık bir standart ve
araç takımı: eksik arayüz dilini ekler, ekranı yeniden boyar, kalabalığı gizler, bir tuş ya da
klavye kısayolu ekler, mesajları istendiğinde çevirir veya yerel bir betiğe bağlar. Uygulamanın
dosyalarına dokunmaz. Her değişiklik bir **tarifte** (recipe) durur; tarif neyin işe yaradığını
ve nerede takılındığını da yazar, sonraki kişi sıfırdan başlamaz.

Yapay zekâ kodlama ajanları için tasarlandı (Claude Code, Codex, Gemini CLI, Antigravity…).
`skills/appmod` becerisi ajana isteği nasıl anlayacağını, en ucuz yolu, hedefi nasıl
okuyacağını, değişikliği nasıl güvenle uygulayacağını, ekranda nasıl doğrulayacağını ve tek
kısayolla nasıl teslim edeceğini söyler.

## Kurulum (bir kez)

```bash
git clone https://github.com/asujai/appmod.git
node appmod/bin/appmod.mjs setup
```

`setup`, beceriyi bulduğu her kodlama ajanına kopyalar (Claude Code `~/.claude/skills`, Codex ve
Gemini CLI `~/.agents/skills`, Antigravity `~/.gemini/config/skills`) ve bu klasörün yerini içine
yazar. Yalnız Node.js 22+ gerekir. `node appmod/bin/appmod.mjs doctor` bilgisayarda neyin hazır
olduğunu gösterir. `git pull` sonrası `setup`'ı yeniden çalıştır.

Ya da ajana bırak: *"github.com/asujai/appmod'u kur ve setup'ını çalıştır."*

## Kullanım

Ajana kendi cümlelerinle söyle:

> "Qoder'da yalnız İngilizce ve Çince var. Türkçe yap."
>
> "Discord'da her mesaja çeviri düğmesi koy."
>
> "Hacker News'te her başlığın yanına çeviri düğmesi koy."
>
> "Bu sitenin yazılarını büyüt, yan menüyü gizle."
>
> "Bu Android TV uygulaması Türkçe açılsın."

Ajan `recipes/<uygulama>/` tarifini bulur ya da yazar, değişikliği uygular, ekranda doğrular ve
masaüstüne bir kısayol koyar. **Kısayola çift tıkla**, uygulama değişikliklerinle açılsın.
Uygulama değişikliksiz açıksa yeniden başlatmayı sorar; zaten değişikliklerle açıksa öne getirir.
Uygulamanın kendi kısayolu onu değiştirmeden açmaya devam eder.

## Kapsam

| Tür | Örnek | Ne değişebilir | Nasıl | Tek tık | Geri alma |
|---|---|---|---|---|---|
| `electron` | Qoder, Discord, Slack, VS Code türevleri | penceredeki her şey | açılışta yerel hata ayıklama portu üzerinden yükleme | masaüstü kısayolu | uygulamayı normal aç |
| `webview` | WebView2 uygulamaları (Tauri, Wails, web arayüzlü Windows araçları), CEF uygulamaları | web görünümündeki her şey | aynısı; port `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` ya da anahtarla | masaüstü kısayolu | uygulamayı normal aç |
| `web` | herhangi bir site | eşleşen sayfalardaki her şey | ayrı tarayıcı profili ya da kendi tarayıcın için eklenti | kısayol ya da eklenti | kapat / eklentiyi kaldır |
| `android` | ADB ile telefon veya TV uygulamaları | uygulamanın dili (içinde gelen diller) | resmî uygulama başına dil (Android 13+) | masaüstü kısayolu | `reset` |
| `native` | WinUI, WPF, Qt ve diğer masaüstü uygulamaları | uygulamanın izin verdiği kadar | resmî yollar: dil ve eklenti klasörleri, anahtarlar, ortam değişkenleri | masaüstü kısayolu | `reset` |

appmod Electron uygulamalarını, web görünümlerini ve siteleri kendisi okur. Yerel program, .NET
ve APK kodu için gerektiğinde [REA](https://github.com/morluto/rea)'yı çağırır (kuruluysa onu,
değilse `npx` ile bir kez indirir).

## Komutlar

```bash
node bin/appmod.mjs setup                        # beceriyi ajanlarına kur
node bin/appmod.mjs doctor [tarif]               # bilgisayar denetimi; tarif: sürüm, durum, ne çalıştırdığı
node bin/appmod.mjs list                         # tarifler
node bin/appmod.mjs new uygulama --kind web      # şablondan yeni tarif
node bin/appmod.mjs analyze --exe "C:/.../App.exe"  # bu ne tür uygulama, nereye bağlanılır
node bin/appmod.mjs analyze qoder                # Electron uygulamasını çalıştırmadan oku
node bin/appmod.mjs inspect qoder                # uygulamanın metinlerini çıkar
node bin/appmod.mjs check qoder                  # eksik anahtar, bozuk yer tutucu denetimi
node bin/appmod.mjs validate --all               # bütün tariflerin durağan denetimi
node bin/appmod.mjs launch hacker-news           # tarifle başlat
node bin/appmod.mjs launch hacker-news --headless   # aynısı, penceresiz (denetim, CI)
node bin/appmod.mjs live hacker-news shot a.png  # açık hedefin ekran görüntüsü
node bin/appmod.mjs live qoder missing           # uygulama güncellenince: pakette olmayan metinler
node bin/appmod.mjs shortcut qoder               # masaüstü kısayolu (Windows, macOS, Linux)
node bin/appmod.mjs extension hacker-news        # web: kendi tarayıcın için eklenti
node bin/appmod.mjs reset android-uygulamam      # android/native: geri al
```

Bütün komut ve seçenekler: `node bin/appmod.mjs help`.

## Sınırlar

- Değişiklikler uygulama güncellenene kadar sürer. `doctor <tarif>` sürüm değişikliğini,
  `live <tarif> missing` yeni metinleri gösterir; ajan kayanı yeniden yapar.
- Ana süreç arayüzü (tepsi, yerel menüler, işletim sistemi pencereleri) olduğu gibi kalır.
  WinUI, WPF ve Qt pencerelerine yükleme yapılamaz; yalnız resmî yolları çalışır. Android'e
  yeni düğme eklenemez.
- Uygulama appmod ile açıkken hata ayıklama portu (yalnız 127.0.0.1) yerel programların onu
  yönetmesine izin verir. Paylaşılan ya da güvenilmeyen bilgisayarlarda kullanma.
- Elle Windows 11'de denendi. CI iş akışı test takımını Windows, macOS ve Linux'ta çalıştırır;
  oradaki kısayollar ve masaüstü uygulamaları henüz elle denenmedi.

## Tarifler

| Tarif | Tür | Değişiklik | Denendi |
|---|---|---|---|
| [Qoder](recipes/qoder/NOTES.md) | electron | Türkçe arayüz (9.628 anahtar + 209 metin) | 0.4.8, Windows 11, 2026-10-25 |
| [Discord](recipes/discord/NOTES.md) | electron | her mesajda çeviri düğmesi | 1.0.9264, Windows 11 |
| [Hacker News](recipes/hacker-news/NOTES.md) | web | başlık ve yorumlarda çeviri düğmesi, karanlık tema | Chrome, Windows 11, 2026-10-25 |

Her tür için şablon: `recipes/_template*`. Yeni tarifler için: [CONTRIBUTING.md](CONTRIBUTING.md).

## Uyarı

Kendi cihazlarında kişisel kullanım içindir. Bazı uygulamaların kullanım koşulları istemci
değişikliğini yasaklar; bunlara uymak senin sorumluluğundadır. appmod hesaplara, ödemelere,
DRM'ye ve hile önleyicilere dokunmaz, ücretli özellik açmaz; tarifler de açamaz. Dil paketleri
uygulamaların arayüz metinlerinin çevirisidir; uygulama adları ve markalar sahiplerine aittir.
Listelenen uygulamalarla ya da REA ile bağlantısı yoktur.

MIT lisanslı. Analiz yönergeleri REA'dan (MIT) uyarlandı; bkz. `THIRD_PARTY_NOTICES.md`.
