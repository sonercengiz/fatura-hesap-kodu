# Fatura Hesap Kodu

EDM'den indirilen e-Fatura listesine (Excel) hızlıca hesap kodu atamak için tarayıcı uygulaması.
Çıktı, aynı Excel'in **Hesap Kodu** sütunu eklenmiş halidir (varsayılan 3. sütun, araya eklenir).
Mikrokom GMS.NET'teki "Excel içe aktar" düğmesine bu dosya verilir. Parti silme Ayarlar penceresindedir.

## Çalıştırma (geliştirme)

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # çekirdek testleri (Excel okuma/yazma, eşleştirme, öneri)
pnpm build      # dist/ klasörüne statik site
```

## Yayınlama (kullanıcılar tarayıcıdan açar, kurulum yok)

`pnpm build` sonrası oluşan `dist/` klasörü statik bir sitedir. Seçenekler:

- **Cloudflare Pages / Netlify / Vercel:** `dist/` klasörünü sürükle-bırak ile yükleyin. Ücretsiz bir adres verir; güncellemede tekrar yükleyin, herkes anında yeni sürümü alır.
- **GitHub Pages:** `dist/` içeriğini `gh-pages` dalına koyun.
- **Ofis içi:** `dist/` klasörünü herhangi bir web sunucusuna (IIS, nginx) kopyalayın. `file://` ile doğrudan açmak çalışmaz; HTTP gerekir.

Uygulama `base: './'` ile derlendiği için alt klasörde de çalışır.

## Kullanım

1. **Excel yükle**: EDM'den indirilen fatura listesi (`Fatura No` sütunu zorunlu). Sürükle-bırak da olur.
2. **PDF ekle / Klasör ekle**: Faturaların PDF'leri. Dosya adı ya da PDF metnindeki *Fatura No* ile Excel satırına bağlanır. Birleştirilmiş (çok faturalı) PDF'ler sayfa bazında bölünür. Eşleşmeyen dosyalar sağ altta listelenir; **bağla** ile elle bir faturaya bağlanır (kalıcıdır, PDF yeniden eklense de korunur).
3. **Atama**: `Q W E A S D` kısayolları (sabitlenmemişse sık kullanılanlarla dolar), `/` `Enter` veya bir rakam ile manuel giriş, `←` `→` ile gezinme, `Backspace` ile kaldırma. Listeden kutucuk, Shift+tık, Ctrl+tık, "Bu satıcıyı seç" veya "Görünenleri seç" ile toplu seçim yapılır; kod yazıp Enter ile (ya da kısayol düğmesiyle) hepsine aynı anda atanır. Toplu atananlar "toplu" etiketi alır ve ok tuşlarıyla doğal gezintide atlanır; `Ctrl+ok` hepsini gezer. "Göster" filtresi listeyi ve gezintiyi atanmamış / elle / toplu olarak daraltır. Atanan satırlar renklenir (kısayol kodu → yuva rengi, diğerleri sabit gri). `Ctrl+.` kullanıcının kendi hesap kodu listesinde (kod + isim; Ayarlar'dan Excel/CSV veya metinle yüklenir) arama penceresi açar, Enter ile atar; listede olmayan kodlar önizlemede uyarılır. `Ctrl+Z` / `Ctrl+Y` tekil ve toplu atamaları geri alır / yineler. Sağ paneldeki sıra seçici listeyi Excel sırasında ya da tarihe göre (eskiden yeniye; aynı gün içinde satıcı blokları, blok içinde fatura no) gösterir; çıktı sırası değişmez.
4. `F2` kaydet · `F5` önizle (dikkat satırları sarı) · `F1` Excel üret → `GÜN AY YIL FİRMA_ADI FATURA.xlsx`.
5. **Rehber** düğmesi uygulama içi görselli kullanım rehberini açar (ilk açılışta kendiliğinden gelir). Görseller `public/guide/` altındadır; arayüz değişirse `guide-shots` betiğiyle yeniden üretilir.
6. **Ayarlar (⚙)**: firma adı, Hesap Kodu sütun konumu ve başlığı, sabit kısayollar, PDF başlangıç konumu, koyu tema (gri tonlu; üst çubuktaki ☾/☀ düğmesiyle de değişir).

Veriler tarayıcının kendi deposunda (IndexedDB) tutulur: partiler, atamalar, PDF'ler, elle bağlantılar ve satıcı bazlı atama geçmişi.
**Ayarlar → Dışa aktar** tüm bunları (PDF'ler hariç) tek `.json` dosyasına yazar; başka bilgisayarda **İçe aktar** mevcut veriyle birleştirir, silmez. Aynı PDF'ler orada da eklenince elle bağlantılar ad+boyut üzerinden geri gelir.
Aynı Fatura No yeni bir Excel'de tekrar gelirse önceki atama otomatik taşınır.

## Yapı

```
src/core/      DOM'dan bağımsız çekirdek (test edilir)
  excel/       readEdm.ts (EDM Excel okuma), writeOutput.ts (Hesap Kodu sütunu ekleme, dosya adı)
  match/       parse.ts (Fatura No / ETTN deseni), matcher.ts (PDF → satır eşleştirme)
  suggest/     engine.ts (sık kullanılan öneri puanlaması, kod tamamlama)
src/pdf/       pdf.js sarmalayıcı (metin çıkarma, önbellek)
src/storage/   Dexie (IndexedDB) şeması
src/ui/        Preact arayüzü; state.ts tüm eylemleri içerir
test/          Vitest testleri; fixtures/edm-ornek.xlsx gerçek EDM çıktısı
```
