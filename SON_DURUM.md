# Son Durum

- **Durum:** 0.2.0. Beş tarif türü: electron, webview (WebView2/CEF), web, android, native. Kurulum `setup` ile ajanlara tek komut; teslim tek masaüstü kısayolu (Windows/macOS/Linux). Yayındaki depo: https://github.com/asujai/appmod (bu sürüm henüz push edilmedi).
- **Son iş:** Tek tık teslim, WebView2/CEF türü, eylem köprüsü köken denetimi, doctor/validate/setup, skill yeniden yazımı, Qoder'a 446 eksik anahtar, HN karanlık tema (2026-10-25 11:45, Claude).
- **Doğrulama:** `npm test` 38/38 (gerçek başsız Chrome uçtan uca dahil), `validate --all` ok; Qoder, Hacker News, WebView2 test penceresi ve masaüstü kısayolu gerçekte denendi; bağımsız incelemenin 10 bulgusu düzeltildi.
- **Sorunlar:** CI ve macOS/Linux elle denenmedi (push bekliyor); işbirlikçi gerçek CEF uygulamasında deneme yok; Discord bu sürümde yeniden başlatılmadı.
- **Sonraki adım:** Push sonrası CI'ın üç işletim sisteminde yeşil olduğunu görmek (Claude).
- **Son commit:** (bu iş commit edilince güncellenecek)
