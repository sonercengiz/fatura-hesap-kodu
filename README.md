# Fatura Hesap Kodu

EDM'den indirilen **e-Fatura XML** dosyalarına hızlıca hesap kodu atamak için tarayıcı uygulaması.
Her fatura, XML'inin içindeki resmî görünüm şablonuyla (XSLT) çizilir; kullanıcı tek tuşla kod verir.
Çıktı, EDM "Gelen Faturalar" Excel'inin düzeninde (20 sütun) bir dosyadır: **Hesap Kodu** sütunu araya eklenmiştir (varsayılan 3. sütun, C).
Mikrokom GMS.NET'teki "Excel içe aktar" düğmesine bu dosya verilir.

Kaynak yalnızca XML'dir: EDM Excel'i ve PDF eşleştirmesi gerekmez (fatura no, tarih, VKN, unvan, tutar doğrudan XML'den gelir).

## Çalıştırma (geliştirme)

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # çekirdek testleri (XML ayrıştırma, çıktı yazma, kurallar, sıralama, öneri, geçiş)
pnpm build      # dist/ klasörüne statik site
```

## Yayın

- **Canlı adres:** https://faturahesapkodu.pages.dev/ (Cloudflare Pages; GitHub deposuna bağlı, `main` dalına her gönderimde otomatik derlenir ve yayınlanır; derleme `pnpm build`, çıktı `dist`, Node 22).
- **Yedek adres:** https://sonercengiz.github.io/fatura-hesap-kodu/ (GitHub Pages; `.github/workflows/pages.yml` testleri çalıştırır, derler, yayınlar).
- Elle yayın gerekirse `dist/` klasörü herhangi bir statik web sunucusuna kopyalanır. Dosyadan (`file://`) açmak çalışmaz; bir web adresi gerekir.
- Gizlilik: fatura verileri hiçbir sunucuya gönderilmez, yalnızca kullanıcının tarayıcısında saklanır. Depodaki örnek veriler sentetik ve anonimdir; gerçek faturalar depoya girmez.

## Kullanım

1. **Yükle** (ya da pencereye sürükle-bırak: dosyalar, ZIP ya da **klasör**, alt klasörler dahil): EDM'den indirilen e-Fatura XML'leri ya da bunları içeren ZIP (klasörlü ve bir düzey iç içe ZIP dahil; XML dışındakiler yok sayılır). Yanlış firmaya yüklendiyse sağ alttaki **taşı** (ya da Ayarlar › Dönem) ile dönemin tamamı ya da seçili faturalar başka firmaya taşınır: atamalar, döneme özel kurallar ve satıcı öneri geçmişi birlikte gider; geri taşımak aynı pencereden yapılır. Dönem yoksa yeni dönem açılır ve faturaların baskın ayına göre adlanır (örn. "Eylül 2026"); dönem açıkken yüklenenler ona eklenir, aynı fatura no atlanır. Okunamayan ya da fatura olmayan dosyalar (irsaliye, yanıt, zarf, bozuk) ve zaten yüklü olanlar "Yükleme sonucu" penceresinde dosya adı ve nedeniyle listelenir. Üst çubuktaki dönem menüsünden **+ Yeni dönem…** ile boş dönem açılır; ad Ayarlar'dan değiştirilir.
2. **İki ana ekran**: **Görsel** (fatura görseli + sağda liste ve panel) ve **Liste** (tam genişlikte yalın tablo; ayın faturalarını zaten tanıyan kullanıcı için). Üst çubuktaki ☰ Liste / ▣ Görsel düğmesiyle geçilir, seçim hatırlanır. Liste görünümünde **Sütunlar ▾** ile gösterilecek sütunlar seçilir (Fatura No, Tarih, Satıcı, VKN, Tip, Tür, Tutar, Matrah, Vergi, Döviz, Kalem, Kaynak, Hesap adı, Dikkat; Hesap Kodu hep görünür), seçim hatırlanır ve çıktıyı etkilemez. Kısayollar, manuel giriş, Boşluk, toplu seçim, filtre, arama, sıralama aynen çalışır; Hesap Kodu hücresine tıklamak elle girişi açar; satıra çift tıklamak o faturayı görsel görünümde açar.
3. **Görüntü**: fatura, XML'deki gömülü XSLT ile tarayıcıda çizilir (resmî görüntüleyiciyle aynı görünüm). Betikler çalışmaz (sandbox). Tarayıcının yerleşik XSLT'si yoksa (Chrome bu özelliği kaldırıyor) libxslt'nin WASM derlemesi `xslt-polyfill` kendiliğinden yüklenir. XSLT'si olmayan fatura sade bir görünümle (başlık + kalemler) gösterilir ve işaretlenir. 🖨 / `Ctrl+P` faturayı yazdırır (PDF olarak kaydetmek için de kullanılır).
4. **Atama**: `Q W E A S D` kısayolları (yalnızca kullanıcının yuvaya yazdığı kodlar; boş yuvaya tıklayıp kod yazılır, kendiliğinden öneri yok), `/` `Enter` veya bir rakam ile manuel giriş, `←` `→` ile gezinme, `Tab` / `Shift+Tab` (ya da `Shift+ok`) ile sonraki / önceki **atanmamış** faturaya atlama, `Backspace` ile kaldırma, `Boşluk` satıcıya önce verilen kodu atar. Listeden kutucuk, Shift+tık, Ctrl+tık, "Bu satıcıyı seç" veya "Görünenleri seç" ile toplu seçim; kod yazıp Enter ile hepsine atanır. Toplu atananlar "toplu" etiketi alır ve doğal gezintide atlanır; `Ctrl+ok` hepsini gezer. "Göster" filtresi listeyi atanmamış / elle / toplu olarak daraltır. `Ctrl+.` hesap kodu listesinde (Ayarlar'dan Excel/CSV/metinle yüklenir) arama penceresi açar; listede olmayan kodlar uyarılır. `Ctrl+Z` / `Ctrl+Y` geri alır / yineler. Sıra seçici: tarih (eskiden yeniye, satıcı bloklu) ya da yükleme sırası.
5. Her atama anında tarayıcıya kaydedilir (ayrı kaydetme yok). `F5` önizle (dikkat satırları sarı) · `F1` Excel üret → `AY YIL FİRMA_ADI FATURA.xlsx (ay = faturaların baskın ayı)`. **Çıktı şablonu** (Ayarlar › Çıktı Excel şablonu ya da önizlemedeki "Şablonu düzenle"): sütunlar eklenir/çıkarılır, sürüklenerek sıralanır, başlıkları değiştirilir; EDM'nin 20 sütununa ek olarak ETTN, matrah, vergi, kalem sayısı, atama kaynağı, hesap adı, firma/dönem adı ve boş sütun eklenebilir; satır sırası (tarih + fatura no / tarih + satıcı bloğu / yükleme) ve sayfa adı seçilir. Varsayılan EDM düzeni + C'de Hesap Kodu; "EDM varsayılanına dön" ile sıfırlanır. Hesap kodu, VKN ve ETTN metin tipinde yazılır; başlık kalın, sütunlar EDM genişliğinde, tutarlar `#,##0.00` biçiminde (EDM dosyasıyla aynı görünüm). XML'de karşılığı olmayan EDM sütunları (Geliş Zamanı, Durum, Zarf No, Hash…) normalde boş kalır; **EDM fatura listesi (Excel) de yüklenirse** bu sütunlar oradan dolar, listede olup XML'i yüklenmemiş faturalar görselsiz kayıt olarak eklenir ve XML'i sonradan gelince tamamlanır.
6. **Kurallar** (otomatik atama): firmaya özel "belirteç → hesap kodu" eşlemeleri. Belirteç satıcının VKN/TCKN'si, unvanında geçen bir metin ya da kalem adında geçen bir metin olabilir; öncelik VKN › unvan › kalem. Kapsam iki türlü: **kalıcı** (firmanın her dönemi) ya da **yalnızca bu dönem** (o ay için; dönem silinince kural da gider). Dönem kuralı kalıcının önüne geçer; penceredeki satırında ve paneldeki ipucunda "kalıcı 770.01 yerine" notu görünür. Boşluk tuşu kural varsa kuralın kodunu atar. Uyan faturalar **XML yüklenir yüklenmez** kodu alır ("kural" etiketi; toplu gibi doğal gezintide atlanır, `Ctrl+ok` ile gezilir, "Göster: Kuralla atanmış" filtresi, `Ctrl+Z` geri alır). Panelde atanmış bir faturada **⚡ Kural yap** o satıcının VKN'si için kuralı önceden doldurur; üst çubuktaki **Kurallar** penceresinde ekleme, açma/kapama, kod düzeltme, silme, "bu döneme uygula" ve her kuralın bu dönemde kaç faturaya uyduğu görülür. Kurallar firmaya bağlıdır, çalışma alanı yedeğine girer (dönem kuralları dahil) ve kalıcılar ayrıca tek başına `.json` olarak dışa/içe aktarılır (başka kullanıcıya verilir; aynı belirteç güncellenir, silinmez). Eşleştirme yerelde düz metin karşılaştırmasıdır; ağ yok, düzenli ifade yok.
7. **🖨 Yazdır** (Ctrl+Shift+P): yazdırma planı. Hangi faturalar (tümü / seçili / listede görünenler), pencere içinde süzgeç (atanmamış / elle / toplu / kural + no, satıcı, VKN, hesap kodu araması) ve her satırda işaret kutusuyla tek tek seçim, sıra kurucu (önce şuna göre: tarih / satıcı / hesap kodu / tutar / fatura no / yükleme + yön; eşit olanlarda ikinci ölçüt + yön; isteğe bağlı "aynı satıcı bir arada"; varsayılan yalnızca tarih + fatura no), altında düz Türkçe özet ve "En üstte / En altta" bilgisi, sürükleyerek elle düzenleme; her fatura yeni sayfada, üstte bilgi şeridi (sıra · fatura no · tarih · satıcı · tutar · hesap kodu), isteğe bağlı başta özet tablo; sağda fareyle üzerine gelinen faturanın küçük önizlemesi. Faturalar resmî görünümleriyle, sayfa genişliğine ölçeklenerek tarayıcının yazdırma penceresine gider; "PDF olarak kaydet" tek dosya üretir. 60 faturadan fazlası için **parçalı yazdırma** kendiliğinden önerilir (parça boyutu 25/50/100): tek Yazdır ile parçalar sırayla hazırlanır ve her biri için yazdırma penceresi açılır, numaralar kesintisiz devam eder, üstteki şeritten durdurulabilir. Ctrl+P yalnızca seçili faturayı yazdırır.
8. Sağ alttaki **çıkar** yanlış yüklenen faturayı dönemden çıkarır (seçim varsa seçilenleri).
9. **Rehber** düğmesi uygulama içi kullanım rehberini açar. **Ayarlar (⚙)**, sekmeli: Firma (ad, kısayollar, hesap kodu listesi ve kurallar pencereleri), Dönem (ad, taşı, sil), Çıktı (şablon), Görünüm (ana ekran, açılış konumu, tema), Yedek, Klavye.

Veriler tarayıcının kendi deposunda (IndexedDB) tutulur: dönemler, faturalar (XSLT'si ayrılmış XML; XSLT'ler özetle tekilleştirilir), atamalar ve satıcı bazlı atama geçmişi.
**Ayarlar → Dışa aktar** bunları (XML'ler hariç) tek `.json` dosyasına yazar; başka bilgisayarda **İçe aktar** mevcut veriyle birleştirir, silmez. XML'siz gelen faturalar kart olarak görünür; XML'leri yeniden yüklenince görsel gelir, atamalar korunur.
Aynı Fatura No başka bir dönemde daha önce atanmışsa kod otomatik taşınır. Eski (Excel tabanlı) dönemler ilk açılışta fatura kayıtlarına dönüştürülür (görselsiz).

## Yapı

```
src/core/      DOM'dan bağımsız çekirdek (test edilir)
  xml/         parseUbl.ts (UBL-TR XML → başlık alanları, gömülü XSLT ayrımı, kalemler, baskın ay)
  excel/       edm.ts (EDM başlıkları), template.ts (çıktı şablonu: alanlar, varsayılan, normalize), writeOutput.ts (çalışma kitabı, dosya adı)
  suggest/     engine.ts (sık kullanılan öneri puanlaması, kod tamamlama)
  rules.ts     otomatik atama kuralları (eşleştirme, öncelik, doğrulama, kural dosyası)
  printSort.ts yazdırma sırası kurucu (ölçüt + yön + ikincil + satıcı gruplama) ve düz Türkçe açıklama
  legacy.ts    eski Excel partilerinin dönüştürülmesi (v6 geçişi, eski yedekler)
src/render/    xslt.ts (yerleşik XSLTProcessor / xslt-polyfill, önbellek), fallback.ts (XSLT'siz sade görünüm)
src/storage/   Dexie (IndexedDB) şeması: batches, invoices, xslts, assignments, rules, firms, firmHistory, firmAccounts
src/ui/        Preact arayüzü; state.ts tüm eylemleri içerir; InvoiceView.tsx sandbox iframe; ListView.tsx yalın liste; RulesModal.tsx kurallar; PrintModal.tsx + PrintRoot.tsx yazdırma planı
test/          Vitest testleri (fixtures/ sentetik UBL XML'ler) ve Playwright betikleri
```
