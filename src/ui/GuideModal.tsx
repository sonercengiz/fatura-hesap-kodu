import { useEffect, useState } from 'preact/hooks';
import * as S from './state';

interface Section { id: string; title: string; short: string; body: preact.ComponentChildren }

const K = ({ k }: { k: string }) => <kbd>{k}</kbd>;
const Tip = ({ children }: { children: preact.ComponentChildren }) => <div class="g-tip">{children}</div>;
const Warn = ({ children }: { children: preact.ComponentChildren }) => <div class="g-warn">{children}</div>;
/** Görsel + numaralı kısa açıklamalar: öğrenme yükü görselde, metin tek satır */
const Shot = ({ src, alt, w, notes }: { src: string; alt: string; w?: 'full' | 'narrow' | 'mid'; notes?: preact.ComponentChildren[] }) => (
  <figure class={`g-fig ${w ?? 'full'}`}>
    <img src={`./guide/${src}`} alt={alt} loading="lazy" />
    {notes && notes.length > 0 ? (
      <ol class="g-notes">{notes.map((n) => <li><span>{n}</span></li>)}</ol>
    ) : (
      <figcaption>{alt}</figcaption>
    )}
  </figure>
);

const sections: Section[] = [
  {
    id: 'genel', short: 'Genel bakış', title: 'Ne yapar?',
    body: (
      <>
        <p>EDM'den indirdiğiniz fatura listesine (Excel) hesap kodu eklersiniz. Faturayı PDF'te görür, tek tuşla kod verir, sonunda aynı Excel'i <b>Hesap Kodu</b> sütunu eklenmiş halde indirirsiniz.</p>
        <div class="g-flow"><span>Excel yükle</span><i>→</i><span>PDF ekle</span><i>→</i><span>Kod ata</span><i>→</i><span><K k="F5" /> Kontrol</span><i>→</i><span><K k="F1" /> Excel üret</span></div>
        <Shot src="02-ekran.png" alt="Ekranın dört bölgesi" notes={[
          <><b>Üst çubuk:</b> firma, parti, dosya yükleme, kaydet, önizle, Excel üret.</>,
          <><b>Fatura alanı:</b> PDF ya da fatura kartı. Zemin rengi = atanan kodun rengi.</>,
          <><b>Sağ panel:</b> fatura bilgileri, atanan kod, fatura listesi.</>,
          <><b>Kısayol çubuğu:</b> altı renkli tuş ve manuel giriş.</>,
        ]} />
        <Tip>Kurulum yok, veriler yalnızca bu tarayıcıda kalır. Girdi Excel bozulmaz; sadece bir sütun araya girer.</Tip>
      </>
    ),
  },
  {
    id: 'firma', short: 'Firma seç', title: '1 · Firmanızı seçin',
    body: (
      <>
        <p>Her firmanın partileri, kısayolları, hesap listesi ve önerileri ayrıdır. Önce doğru firmayı seçin.</p>
        <Shot src="00-firma.png" alt="Firma menüsü" w="mid" notes={[
          <>Firma menüsü. En alttaki <b>+ Yeni firma…</b> ile yeni firma eklenir, adı sorulur.</>,
        ]} />
        <Shot src="00-firma-ayar.png" alt="Ayarlar → Firma" w="mid" notes={[
          <>Ad değiştirme ve silme <b>Ayarlar → Firma</b> bölümünde. İlk kurulumdaki "Firma 1" adını buradan değiştirin.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'yukle', short: 'Excel yükle', title: '2 · EDM Excel dosyasını yükleyin',
    body: (
      <>
        <Shot src="01-karsilama.png" alt="Karşılama ekranı" notes={[
          <><b>Excel yükle</b> düğmesi…</>,
          <>…ya da dosyayı pencereye <b>sürükleyip bırakın</b>.</>,
        ]} />
        <p>Her yükleme bir <b>parti</b> olur (örn. "Ekim 2026"). Üst çubuktaki parti menüsünden eski partilere dönersiniz. Daha önce kod verdiğiniz bir fatura yeniden gelirse kodu hatırlanır.</p>
      </>
    ),
  },
  {
    id: 'ustcubuk', short: 'Üst çubuk', title: '3 · Üst çubuk',
    body: (
      <>
        <Shot src="03-ustcubuk.png" alt="Üst çubuk" notes={[
          'Firma', 'Parti', 'Excel yükle', 'PDF ekle (dosya seç)', 'Klasör ekle (klasördeki tüm PDF\'ler)',
          'İlerleme: atanan / toplam · dikkat sayısı · kayıt durumu',
          <>Geri al <K k="Ctrl+Z" /></>, <>Kaydet <K k="F2" /></>, <>Önizle <K k="F5" /></>, <>Excel üret <K k="F1" /></>,
          'Rehber', 'Açık / koyu tema', 'Ayarlar',
        ]} />
      </>
    ),
  },
  {
    id: 'pdf', short: 'PDF ekle', title: '4 · PDF dosyalarını ekleyin',
    body: (
      <>
        <p><b>PDF ekle</b> ya da <b>Klasör ekle</b>. Her PDF, içindeki fatura numarasıyla doğru satıra kendiliğinden bağlanır; çok sayfalı ve birleştirilmiş dosyalar sayfa sayfa ayrılır.</p>
        <Shot src="04-pdf.png" alt="PDF görünümü" notes={[
          'Fatura PDF olarak görünür; uzunsa aşağı kaydırın.',
          'Hangi dosya, hangi sayfalar.',
          'Eşleşen fatura sayısı ve eşleşmeyen dosyalar.',
        ]} />
        <p>Eşleşmeyen bir dosya varsa (taranmış PDF, numarasız sayfa) yanındaki <b>bağla</b> düğmesine basın:</p>
        <Shot src="05-baglama.png" alt="Elle bağlama penceresi" w="mid" notes={[
          <>Tek tıkla şu anki faturaya, ya da arayıp seçin. Bağlantı kalıcıdır; <b>elle · kaldır</b> ile geri alınır.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'gezinti', short: 'Gezinti', title: '5 · Faturalar arasında gezinin',
    body: (
      <>
        <div class="g-keys">
          <div><K k="→" /><K k="↓" /><span>sonraki</span></div>
          <div><K k="←" /><K k="↑" /><span>önceki</span></div>
          <div><K k="Home" /><K k="End" /><span>ilk / son</span></div>
          <div><K k="Ctrl+F" /><span>ara</span></div>
        </div>
        <Shot src="06-panel.png" alt="Sağ panel" w="narrow" notes={[
          <><b>Sıra:</b> Excel sırası ya da tarih (aynı gün aynı satıcı art arda). Çıktıyı etkilemez.</>,
          <><b>Göster:</b> tümü / atanmamış / elle / toplu.</>,
          <><b>Liste:</b> atanan satır renklenir; kısayol kodu kendi rengini, diğerleri griyi alır. Turuncu <b>!</b> dikkat demektir.</>,
        ]} />
        <Tip>Kod verince otomatik olarak sonraki faturaya geçilir. Toplu atananlar atlanır; onları da görmek için <K k="Ctrl" /> basılı tutun.</Tip>
      </>
    ),
  },
  {
    id: 'kisayol', short: 'Kısayollar', title: '6 · Tek tuşla kod verin',
    body: (
      <>
        <p>Altı yuva <K k="Q" /> <K k="W" /> <K k="E" /> <K k="A" /> <K k="S" /> <K k="D" /> tuşlarıdır. Tuşa basınca kod atanır ve sonraki faturaya geçilir.</p>
        <Shot src="07b-atama.png" alt="Önce / sonra: Q tuşuna basınca kod atanır, zemin Q'nun rengini alır ve sonraki fatura açılır" />
        <Shot src="07-kisayol.png" alt="Kısayol çubuğu" notes={[
          <><b>Kayıtlı yuva.</b> Yalnızca sizin kaydettiğiniz kod; kendiliğinden değişmez.</>,
          <><b>Hayalet öneri.</b> Sık kullanılan kod boş yuvalarda soluk belirir; 💾 ile tuşa kaydedin.</>,
          <><b>✎ Düzenle.</b> Üzerine gelince çıkar; kod yazıp <K k="Enter" />. Boş bırakmak yuvayı temizler.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'manuel', short: 'Manuel giriş', title: '7 · Kodu elle yazın',
    body: (
      <>
        <p><K k="/" /> ya da herhangi bir <b>rakam</b> tuşu kutuyu açar. Yazın, <K k="Enter" />. <K k="Tab" /> ilk öneriyi alır, <K k="Esc" /> vazgeçer.</p>
        <Shot src="08-manuel.png" alt="Manuel giriş" notes={[
          'Kod kutusu (kısayollar bu sırada kapalı, rakamlar karışmaz).',
          'Daha önce kullanılan kodlardan öneriler.',
        ]} />
        <Shot src="08b-ipucu.png" alt="Satıcı ipucu" w="narrow" notes={[
          <>Aynı satıcıya önce verdiğiniz kod. <K k="Boşluk" /> ya da tıklama onu atar.</>,
        ]} />
        <p><K k="Backspace" /> atamayı kaldırır.</p>
      </>
    ),
  },
  {
    id: 'liste', short: 'Hesap listesi', title: '8 · Hesap kodu listesi (Ctrl+.)',
    body: (
      <>
        <p>Kendi kod listenizi girin; isimle arayın, yanlış kodu anında yakalayın.</p>
        <Shot src="09-liste-ayar.png" alt="Ayarlar → Hesap kodu listesi" notes={[
          <>Excel/CSV yükleyin (kod, isim) ya da "kod isim" satırlarını yapıştırıp <b>Listeye ekle</b>.</>,
        ]} />
        <Shot src="09-liste.png" alt="Ctrl+. arama penceresi" w="mid" notes={[
          <><K k="Ctrl+." /> açar. Kod ya da isim yazın.</>,
          <><K k="↑" /> <K k="↓" /> seçin, <K k="Enter" /> atayın. Listede olmayan kod için <b>+ Listeye ekle</b> çıkar.</>,
        ]} />
        <Warn>Liste doluyken listede olmayan bir kod atanırsa panelde ve F5'te <b>"Kod hesap kodu listesinde yok"</b> uyarısı çıkar.</Warn>
      </>
    ),
  },
  {
    id: 'toplu', short: 'Toplu atama', title: '9 · Birçok faturaya tek seferde kod verin',
    body: (
      <>
        <p>Kodu bilinen faturalara tek tek bakmayın. <b>☑ Seç</b> ile seçim yardımcılarını açın.</p>
        <Shot src="10-toplu.png" alt="Toplu seçim ve atama" w="narrow" notes={[
          <><b>Bu satıcıyı seç</b> / <b>Görünenleri seç</b>. Kutucuk, <K k="Shift" />+tık aralık, <K k="Ctrl" />+tık tekil.</>,
          <>Kodu yazıp <K k="Enter" />, ya da alttaki kısayol düğmelerine tıklayın.</>,
          <>Seçili satırlar çerçevelidir.</>,
        ]} />
        <Shot src="10b-toplu-sonuc.png" alt="Toplu atama sonrası liste" w="narrow" notes={[
          <>Toplu atananlar <b>"toplu"</b> etiketi alır ve ok tuşlarında atlanır. <K k="Ctrl" />+ok ile görülür; elle kod verilirse etiket kalkar.</>,
        ]} />
        <Tip>Yanlış kod mu? <K k="Ctrl+Z" /> hepsini birden geri alır.</Tip>
      </>
    ),
  },
  {
    id: 'geri', short: 'Geri al', title: '10 · Geri al / yinele',
    body: (
      <>
        <Shot src="11-geri-al.png" alt="Geri alma" notes={[
          <>↶ düğmesi ya da <K k="Ctrl+Z" />: son atama, kaldırma ya da toplu atama geri alınır. <K k="Ctrl+Y" /> yineler.</>,
          'Bildirim neyin geri alındığını söyler; ekran o faturaya döner.',
        ]} />
      </>
    ),
  },
  {
    id: 'kontrol', short: 'F5 önizleme', title: '11 · Kontrol edin (F5)',
    body: (
      <>
        <Shot src="12-onizleme.png" alt="F5 önizleme" notes={[
          <>Araya eklenen <b>Hesap Kodu</b> sütunu (mavi). Diğer sütunlar aynen.</>,
          'Dikkat sayaçları.',
          'Sarı satır = dikkat. Çift tık o faturaya götürür.',
        ]} />
        <table class="g-table">
          <tbody>
            <tr><td>Hesap kodu atanmamış</td><td>Hücre boş kalır.</td></tr>
            <tr><td>Kod listede yok</td><td>Yazım hatası olabilir.</td></tr>
            <tr><td>Tevkifat / İade</td><td>Özel durum, kodu bilinçli verin.</td></tr>
            <tr><td>PDF eşleşmedi / birden fazla eşleşti</td><td>Dosyaları kontrol edin.</td></tr>
            <tr><td>Aynı fatura no iki satırda</td><td>EDM listesinde tekrar var.</td></tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: 'cikti', short: 'Excel üret', title: '12 · Kaydedin ve Excel üretin',
    body: (
      <>
        <div class="g-keys">
          <div><K k="F2" /><span>Kaydet (partiyi tamamlandı işaretler)</span></div>
          <div><K k="F1" /><span>Excel üret: kaydeder ve İndirilenler'e indirir</span></div>
        </div>
        <p>Dosya adı: <code>GÜN AY YIL FİRMA_ADI FATURA.xlsx</code></p>
        <div class="g-cols">
          <div><div class="g-cols-title">Girdi</div><span>A Fatura No</span><span>B Fatura Tarihi</span><span>C Geliş Zamanı</span><span>D Fatura Tipi</span><span class="muted">…</span></div>
          <div class="g-arrow">→</div>
          <div><div class="g-cols-title">Çıktı</div><span>A Fatura No</span><span>B Fatura Tarihi</span><span class="ins">C Hesap Kodu</span><span>D Geliş Zamanı</span><span>E Fatura Tipi</span><span class="muted">…</span></div>
        </div>
        <p>Satır sırası ve tüm sütunlar korunur; kodlar metin olarak yazılır (600.002 bozulmaz). Konum ve başlık Ayarlar'dan değişir.</p>
      </>
    ),
  },
  {
    id: 'yedek', short: 'Yedekleme', title: '13 · Yedek alın',
    body: (
      <>
        <p>Veriler yalnızca bu tarayıcıda. Haftada bir yedek alın; bilgisayar değişirse tek dosyayla her şey geri gelir.</p>
        <Shot src="15-yedek-serit.png" alt="Yedek hatırlatma şeridi" notes={[
          <>Yedek 7 günden eskiyse bu şerit çıkar. <b>Şimdi dışa aktar</b> tek tıkla yedekler.</>,
        ]} />
        <Shot src="14-yedek.png" alt="Ayarlar → Yedekleme" notes={[
          <><b>Dışa aktar</b>: tüm firmalar, partiler, atamalar, listeler tek .json dosyasında (PDF'ler hariç).</>,
          <><b>İçe aktar</b>: mevcut veriyle birleştirir, silmez. Aynı dosyayı iki kez vermek güvenlidir.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'ayarlar', short: 'Ayarlar', title: '14 · Ayarlar ve tema',
    body: (
      <>
        <Shot src="13-ayarlar.png" alt="Ayarlar" notes={[
          'Firma adı, yeni firma, firma silme.',
          'Çıktıdaki Hesap Kodu sütununun konumu ve başlığı.',
          'Kısayol yuvaları (alt çubuktaki ✎ ile aynı).',
          'PDF açılış konumu: en üst / kaldığım yer / belirli yükseklik.',
        ]} />
        <Shot src="16-koyu.png" alt="Koyu tema" notes={[<>Gri tonlu koyu tema. Üst çubuktaki ☾ / ☀ ile anında değişir.</>]} />
      </>
    ),
  },
  {
    id: 'sorun', short: 'Sorun giderme', title: 'Sık karşılaşılan durumlar',
    body: (
      <table class="g-table">
        <tbody>
          <tr><td><b>PDF eşleşmedi</b></td><td>Taranmış ya da numarasız dosya. <b>bağla</b> ile elle bağlayın.</td></tr>
          <tr><td><b>Kısayol çalışmıyor</b></td><td>Yuva boş (uyarı çıkar) ya da bir kutu açık; <K k="Esc" />.</td></tr>
          <tr><td><b>Faturalar görünmüyor</b></td><td>Başka firma seçili, filtre dar ya da arama dolu.</td></tr>
          <tr><td><b>Ok tuşu bazı faturaları atlıyor</b></td><td>Onlar toplu atanmış; <K k="Ctrl" />+ok.</td></tr>
          <tr><td><b>Yanlış kod verdim</b></td><td><K k="Ctrl+Z" />, ya da faturada <K k="Backspace" />.</td></tr>
          <tr><td><b>F1 / F5 tarayıcıyı tetikledi</b></td><td>Üst çubuktaki düğmeleri kullanın.</td></tr>
          <tr><td><b>Veriler nerede?</b></td><td>Bu tarayıcıda. Taşımak için dışa / içe aktarın.</td></tr>
        </tbody>
      </table>
    ),
  },
];

const keys: [string, string][] = [
  ['→  ↓', 'Sonraki fatura (toplu atananlar atlanır)'],
  ['←  ↑', 'Önceki fatura'],
  ['Ctrl + ok', 'Toplu atananlar dahil gez'],
  ['Home  End', 'İlk / son fatura'],
  ['Q W E A S D', 'Yuvadaki kodu ata, sonrakine geç'],
  ['Boşluk', 'Satıcıya önce verilen kodu ata'],
  ['/  0–9', 'Manuel kod girişi'],
  ['Tab', 'İlk öneriyi al'],
  ['Ctrl+.', 'Hesap kodu listesinde ara ve ata'],
  ['Backspace', 'Atamayı kaldır'],
  ['Ctrl+Z  Ctrl+Y', 'Geri al / yinele'],
  ['Shift+tık  Ctrl+tık', 'Listede aralık / tekil seçim'],
  ['Esc', 'Kutudan çık, seçimi temizle'],
  ['Ctrl+F', 'Ara'],
  ['F2', 'Kaydet'],
  ['F5', 'Önizleme'],
  ['F1', 'Excel üret'],
];

export function GuideModal() {
  const [active, setActive] = useState('genel');
  const go = (id: string) => document.getElementById(`g-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  useEffect(() => {
    const body = document.querySelector('.guide-body');
    if (!body) return;
    const obs = new IntersectionObserver((ents) => { for (const e of ents) if (e.isIntersecting) setActive(e.target.id.replace('g-', '')); }, { root: body, rootMargin: '0px 0px -70% 0px' });
    body.querySelectorAll('section[id^="g-"]').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
  return (
    <div class="modal-backdrop" onClick={() => (S.guideOpen.value = false)}>
      <div class="modal guide" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">
          <b>Kullanım rehberi</b>
          <div class="spacer" />
          <button class="ghost" onClick={() => (S.guideOpen.value = false)}>Kapat <kbd>Esc</kbd></button>
        </div>
        <div class="guide-wrap">
          <nav class="guide-toc">
            {sections.map((s) => <a href={`#g-${s.id}`} class={active === s.id ? 'active' : ''} onClick={(e) => { e.preventDefault(); go(s.id); }}>{s.short}</a>)}
            <a href="#g-klavye" class={active === 'klavye' ? 'active' : ''} onClick={(e) => { e.preventDefault(); go('klavye'); }}>Klavye</a>
          </nav>
          <div class="guide-body" onClick={(e) => { const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null; if (a) { e.preventDefault(); go(a.getAttribute('href')!.replace('#', '')); } }}>
            {sections.map((s) => (
              <section class="guide-step" id={`g-${s.id}`}><h3>{s.title}</h3><div class="guide-text">{s.body}</div></section>
            ))}
            <section class="guide-step" id="g-klavye">
              <h3>Klavye</h3>
              <table class="keys-table"><tbody>{keys.map(([k, d]) => <tr><td>{k.split(/\s{2,}/).map((x) => <kbd>{x}</kbd>)}</td><td>{d}</td></tr>)}</tbody></table>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
