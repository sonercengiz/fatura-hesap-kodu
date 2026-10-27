import { K, Tip, Warn, Try, T, Shot, Flow } from './parts';

export interface Section { id: string; group: string; short: string; title: string; body: preact.ComponentChildren }

/**
 * Rehber bölümleri. Her bölüm bağımsızdır: bir özellik değişince yalnızca o bölüm ve görseli yenilenir.
 * Kural: bir görsel + numaralı tek satırlık notlar; uzun paragraf yok; terimler <T> ile açıklanır.
 */
export const sections: Section[] = [
  {
    id: 'baslangic', group: 'Başlangıç', short: '3 adımda başla', title: '3 adımda başlangıç',
    body: (
      <>
        <p>Uygulama tek şey yapar: her faturaya bir <T t="hesap kodu" /> verirsiniz, sonunda GMS'e vereceğiniz Excel'i indirirsiniz.</p>
        <Flow steps={['Yükle (XML)', 'Kod ver (Q–D tuşları)', <><K k="F1" /> Excel üret</>]} />
        <Shot src="01-karsilama.png" alt="İlk ekran" notes={[
          <><b>Yükle</b>: EDM'den indirdiğiniz fatura <T t="xml">XML</T>'lerini, <T t="zip">ZIP</T>'i ya da klasörü seçin.</>,
          <>Ya da dosyaları bu alana <b>sürükleyip bırakın</b>. Klasör de bırakabilirsiniz.</>,
        ]} />
        <Tip>Kurulum yok, internet yalnızca açılışta gerekir, veriler bilgisayarınızda kalır. Yanlış bir şey yapmaktan korkmayın: her atama <K k="Ctrl+Z" /> ile geri alınır, hiçbir dosyanız değişmez.</Tip>
        <Try steps={[<>EDM'den bir ayın faturalarını XML olarak indirin (ZIP de olur).</>, <>Dosyaları pencereye bırakın; fatura görüntüsü solda belirir.</>, <>Alttaki <b>Q</b> yuvasına tıklayıp bir kod yazın, sonra <K k="Q" />'ya basın. Kart renklendi mi? Devam edin.</>]} />
      </>
    ),
  },
  {
    id: 'ekran', group: 'Başlangıç', short: 'Ekranı tanıyın', title: 'Ekranın dört bölgesi',
    body: (
      <>
        <Shot src="02-ekran.png" alt="Görsel görünüm" notes={[
          <><b>Üst çubuk</b>: <T t="firma" />, <T t="dönem" />, yükleme ve çıktı düğmeleri.</>,
          <><b>Fatura</b>: XML'in içindeki resmî şablonla çizilir; EDM'deki PDF ile aynı görünür. Zemin rengi, verilen kodun yuva rengidir.</>,
          <><b>Sağ panel</b>: seçili faturanın bilgileri, verilen kod, arama ve liste.</>,
          <><b>Alt çubuk</b>: altı <T t="kısayol" /> yuvası, <T t="durum kartı" />, <T t="ilerleme kartı" />, elle giriş.</>,
        ]} />
        <Shot src="03-ustcubuk.png" alt="Üst çubuk" notes={[
          <>Firma menüsü; en altta <b>+ Yeni firma…</b></>,
          <>Dönem menüsü; <b>+ Yeni dönem…</b></>,
          <><b>Yükle</b>: XML, ZIP, klasör, EDM listesi.</>,
          <>Kaç fatura kod aldı. Her atama anında kaydedilir.</>,
          <><b>Liste / Görsel</b>: iki ana ekran arasında geçiş.</>,
          <><b>Önizle</b> (<K k="F5" />): Excel'e yazılacak tablo.</>,
          <><b>Excel üret</b> (<K k="F1" />): dosyayı indirir.</>,
          <><b>Yazdır</b>: faturaları istediğiniz sırada basar ya da PDF yapar.</>,
          <><b>Kurallar</b>: satıcıya göre kendiliğinden kod.</>,
          <>Bu rehber.</>,
          <>Koyu / açık tema.</>,
          <>Ayarlar.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'yukle', group: 'Başlangıç', short: 'Fatura yükleme', title: 'Faturaları yükleyin',
    body: (
      <>
        <p>Kabul edilen dosyalar: tek tek <T t="xml">XML</T>, <T t="zip">ZIP</T> (iç içe klasörlü olsa da), klasör (sürükleyerek) ve isteğe bağlı <T t="edm listesi" /> (Excel).</p>
        <p>İlk yüklemede bir <T t="dönem" /> kendiliğinden açılır ve faturaların ayına göre adlanır. Dönem açıkken yüklenen dosyalar o döneme eklenir; aynı fatura iki kez gelirse ikincisi atlanır.</p>
        <Shot src="04-yukleme-sonucu.png" alt="Yükleme sonucu" w="mid" notes={[
          <>Fatura olmayan dosyalar (irsaliye, yanıt, zarf) ve bozuk dosyalar burada nedenleriyle listelenir. Bu normaldir; faturalar yüklenmiştir.</>,
        ]} />
        <Tip>EDM listesini (Gelen Faturalar Excel'i) de yüklerseniz çıktı dosyanız EDM'nin verdiğiyle birebir aynı olur; listede olup XML'i olmayan faturalar da görselsiz olarak eklenir.</Tip>
        <Warn>Yanlış firmaya yüklediyseniz silmeyin: sağ alttaki <b>taşı</b> düğmesi dönemi ya da seçili faturaları atamalarıyla birlikte doğru firmaya götürür (bkz. Yedek ve taşıma).</Warn>
      </>
    ),
  },
  {
    id: 'firma', group: 'Başlangıç', short: 'Firma ve dönem', title: 'Firma ve dönem',
    body: (
      <>
        <p>Her <T t="firma" />nın kendi kısayolları, kuralları, hesap kodu listesi ve dönemleri vardır. Önce doğru firmayı seçin, sonra yükleyin.</p>
        <Shot src="05-firma-donem.png" alt="Firma ve dönem menüleri" w="mid" notes={[
          <>Firma menüsü. İlk kurulumda "Firma 1" adını <b>Ayarlar › Firma</b>'dan değiştirin.</>,
          <>Dönem menüsü: eski aylara buradan dönersiniz.</>,
        ]} />
        <Shot src="05b-yeni-firma.png" alt="Yeni firma penceresi" w="narrow" notes={[<>Yeni firma ya da dönem eklerken küçük bir pencere adı sorar; <K k="Enter" /> onaylar, <K k="Esc" /> vazgeçer.</>]} />
        <Shot src="18b-donem.png" alt="Ayarlar › Dönem" w="mid" notes={[<>Dönemin adı burada değiştirilir, başka firmaya taşınır ya da silinir.</>]} />
      </>
    ),
  },
  {
    id: 'panel', group: 'Kod verme', short: 'Sağ panel', title: 'Sağ panel: bilgiler ve liste',
    body: (
      <>
        <Shot src="06-panel.png" alt="Sağ panel" w="narrow" notes={[
          <>Seçili faturanın satıcısı, numarası, tarihi, <T t="vkn">VKN</T>, tipi ve tutarları.</>,
          <>Verilen kod. Boşsa "—".</>,
          <>Sıra ve süzgeç (tümü / atanmamış / elle / toplu / kural) ve <b>☑ Seç</b> (<T t="toplu atama" />).</>,
          <>Arama: numara, satıcı, tutar (<K k="Ctrl+F" />).</>,
          <>Liste: kod alan satır yuvanın rengini alır. Tıklayınca o fatura açılır.</>,
          <>Fatura sayısı; yanlış yüklenen faturayı <b>çıkar</b>, başka firmaya <b>taşı</b>.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'kodver', group: 'Kod verme', short: 'Tek tuşla kod', title: 'Tek tuşla kod verin',
    body: (
      <>
        <Shot src="07-kisayol.png" alt="Alt çubuk" notes={[
          <>Altı <T t="kısayol" /> yuvası: Q W E A S D. Sık kullandığınız kodları buraya yazın.</>,
          <><T t="durum kartı">Durum kartı</T>: bu fatura kod aldı mı?</>,
          <><T t="ilerleme kartı">İlerleme</T>: kaç fatura kaldı.</>,
          <>Elle giriş: <K k="/" />, <K k="Enter" /> ya da doğrudan bir rakam.</>,
        ]} />
        <Shot src="07a-yuva-yaz.png" alt="Yuvaya kod yazma" notes={[<>Boş yuvaya tıklayın, kodu yazın, <K k="Enter" />. Yuvalar yalnızca sizin yazdığınız kodları taşır; kendiliğinden değişmez.</>]} />
        <Shot src="07b-atama.png" alt="Q tuşuyla atama: önce ve sonra" notes={[<>Tuşa basınca kod verilir; kart ve listedeki satır renklenir, fatura ekranda kalır. <K k="→" /> ya da <K k="Tab" /> ile geçersiniz. Hızlı çalışmak isterseniz <b>Ayarlar › Görünüm › Kod verdikten sonra</b> bölümünden kendiliğinden geçişi açın. Yanlışsa <K k="Ctrl+Z" />.</>]} />
        <Shot src="08-manuel.png" alt="Elle giriş" notes={[
          <>Yuvada olmayan bir kod için <K k="/" /> basıp yazın; <K k="Enter" /> verir, <K k="Esc" /> vazgeçer.</>,
          <>Daha önce kullandığınız kodlar yazdıkça önerilir; <K k="Tab" /> ilkini alır.</>,
        ]} />
        <Shot src="08b-ipucu.png" alt="Satıcı ipucu" w="narrow" notes={[<>Aynı satıcıya daha önce verdiğiniz kod hatırlatılır; <K k="Boşluk" /> ile tek tuşla verilir.</>]} />
        <Shot src="09-ilerleme.png" alt="İlerleme kartı" notes={[<><K k="Tab" /> sıradaki <b>kod almamış</b> faturaya atlar; aradakileri gezmezsiniz. <K k="Shift+Tab" /> geri. (<T t="tab">ayrıntı</T>)</>]} />
        <Try steps={[<>Q yuvasına en sık kullandığınız kodu yazın.</>, <>Listede ilk faturaya gidin (<K k="Home" />), <K k="Q" />'ya basın, sonra <K k="Tab" />.</>, <>Bir faturayı elle verin: <K k="/" />, kod, <K k="Enter" />.</>]} />
      </>
    ),
  },
  {
    id: 'liste', group: 'Kod verme', short: 'Liste görünümü', title: 'Liste görünümü: yalnızca tablo',
    body: (
      <>
        <p>Ayın faturalarını zaten tanıyorsanız görüntüye gerek yok. Üst çubuktaki <b>☰ Liste</b> tam genişlikte tabloya geçer; bütün tuşlar aynı çalışır.</p>
        <Shot src="10-liste.png" alt="Liste görünümü" notes={[
          <>Arama, sıra, süzgeç, seçim ve <b>Sütunlar</b>.</>,
          <>Gösterilecek sütunları seçin; seçim hatırlanır, Excel çıktısını etkilemez.</>,
          <>Seçili satır. Çift tıklayınca o fatura görsel görünümde açılır.</>,
          <>Hesap Kodu hücresine tıklamak elle girişi açar.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'toplu', group: 'Kod verme', short: 'Toplu atama', title: 'Birçok faturaya tek seferde kod',
    body: (
      <>
        <Shot src="11-toplu.png" alt="Toplu seçim" notes={[
          <><b>☑ Seç</b> seçim yardımcılarını açar.</>,
          <><b>Bu satıcıyı seç</b> ya da <b>Görünenleri seç</b>; kodu yazıp <K k="Enter" /> hepsine verir. Kısayol düğmesine tıklamak da olur.</>,
          <>Seçili satırlar. <K k="Shift" />+tık aralık, <K k="Ctrl" />+tık tekil seçer; <K k="Esc" /> bırakır.</>,
        ]} />
        <Tip>Toplu verilen kodlar "toplu" etiketi alır ve ok tuşlarıyla gezerken atlanır; kontrol etmek isterseniz süzgeçten "Toplu atanmış"ı seçin ya da <K k="Ctrl+→" /> ile gezin.</Tip>
      </>
    ),
  },
  {
    id: 'hesaplistesi', group: 'Kod verme', short: 'Hesap kodu listesi', title: 'Hesap kodu listesi ve isimle arama',
    body: (
      <>
        <p>GMS'teki hesap planınızı (kod + isim) bir kez yüklerseniz kodları isimle ararsınız ve yanlış kodlar uyarılır. <b>Ayarlar › Firma › Hesap kodu listesi</b>.</p>
        <Shot src="12-hesap-listesi.png" alt="Hesap kodu listesi" w="mid" notes={[
          <>Excel/CSV'den yükleyin (ilk sütun kod, ikinci isim)…</>,
          <>…ya da her satıra "kod isim" yazıp ekleyin.</>,
          <>İsimler burada düzeltilir.</>,
        ]} />
        <Shot src="12b-ctrl-nokta.png" alt="Ctrl+. ile arama" w="mid" notes={[
          <><K k="Ctrl+." /> açar; kod ya da isim yazın.</>,
          <>Ok tuşlarıyla seçin, <K k="Enter" /> verir. Seçim varsa hepsine verir.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'kurallar', group: 'Kod verme', short: 'Kurallar', title: 'Kurallar: tekrar eden satıcılara kendiliğinden kod',
    body: (
      <>
        <p>Bir satıcı hep aynı kodu alıyorsa bunu bir kez söyleyin: sonraki aylarda o satıcının faturaları yüklenir yüklenmez kodu alır. Bu bir <T t="kural" />dır. Kurallarınızı bir kez yazdıktan sonra dosyaları bırakmanız yeter; kalan işi uygulama yapar.</p>
        <Shot src="13-kural-yap.png" alt="Kural yap düğmesi" w="narrow" notes={[<>Kod verdiğiniz faturada <b>⚡ Kural yap</b>: satıcının VKN'si ve kodu hazır gelir; <K k="Enter" /> kaydeder ve bu dönemdeki uyan faturalara hemen uygular.</>]} />
        <p>Tek bilgi her zaman yetmez: aynı satıcıdan farklı kodlara giden alışlar olabilir. Bu yüzden bir kural <b>1–4 <T t="koşul" /></b>dan oluşur ve hepsi birlikte tutmalıdır. Koşul türleri: satıcı VKN/TCKN, unvanda geçen metin, kalem adında geçen metin, KDV oranı, kalem miktarı aralığı, fatura tutarı aralığı, fatura tipi.</p>
        <Shot src="13-kurallar.png" alt="Kurallar penceresi" notes={[
          <><T t="kalıcı kural">Kalıcı</T>: her ay geçerli. <T t="dönem kuralı">Yalnızca bu dönem</T>: o ay için; kalıcının önüne geçer.</>,
          <>Koşul satırları: "Eğer … ve …". Türü seçin, değeri yazın. Aralıklarda alt ya da üst sınırı boş bırakabilirsiniz (örn. "≥ 1000").</>,
          <><b>+ Koşul ekle</b>: en çok dört koşul.</>,
          <>"o zaman hesap kodu" ve <b>Kaydet ve uygula</b>; <K k="Enter" /> da kaydeder.</>,
          <>Canlı önizleme: bu dönemde kaç faturaya uyduğu, ilk birkaçı ve başka bir kuralın önde kaldığı durumlar. Kaydetmeden önce kontrol edin.</>,
          <>Kayıtlı kurallar koşul rozetleriyle; kaç faturaya uyduğu görünür. Kutucukla kapatılır, kod burada düzeltilir, ✎ ile koşullar değiştirilir.</>,
          <>Dönem kuralı bir kalıcı kuralın yerine geçiyorsa sessizce burada yazar.</>,
          <>Kuralları dosya olarak dışa aktarıp başka kullanıcıya verebilirsiniz.</>,
        ]} />
        <p>Örnek: Lezzet Gıda'dan alınan <b>30'lu yumurta</b> ikramdır (770.09), <b>3000 yumurta</b> ise satış için alınmıştır (153). İki kural: kalem "yumurta" + miktar ≤ 999 → 770.09; kalem "yumurta" + miktar ≥ 1000 → 153. Miktar, aynı kuraldaki kalem adıyla aynı kalemde aranır. Benzer biçimde "unvan ABC Kırtasiye + kalem klasör → 543" ya da "KDV %10 → 153" yazılabilir.</p>
        <p><b>Birden çok kural uyarsa</b> hangisi kazanır? Önce döneme özel olan, sonra daha çok koşullu (daha belirgin) olan, sonra VKN › unvan › kalem › tip › KDV › miktar › tutar sırası, sonra en son güncellenen. Yani "VKN 123… → 770" ile "VKN 123… + kalem klasör → 543" birlikte varsa klasörlü faturalar 543, diğerleri 770 alır.</p>
        <Tip>Kuralla verilen kodlar "kural" etiketi alır ve gezerken atlanır. Bir faturada kural başka bir şey diyorsa panelde "Kural diyor ki" ipucu çıkar; <K k="Boşluk" /> kuralın kodunu verir. Bir kuralın kodunu ya da koşullarını değiştirirseniz bu dönemde o kuralla verilmiş kodlar da düzelir (Ctrl+Z geri alır).</Tip>
      </>
    ),
  },
  {
    id: 'kontrol', group: 'Çıktı', short: 'Kontrol ve Excel', title: 'Kontrol edin, Excel üretin',
    body: (
      <>
        <Shot src="14-onizleme.png" alt="Önizleme" notes={[
          <>Dikkat sayacı: kod almamış, listede olmayan kod, tevkifat/iade.</>,
          <>Hesap Kodu sütunu (varsayılan C). Diğer sütunlar EDM listesiyle aynı düzendedir.</>,
          <>Sarı satır = kod yok. Çift tıklayınca o faturaya gidersiniz.</>,
          <>Sütunları GMS'inize göre düzenlemek için <b>Şablonu düzenle</b>.</>,
        ]} />
        <p><K k="F1" /> dosyayı indirir: <code>AY YIL FİRMA_ADI FATURA.xlsx</code>. Ay, faturaların ayıdır. GMS'te "Excel içe aktar" ile açılır.</p>
        <Shot src="15-sablon.png" alt="Çıktı şablonu" notes={[
          <>Hesap Kodu sütunu; sürükleyerek yerini değiştirin, başlığını yazın.</>,
          <>Sütun ekleyin: ETTN, matrah, vergi, hesap adı, boş sütun…</>,
          <>Satır sırası ve sayfa adı.</>,
          <>Canlı önizleme.</>,
          <>Karıştıysa <b>EDM varsayılanına dön</b>.</>,
        ]} />
        <Warn>İlk kez GMS'e verirken küçük bir dönemle deneyin. GMS bazı sütunları bekliyorsa <T t="edm listesi" />ni de yükleyin; çıktı EDM'nin dosyasıyla birebir olur.</Warn>
      </>
    ),
  },
  {
    id: 'yazdir', group: 'Çıktı', short: 'Yazdırma', title: 'Faturaları yazdırın ya da PDF yapın',
    body: (
      <>
        <Shot src="16-yazdir.png" alt="Yazdırma planı" notes={[
          <>Hangi faturalar: tümü, seçili, listede görünenler.</>,
          <>Süzgeç: atanma durumu ve arama.</>,
          <>Sıra: önce tarih mi satıcı mı, yön; altındaki cümle sırayı düz Türkçe anlatır ve en üstte/altta hangi faturanın olacağını söyler.</>,
          <>Sayfa: her fatura yeni sayfada, üstte bilgi şeridi, başta özet.</>,
          <>Basılacak liste; sürükleyerek sıralayın, kutucukla çıkarın.</>,
          <>Üzerine geldiğiniz faturanın önizlemesi.</>,
          <><b>Yazdır</b> tarayıcının yazdırma penceresini açar; orada "PDF olarak kaydet" seçince tek dosya olur.</>,
        ]} />
        <Tip>Çok fatura varsa parçalı yazdırma kendiliğinden önerilir; parçalar sırayla gelir, numaralar kesintisiz devam eder. <K k="Ctrl+P" /> yalnızca açık faturayı yazdırır.</Tip>
      </>
    ),
  },
  {
    id: 'yedek', group: 'Çıktı', short: 'Yedek ve taşıma', title: 'Yedek, depolama ve taşıma',
    body: (
      <>
        <p>Veriler yalnızca bu bilgisayardaki tarayıcıda durur. Haftada bir <T t="yedek" /> alın; sarı şerit hatırlatır.</p>
        <Shot src="18-yedek.png" alt="Ayarlar › Yedek" notes={[
          <><b>Dışa aktar</b>: her şey tek .json dosyasında (XML'ler hariç).</>,
          <><b>İçe aktar</b>: başka bilgisayarda mevcut veriyle birleştirir, silmez.</>,
          <>Depolama: ne kadar yer kullanıldığı; eski dönemlerin görsellerini <T t="arşivle">arşivleyip</T> yer açın.</>,
        ]} />
        <Shot src="19-tasi.png" alt="Başka firmaya taşı" w="mid" notes={[<><T t="taşı">Taşı</T>: yanlış firmaya yüklenen dönemi ya da seçili faturaları atamalarıyla doğru firmaya götürür. Geri taşımak aynı penceredendir.</>]} />
      </>
    ),
  },
  {
    id: 'ayarlar', group: 'Çıktı', short: 'Ayarlar ve tema', title: 'Ayarlar ve görünüm',
    body: (
      <>
        <Shot src="17-ayarlar.png" alt="Ayarlar" notes={[
          <>Sekmeler: Firma, Dönem, Çıktı, Görünüm, Yedek, Klavye.</>,
          <>Kısayol kodları burada da yazılır.</>,
          <>Hesap kodu listesi ve kurallar kendi pencerelerinde.</>,
        ]} />
        <Shot src="21-koyu.png" alt="Koyu tema" notes={[<>Üst çubuktaki ☾/☀ ile koyu tema. Gri tonludur, fatura görüntüsü hafifçe kısılır.</>]} />
        <Shot src="20-tamamlandi.png" alt="Tamamlandı" notes={[<>Bütün faturalar kod alınca ilerleme kartı yeşile döner ve sıradaki adımı söyler: <K k="F1" /> Excel üret.</>]} />
      </>
    ),
  },
];

export const keys: [string, string][] = [
  ['←  →', 'Önceki / sonraki fatura'],
  ['Tab  Shift+Tab', 'Sonraki / önceki kod almamış fatura'],
  ['Ctrl+→', 'Toplu ve kuralla atananlar dahil gez'],
  ['Q W E A S D', 'Yuvadaki kodu ver (ayara göre sıradakine geç)'],
  ['Boşluk', 'Kuralın ya da satıcıya önce verilen kodu ver'],
  ['/  Enter  0–9', 'Elle kod girişi'],
  ['Ctrl+.', 'Hesap kodu listesinde ara ve ver'],
  ['Backspace', 'Kodu kaldır'],
  ['Ctrl+Z  Ctrl+Y', 'Geri al / yinele'],
  ['Shift+tık  Ctrl+tık', 'Listede aralık / tekil seçim'],
  ['Esc', 'Pencereyi kapat, seçimi bırak'],
  ['Ctrl+F', 'Ara'],
  ['F5', 'Önizleme'],
  ['F1', 'Excel üret'],
  ['Ctrl+P  Ctrl+Shift+P', 'Açık faturayı yazdır / yazdırma planı'],
];

export const troubles: [string, string][] = [
  ['Yükledim, bazı dosyalar "okunamadı"', 'Fatura olmayan XML\'ler (irsaliye, yanıt, zarf) normaldir. Bozuk görünen bir fatura varsa EDM\'den yeniden indirin.'],
  ['Fatura görüntüsü yerine kart görünüyor', 'O faturanın XML\'i yok (EDM listesinden ya da arşivden geldi). XML\'ini yükleyin, görüntü gelir; atama korunur.'],
  ['Q tuşu "yuva boş" diyor', 'Alt çubukta o yuvaya tıklayıp bir kod yazın. Yuvalar kendiliğinden dolmaz.'],
  ['Kod verdim ama listede göremiyorum', 'Süzgeç "Atanmamış" olabilir; "Tümü" yapın. Toplu/kural atananlar gezerken atlanır; Ctrl+ok ile görülür.'],
  ['Yanlış firmaya yükledim', 'Sağ alttaki "taşı" ile dönemi ya da seçili faturaları doğru firmaya taşıyın; atamalar gider.'],
  ['GMS dosyayı almadı', 'Ayarlar › Çıktı › Şablon ile sütun ve başlıkları GMS\'in beklediği gibi yapın. Emin olmak için EDM listesini de yükleyin; çıktı EDM dosyasıyla birebir olur.'],
  ['"Depolama alanı doldu" uyarısı', 'Ayarlar › Yedek › Depolama\'dan eski dönemlerin görsellerini arşivleyin ya da gereksiz dönemi silin.'],
  ['Başka bilgisayarda devam etmek istiyorum', 'Ayarlar › Yedek › Dışa aktar; diğer bilgisayarda İçe aktar. XML\'leri orada yeniden yüklerseniz görseller de gelir.'],
  ['İki sekmede açtım', 'Sorun değil; değişiklikler diğer sekmeye kendiliğinden yansır.'],
];
