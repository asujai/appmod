# İşlem Geçmişi

## [2026-10-22 15:01] - appmod ilk sürüm: standart, skill ve Qoder tarifi

* **Model:** Claude
* **Etkilenen Dosyalar:** `[YENİ]` bin/appmod.mjs, core/{cdp,recipe,launcher,placeholders}.mjs, runtime/runtime.js, skills/appmod/SKILL.md + references/{electron,language,features,new-app}.md, docs/{recipe-format,feature-api}.md, recipes/_template/*, recipes/qoder/*, tests/*, README.md, README.tr.md, AGENTS.md, CLAUDE.md, LICENSE, package.json, .gitignore
* **Yapılan İşlem:** QoderTurkce başlatıcısı genelleştirildi: tarif (recipe) biçimi, CDP başlatıcı, i18next yakalayıcı (override/add), birebir metin değiştirme, özellik API'si (addButton/observe/addStyle) ve sayfadan yerel komut çalıştıran `actions` köprüsü (Runtime.addBinding). CLI: list/new/inspect/check/launch/shortcut. Ajan skill'i ve başvuru belgeleri yazıldı. Qoder ilk tarif olarak taşındı (9.182 anahtar + 209 metin).
* **Doğrulama:** `npm test` 7/7. Gerçek Qoder 0.4.8: inspect i18next'i buldu (en 9.182, zh 9.202 anahtar); check ok; launch ile arayüz Türkçe açıldı, appmod.errors boş; action köprüsü gidip geldi (bilinmeyen eylem reddi).
* **Bilinen Sorunlar:** `add` modu ve özellik örneği gerçek uygulamada denenmedi; macOS/Linux denenmedi; shortcut komutu çalıştırılmadı (mevcut "Qoder Türkçe" kısayolu duruyor).
* **Sonraki Öneri:** İkinci bir uygulamada (Türkçesi olmayan bir Electron uygulaması) uçtan uca deneme; sonra GitHub'a yayın.
