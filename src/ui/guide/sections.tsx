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
                  <>Fatura görüntüsü: şablonun kenar boşlukları kırpılır, sayfa ekran genişliğini doldurur (A4'te üst yarısı görünür). <K k="Ctrl" /> + fare tekerleği ya da sağ alttaki − / + ile yakınlaştırın; seçiminiz bütün faturalarda korunur, "oto" kendiliğindene döndürür.</>,
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
          <>Fatura sayısı; yanlış yüklenen faturayı <b>dönemden sil</b>, başka firmaya ya da döneme <b>taşı</b>.</>,
          <>Kalemler: ad, miktar × birim fiyat = tutar, KDV oranı. Yanındaki ⚡ "Bu faturadan kural" penceresini o kalem işaretli açar (bkz. Kurallar).</>,
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
          <>Yuvada olmayan bir kod için <K k="/" /> basıp yazın; <K k="Enter" /> verir, <K k="Esc" /> vazgeçer. Kodu kaldırmak için kutuyu boş bırakıp <K k="Enter" /> (ya da <K k="Backspace" />).</>,
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
          <>Sütunları kendiniz seçip sıralayın (Excel'deki bütün alanlar, KDV dökümü dahil) ya da <b>Excel şablonuyla aynı</b>yı seçin: ekranda ne görüyorsanız Excel'e o çıkar.</>,
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
          <><b>Bu satıcıyı seç</b> ya da <b>Görünenleri seç</b>; kodu yazıp <K k="Enter" /> hepsine verir. Seçim varken <K k="Q" /> <K k="W" /> <K k="E" />… kısayolları, yuvaya tıklamak, elle giriş ve <K k="Ctrl+." /> da seçilenlerin hepsine verir.</>,
          <>Seçili satırlar. <K k="Shift" />+tık aralık, <K k="Ctrl" />+tık tekil seçer; <K k="Esc" /> bırakır.</>,
        ]} />
        <p>Seçim varken <b>Excel'den çıkar</b> seçili faturaları çıktı dosyasının dışında bırakır (istisnai faturalar için; bkz. Önizleme).</p>
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
        <Shot src="13-kural-yap.png" alt="Kural yap düğmesi" w="narrow" notes={[<>Kod verdiğiniz faturada <b>⚡ Kural yap</b>: küçük "Bu faturadan kural" penceresi açılır; satıcının VKN'si işaretli, kod hazır gelir. <K k="Enter" /> kaydeder ve bu dönemdeki uyan faturalara hemen uygular.</>]} />
        <p>Tek bilgi her zaman yetmez: aynı satıcıdan farklı kodlara giden alışlar olabilir. Bu yüzden bir kural <b>bir ya da daha çok <T t="koşul" /></b>dan oluşur (sayı sınırı yok) ve hepsi birlikte tutmalıdır. Koşul türleri: satıcı VKN/TCKN, unvanda geçen metin, kalem adında geçen metin, KDV oranı, kalem miktarı, birim fiyat ve kalem tutarı aralıkları, fatura tutarı aralığı, fatura tipi, fatura tarihi aralığı.</p>
        <Shot src="13-kurallar.png" alt="Kurallar penceresi" notes={[
          <><T t="kalıcı kural">Kalıcı</T>: her ay geçerli. <T t="dönem kuralı">Yalnızca bu dönem</T>: o ay için; kalıcının önüne geçer.</>,
          <>Koşul satırları: "Eğer … ve …". Türü düğmelerden seçin (VKN · Unvan · Kalem · KDV · Miktar · Birim fiyat · Kalem tutarı · Tutar · Tip · Tarih), değeri yazın. Aralıklarda alt ya da üst sınırı boş bırakabilirsiniz (örn. "≥ 1000").</>,
          <><b>+ Koşul ekle</b>: istediğiniz kadar koşul; hepsi birlikte tutmalı. "Ya da" için ayrı bir kural yazın.</>,
          <>"o zaman hesap kodu" ve <b>Kaydet ve uygula</b>; <K k="Enter" /> da kaydeder.</>,
          <>Canlı önizleme: bu dönemde kaç faturaya uyduğu, ilk birkaçı ve başka bir kuralın önde kaldığı durumlar. Kaydetmeden önce kontrol edin.</>,
          <>Kayıtlı kurallar koşul rozetleriyle; kaç faturaya uyduğu görünür. Kutucukla kapatılır, kod burada düzeltilir, ✎ ile koşullar değiştirilir.</>,
          <>Dönem kuralı bir kalıcı kuralın yerine geçiyorsa sessizce burada yazar.</>,
          <>Kuralları dosya olarak dışa aktarıp başka kullanıcıya verebilirsiniz.</>,
        ]} />
        <Shot src="13b-kalemden-kural.png" alt="Bu faturadan kural" notes={[
          <>Panelde faturanın kalemleri: ad, miktar × birim fiyat = tutar, KDV. "Çuval almış, 3000 tane; satmak içindir" dediğiniz anda kalemin yanındaki <b>⚡</b>'ya basın.</>,
          <>"Bu faturadan kural" penceresi: faturanın bütün bilgileri <T t="rozet" /> olarak. Satıcı (VKN, unvan) ve fatura (tarih, tip, KDV oranı, tutar) rozetleri.</>,
          <>Her kalemin rozetleri: kalem adı (kelimeyi düzeltebilirsiniz), miktar, birim fiyat, kalem tutarı. ⚡ ile geldiğiniz kalemin adı ve miktarı işaretli gelir. Sayılı rozetlerde ≥ / ≤ yönü ve eşik düzenlenir (3.000 → 1.000).</>,
          <>Özet satırı: kural neye dönüştü, bu dönemde kaç faturaya uyuyor, başka bir kural önde mi.</>,
          <>Hesap kodu ve <b>Kaydet ve uygula</b> (<K k="Enter" />). Kalıcı / yalnızca bu dönem seçimi üstte.</>,
          <><b>Gelişmiş…</b>: aynı taslakla büyük kural penceresi (iki sınırlı aralık, düzenleme, liste).</>,
        ]} />
        <p>Böylece "VKN + kalem" ya da "unvan + KDV %10" gibi birleşik kurallar, kural penceresine hiç girmeden iki rozet işaretleyerek kurulur. Birim fiyat rozeti demirbaş sınırı için işe yarar: sınırın üstündeki alışlar 255'e, altındakiler gidere.</p>
        <p>Örnek: Lezzet Gıda'dan alınan <b>30'lu yumurta</b> ikramdır (770.09), <b>3000 yumurta</b> ise satış için alınmıştır (153). İki kural: kalem "yumurta" + miktar ≤ 999 → 770.09; kalem "yumurta" + miktar ≥ 1000 → 153. Miktar, aynı kuraldaki kalem adıyla aynı kalemde aranır. Benzer biçimde "unvan ABC Kırtasiye + kalem klasör → 543" ya da "KDV %10 → 153" yazılabilir.</p>
        <p><b>Birden çok kural uyarsa</b> hangisi kazanır? Önce döneme özel olan, sonra daha çok koşullu (daha belirgin) olan, sonra VKN › unvan › kalem › tip › KDV › miktar › birim fiyat › kalem tutarı › tutar › tarih sırası, sonra en son güncellenen. Yani "VKN 123… → 770" ile "VKN 123… + kalem klasör → 543" birlikte varsa klasörlü faturalar 543, diğerleri 770 alır.</p>
        <Tip>Kuralla verilen kodlar "kural" etiketi alır ve gezerken atlanır. Bir faturada kural başka bir şey diyorsa panelde "Kural: …" ipucu çıkar; <K k="Boşluk" /> kuralın kodunu verir. Kuralla verilen kodlar kuralı izler: kuralın kodunu ya da koşullarını değiştirirseniz bu dönemde o kuralla verilmiş kodlar da düzelir; kuralı kapatır ya da silerseniz kalkar (kapatılan kural yeniden açılınca geri gelir). Elle verdiğiniz kodlara ve geçmiş dönemlere dokunulmaz. <K k="Ctrl+Z" /> kuralı da kodları da geri getirir; Kurallar penceresi açıkken de çalışır.</Tip>
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
          <>Sütunları GMS'inize göre düzenlemek için <b>Şablonu düzenle</b> (ya da üst çubukta Excel üret'in yanındaki <b>Şablon</b>).</>,
        ]} />
        <Tip><b>İstisnai faturayı Excel'e koymamak:</b> önizlemede satırın başındaki <b>Excel</b> kutusunu kaldırın; ya da listede faturaları seçip <b>Excel'den çıkar</b>'a basın. Çıkarılan fatura soluk görünür, "hariç" etiketi alır, kod beklemez (sayaç ve <K k="Tab" /> onu atlar). Süzgeçten "Excel'den çıkarılanlar" ile hepsini görür, kutuyu yeniden işaretleyerek ya da panelde <b>Geri al</b> ile geri alırsınız; <K k="Ctrl+Z" /> da geri alır.</Tip>
        <p><K k="F1" /> dosyayı indirir: <code>AY YIL FİRMA_ADI FATURA.xlsx</code>. Ay, faturaların ayıdır. GMS'te "Excel içe aktar" ile açılır.</p>
        <Shot src="15-sablon.png" alt="Çıktı şablonu" notes={[
          <>Hesap Kodu sütunu; sürükleyerek yerini değiştirin, başlığını yazın. İsterseniz kaldırın: uygulamayı yalnızca fatura verisi toplamak için de kullanabilirsiniz.</>,
          <>Sütun ekleyin: ETTN, matrah, vergi, hesap adı, boş sütun… <b>+ KDV dökümü</b> oran başına matrah ve KDV sütunlarını tek seferde ekler.</>,
          <>Satır sırası ve sayfa adı.</>,
          <>Canlı önizleme.</>,
          <>Karıştıysa <b>EDM varsayılanına dön</b>.</>,
        ]} />
        <Tip>Her firmanın kendi Excel şablonu vardır: firmalar farklı GMS düzenleriyle çalışıyorsa her birini ayrı ayarlayın. Yeni firma, açık firmanın şablonuyla başlar; şablon penceresindeki <b>Başka firmadan al</b> bir firmanın şablonunu kopyalar.</Tip>
        <Tip><b>KDV dökümü</b> sütunları: Matrah %0 · Matrah ve KDV %1, %10, %20 · Oranı Uyuşmayan KDV. Değerler faturanın XML'indeki KDV özetinden gelir; faturada o oran yoksa hücre boş kalır. Temmuz 2023 öncesi oranlar (%8, %18) için sütunları <b>+ Sütun ekle</b>'den ekleyin; açık dönemde sütunu olmayan bir oran varsa pencere söyler ve tek tıkla ekler, önizleme de uyarır. <b>Oranı Uyuşmayan KDV</b>: bazı operatör faturalarında (ör. GSM) KDV satırının oran alanına tutar yazılmış; bu satırların vergisi burada toplanır, matrahları başka satırın tekrarı olduğu için sayılmaz. ÖİV, ÖTV gibi KDV dışı vergiler bu sütunlara girmez; bu yüzden matrah + KDV her faturada Tutar'ı vermeyebilir.</Tip>
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
        <Shot src="19-tasi.png" alt="Başka firmaya ya da döneme taşı" w="mid" notes={[<><T t="taşı">Taşı</T>: yanlış firmaya yüklenen dönemi ya da seçili faturaları atamalarıyla doğru firmaya götürür. Seçili faturalar aynı firmanın başka dönemine de taşınır: hedef firmada "bu firma"yı seçin. Geri taşımak aynı penceredendir.</>]} />
      </>
    ),
  },
  {
    id: 'ayarlar', group: 'Çıktı', short: 'Ayarlar ve tema', title: 'Ayarlar ve görünüm',
    body: (
      <>
        <Shot src="17-ayarlar.png" alt="Ayarlar" notes={[
          <>Sekmeler: Firma, Dönem, Çıktı, Görünüm, Ekran, Yedek, Klavye.</>,
          <>Kısayol kodları burada da yazılır.</>,
          <>Hesap kodu listesi ve kurallar kendi pencerelerinde.</>,
        ]} />
        <h4>Küçük ya da eski ekranlar</h4>
        <p>Uygulama pencereye kendiliğinden uyar: 1024×768 ya da 1280×1024 gibi kare ekranlarda ve %125 yazı ölçekli dizüstülerde <T t="arayüz ölçeği">arayüz biraz küçülür</T>, <T t="sıkışık yerleşim">sıkışık yerleşime</T> geçer, liste daha çok fatura gösterir. Üst çubuğa sığmayan düğmeler <b>⋯</b> menüsüne taşınır.</p>
        <Shot src="22-kucuk-ekran.png" alt="1024×768 ekranda sıkışık yerleşim" notes={[
          <>Üst çubuk tek satır; sığmayan düğmeler <b>⋯</b> menüsünde (bkz. alttaki görsel).</>,
          <>Panel bilgileri iki sütun, kalemler iki satır.</>,
          <>Kısayollar tek sıra; durum kartı küçülür.</>,
          <>Görüntü ile liste arasındaki çizgi sürüklenir: panel genişliği hatırlanır.</>,
        ]} />
        <Shot src="22b-menu.png" alt="Dar pencerede ⋯ menüsü" w="mid" notes={[<>Pencere daralınca Rehber, tema, geri al gibi düğmeler <b>⋯</b> altına girer; pencere genişleyince yerine döner.</>]} />
        <Shot src="17b-ekran.png" alt="Ayarlar › Ekran" notes={[
          <>Bu bilgisayarın ekranı ve uygulamanın şu anki ölçeği / yerleşimi.</>,
          <>Arayüz ölçeği: kendiliğinden ya da %85–%150. Yazı küçük geliyorsa %100 seçin.</>,
          <>Yerleşim: kendiliğinden, ferah ya da sıkışık. Bu seçimler yalnızca bu bilgisayarda kalır; yedeğe girmez.</>,
        ]} />
        <Shot src="21-koyu.png" alt="Koyu tema" notes={[<>Üst çubuktaki ☾/☀ ile koyu tema. Gri tonludur, fatura görüntüsü hafifçe kısılır.</>]} />
        <Shot src="20-tamamlandi.png" alt="Tamamlandı" notes={[<>Bütün faturalar kod alınca ilerleme kartı yeşile döner ve sıradaki adımı söyler: <K k="F1" /> Excel üret.</>]} />
      </>
    ),
  },
];

/** Klavye listesi: rehberde ve Ayarlar › Klavye'de aynı tablo */
export const keys: [string, string][] = [
  ['←  →', 'Önceki / sonraki fatura'],
  ['Tab  Shift+Tab', 'Sonraki / önceki kod almamış fatura (Shift+ok da olur)'],
  ['Ctrl+←  Ctrl+→', 'Toplu ve kuralla atananlar dahil gez'],
  ['Q W E A S D', 'Yuvadaki kodu ver (seçim varken seçilenlerin hepsine; ayara göre sıradakine geç)'],
  ['Boşluk', 'Kuralın ya da satıcıya önce verilen kodu ver (yalnızca açık faturaya)'],
  ['/  Enter  0–9', 'Elle kod girişi (Esc vazgeçer; seçim varken seçilenlere)'],
  ['Ctrl+.', 'Hesap kodu listesinde ara ve ver (seçim varken seçilenlere)'],
  ['Backspace', 'Kodu kaldır (elle girişte boş Enter da kaldırır)'],
  ['Ctrl+Z  Ctrl+Y', 'Geri al / yinele'],
  ['Shift+tık  Ctrl+tık', 'Listede aralık / tekil seçim'],
  ['Çift tık', 'Liste görünümünde faturayı görselde aç'],
  ['Esc', 'Pencereyi kapat, seçimi bırak'],
  ['Ctrl+F', 'Ara'],
  ['F5', 'Önizleme'],
  ['F1', 'Excel üret'],
  ['Ctrl+P  Ctrl+Shift+P', 'Açık faturayı yazdır / yazdırma planı'],
  ['Ctrl+tekerlek', 'Fatura görüntüsünü yakınlaştır / uzaklaştır (sağ alttaki − / + de olur)'],
];

export const troubles: [string, string][] = [
  ['Yükledim, bazı dosyalar "okunamadı"', 'Fatura olmayan XML\'ler (irsaliye, yanıt, zarf) normaldir. Bozuk görünen bir fatura varsa EDM\'den yeniden indirin.'],
  ['Fatura görüntüsü küçük ya da kesik görünüyor', 'Ctrl + fare tekerleği ile yakınlaştırın; sağ alttaki "oto" kendiliğinden ölçüye döndürür. Ayarlar › Görünüm\'den yeni faturaya geçince en üstten mi, kaldığınız yerden mi başlayacağını seçin.'],
  ['Düğmeler üst çubuğa sığmıyor ya da bazı düğmeler yok', 'Dar pencerede Rehber, tema, geri al gibi düğmeler sağ üstteki ⋯ menüsüne taşınır. Pencereyi büyütün ya da Ayarlar › Ekran\'dan arayüz ölçeğini küçültün.'],
  ['Liste çok az fatura gösteriyor, her şey büyük', 'Ayarlar › Ekran\'da "Sıkışık" yerleşimi ve daha küçük bir ölçek seçin; görüntü ile liste arasındaki çizgiyi sürükleyerek paneli daraltın. Kalemler bölümü başlığından kapatılabilir.'],
  ['Yazılar çok küçük', 'Ayarlar › Ekran\'dan %100 ya da %110 ölçek seçin. Tarayıcının Ctrl + / Ctrl − yakınlaştırması da olur; uygulama ona göre yeniden yerleşir.'],
  ['Fatura görüntüsü yerine kart görünüyor', 'O faturanın XML\'i yok (EDM listesinden ya da arşivden geldi). XML\'ini yükleyin, görüntü gelir; atama korunur.'],
  ['Q tuşu "yuva boş" diyor', 'Alt çubukta o yuvaya tıklayıp bir kod yazın. Yuvalar kendiliğinden dolmaz.'],
  ['Kod verdim ama listede göremiyorum', 'Süzgeç "Atanmamış" olabilir; "Tümü" yapın. Toplu/kural atananlar gezerken atlanır; Ctrl+ok ile görülür.'],
  ['Yanlış firmaya yükledim', 'Sağ alttaki "taşı" ile dönemi ya da seçili faturaları doğru firmaya taşıyın; atamalar da birlikte taşınır.'],
  ['GMS dosyayı almadı', 'Üst çubuktaki Şablon (ya da Ayarlar › Çıktı) ile sütun ve başlıkları GMS\'in beklediği gibi yapın. Emin olmak için EDM listesini de yükleyin; çıktı EDM dosyasıyla birebir olur.'],
  ['"Depolama alanı doldu" uyarısı', 'Ayarlar › Yedek › Depolama\'dan eski dönemlerin görsellerini arşivleyin ya da gereksiz dönemi silin.'],
  ['Başka bilgisayarda devam etmek istiyorum', 'Ayarlar › Yedek › Dışa aktar; diğer bilgisayarda İçe aktar. XML\'leri orada yeniden yüklerseniz görseller de gelir.'],
  ['İki sekmede açtım', 'Sorun değil; değişiklikler diğer sekmeye kendiliğinden yansır.'],
];
