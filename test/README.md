# Testler

- `pnpm test` — birim testleri (Vitest): Excel okuma/yazma, eşleştirme, öneri, sıralama, hesap listesi, veritabanı geçişi.
- `test/*-e2e.mjs` — tarayıcı testleri (Playwright + Chrome). Çalıştırmak için `pnpm dev` açıkken (varsayılan port 5179) ve `playwright` kurulu bir dizinden: `node test/full-run-e2e.mjs`. Betikler demo veri yollarını dosya başında tanımlar; gerekirse güncelleyin.
- `test/guide-shots.mjs` — rehber görsellerini (`public/guide/*.png`) anonim demo veriyle yeniden üretir.
