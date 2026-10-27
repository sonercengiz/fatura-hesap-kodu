# Testler

- `pnpm test` — birim testleri (Vitest): UBL XML ayrıştırma (jsdom), EDM düzeninde çıktı yazma, sıralama, öneri, hesap listesi, veritabanı geçişi (v3 → v6). Fikstürler `fixtures/` altında sentetik ve anonimdir.
- `test/*-e2e.mjs` — tarayıcı testleri (Playwright + Chrome). `pnpm dev --port 5179` açıkken ve `playwright` kurulu bir dizinden: `node test/full-run-e2e.mjs`. Gerçek e-Fatura XML'leri depoya girmez; betikler `XML_DIR` ortam değişkeniyle (ya da dosya başındaki varsayılan yolla) yerel bir klasörden okur.
- `test/full-run-e2e.mjs` ayrıca yerleşik XSLT olmayan tarayıcıyı taklit etmek için `delete window.XSLTProcessor` ile çalıştırılabilir (polyfill yolu); bkz. betik başı.
- `test/demo/make-demo.mjs <klasör>` — hayali firma seti (16 XML, 7 satıcı, kendi renkli şablonları; irsaliye ve bozuk dosya; ZIP; EDM listesi; kural dosyası; hesap kodları). Gerçek veri içermez.
- `test/guide-shots.mjs` — rehber görsellerini (`public/guide/*.png`) demo veriyle yeniden üretir: `DEMO_DIR=<klasör> OUT_DIR=public/guide node test/guide-shots.mjs` (uygulama 5179'da açıkken). Arayüz değişince ilgili bölümün görseli bu betikle yenilenir.
