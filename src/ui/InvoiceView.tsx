import { useEffect, useRef, useState } from 'preact/hooks';
import type { ViewMode } from '../core/types';
import * as S from './state';

let lastScroll = 0;

export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 4;
const PAD = 10;

interface Crop { left: number; top: number; width: number; height: number }

/**
 * Çizilen faturanın gerçekten "boyalı" alanı: metin, görsel, arka planı ya da kenarlığı olan kutular.
 * Şablonların sayfa kenarlarına bıraktığı beyaz boşluk böylece kırpılır. Ölçüm yakınlaştırma 1'deyken yapılır.
 */
function contentBox(doc: Document): Crop | null {
  const win = doc.defaultView;
  if (!win || !doc.body) return null;
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  const add = (x: DOMRect) => { if (x.width <= 0 || x.height <= 0) return; l = Math.min(l, x.left); t = Math.min(t, x.top); r = Math.max(r, x.right); b = Math.max(b, x.bottom); };
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null = walker.nextNode();
  let count = 0;
  while (n && count < 20000) {
    count++;
    if (n.nodeType === Node.TEXT_NODE) {
      if ((n.textContent ?? '').trim()) { const range = doc.createRange(); range.selectNodeContents(n); add(range.getBoundingClientRect()); }
    } else {
      const el = n as Element;
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'HEAD') { n = walker.nextNode(); continue; }
      if (tag === 'IMG' || tag === 'SVG' || tag === 'CANVAS' || tag === 'HR') add(el.getBoundingClientRect());
      else {
        const cs = win.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') { n = walker.nextNode(); continue; }
        const bg = cs.backgroundColor;
        const painted = (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== 'rgb(255, 255, 255)') || cs.backgroundImage !== 'none'
          || ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0 && cs.getPropertyValue(`border-${s.toLowerCase()}-style`) !== 'none');
        if (painted) add(el.getBoundingClientRect());
      }
    }
    n = walker.nextNode();
  }
  if (!Number.isFinite(l)) return null;
  const sx = win.scrollX, sy = win.scrollY;
  return { left: Math.max(0, l + sx - PAD), top: Math.max(0, t + sy - PAD), width: r - l + PAD * 2, height: b - t + PAD * 2 };
}

/** Kırpma + yakınlaştırma stilini çerçeveye yazar (yalnızca ekranda; yazdırmada sayfa olduğu gibi kalır). */
function applyView(doc: Document, crop: Crop | null, zoom: number) {
  let st = doc.getElementById('__view') as HTMLStyleElement | null;
  if (!st) { st = doc.createElement('style'); st.id = '__view'; (doc.body ?? doc.documentElement).appendChild(st); }
  const margin = crop ? `margin:${-crop.top}px 0 0 ${-crop.left}px !important;` : '';
  st.textContent = `@media screen{html{zoom:${zoom} !important;${margin}}body{margin:0 !important;max-width:none !important}}`;
}

/** A4 genişliği (96 dpi, piksel): pencereye göre akan (sabit genişliği olmayan) şablonlar bu genişlikte bir sayfa gibi yakınlaştırılır */
const A4_W = 794;

/**
 * Kendiliğinden yakınlaştırma: kırpılmış içerik görüntü alanının genişliğini doldurur. A4 oranlı bir sayfada bu,
 * ekranda sayfanın üst yarısının (yaklaşık) görünmesi demektir; uzun faturalarda daha azı görünür, kaydırılır.
 * Akan şablonlarda (içerik genişliği pencereye bağlı) A4 genişliğindeki bir sayfa gibi davranılır.
 */
function autoZoom(crop: Crop | null, vw: number, docW: number): number {
  if (!crop || vw <= 0) return 1;
  const fluid = crop.width >= docW * 0.9;
  const z = vw / Math.max(fluid ? A4_W : crop.width, 1);
  return Math.min(2.5, Math.max(0.8, z));
}

/** Faturanın resmî görünümü: XML + XSLT dönüşümü, betiksiz (sandbox) bir çerçevede; kenar boşlukları kırpılır, yakınlaştırılır. */
export function InvoiceView(props: { invoiceNo: string; viewMode: ViewMode; marginPx: number }) {
  const { invoiceNo, viewMode, marginPx } = props;
  const frame = useRef<HTMLIFrameElement>(null);
  const crop = useRef<Crop | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [official, setOfficial] = useState(true);
  const [html, setHtml] = useState<string>('');
  const [zoom, setZoom] = useState(1);
  const dark = S.settings.value.theme === 'dark';
  const userZoom = S.settings.value.viewZoom;

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    S.getInvoiceView(invoiceNo)
      .then((v) => {
        if (cancelled) return;
        if (!v) { setStatus('error'); return; }
        setOfficial(v.official);
        setHtml(v.html);
      })
      .catch((e) => {
        console.warn(e);
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceNo]);

  const effectiveZoom = (): number => {
    const f = frame.current;
    if (userZoom != null) return userZoom;
    return autoZoom(crop.current, f?.clientWidth ?? 0, f?.contentDocument?.documentElement.clientWidth ?? 0);
  };

  /** Kullanıcı yakınlaştırmasını değiştirir (null = kendiliğinden); ayar kalıcıdır. */
  const changeZoom = (next: number | null) => {
    const z = next == null ? null : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100));
    S.updateSettings({ viewZoom: z });
  };

  // Yakınlaştırma ayarı değişince çerçeveye uygula
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || status !== 'ready') return;
    const z = effectiveZoom();
    try { applyView(doc, crop.current, z); } catch { /* yok say */ }
    setZoom(z);
  }, [userZoom, status]);

  const onLoad = () => {
    const f = frame.current;
    const w = f?.contentWindow;
    const doc = f?.contentDocument;
    if (!w || !doc) return;
    try {
      // 1) yakınlaştırma 1 ve kenar boşluksuz gövdede ölç, 2) kırp + yakınlaştır
      applyView(doc, null, 1);
      crop.current = contentBox(doc);
      const z = effectiveZoom();
      applyView(doc, crop.current, z);
      setZoom(z);
      if (viewMode === 'top') w.scrollTo(0, 0);
      else if (viewMode === 'margin') w.scrollTo(0, marginPx);
      else w.scrollTo(0, lastScroll);
      w.addEventListener('scroll', () => { lastScroll = w.scrollY; });
      // Çerçeveye tıklanınca odak orada kalır; kısayollar (Q–D, oklar, Tab, Boşluk, F1/F5…) ölmesin diye tuşlar ana pencereye aktarılır.
      // Metin seçme ve Ctrl+C çerçevede çalışmaya devam eder (ana pencere Ctrl'li harfleri yoksayar).
      doc.addEventListener('keydown', (e: KeyboardEvent) => {
        const fwd = new KeyboardEvent('keydown', { key: e.key, code: e.code, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, repeat: e.repeat, bubbles: true, cancelable: true });
        window.dispatchEvent(fwd);
        if (fwd.defaultPrevented) e.preventDefault();
      });
      // Ctrl + fare tekerleği: yakınlaştır / uzaklaştır (tarayıcı yakınlaştırması engellenir)
      doc.addEventListener('wheel', (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const cur = S.settings.value.viewZoom ?? effectiveZoom();
        changeZoom(cur * Math.pow(1.1, -e.deltaY / 100));
      }, { passive: false });
    } catch { /* erişim yoksa yok say */ }
    setStatus('ready');
  };

  // Çerçeve dışında (kenar boşluğu, düğmeler) Ctrl + tekerlek de yakınlaştırsın; tarayıcı yakınlaştırması engellenir
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const cur = S.settings.value.viewZoom ?? effectiveZoom();
    changeZoom(cur * Math.pow(1.1, -e.deltaY / 100));
  };

  return (
    <div class={`inv-view ${dark ? 'dim' : ''}`} onWheel={onWheel}>
      {html && (
        <iframe
          ref={frame}
          class="inv-frame"
          title={`Fatura ${invoiceNo}`}
          sandbox="allow-same-origin allow-modals"
          srcdoc={html}
          onLoad={onLoad}
        />
      )}
      {status === 'ready' && (
        <div class="view-zoom" title="Yakınlaştırma: Ctrl + fare tekerleği ya da − / +. 'Oto': sayfanın üst yarısı ekranı doldurur.">
          <button class="ghost tiny" onClick={() => changeZoom(zoom / 1.2)} title="Uzaklaştır">−</button>
          <button class={`ghost tiny zoom-pct ${userZoom == null ? 'auto' : ''}`} onClick={() => changeZoom(null)} title={userZoom == null ? 'Kendiliğinden (üst yarı ekranı doldurur)' : "Kendiliğinden yakınlaştırmaya dön"}>{Math.round(zoom * 100)}%{userZoom == null ? ' oto' : ''}</button>
          <button class="ghost tiny" onClick={() => changeZoom(zoom * 1.2)} title="Yakınlaştır">+</button>
        </div>
      )}
      {status === 'loading' && <div class="pdf-status">Fatura çiziliyor…</div>}
      {status === 'error' && <div class="pdf-status">Fatura görseli çizilemedi.</div>}
      {status === 'ready' && !official && <div class="inv-note">Sade görünüm: bu faturada şablon yok ya da çizilemedi.</div>}
    </div>
  );
}

/** Açık çerçeveyi yazdırır (tarayıcının "PDF olarak kaydet" seçeneği de buradan). */
export function printCurrentInvoice() {
  const f = document.querySelector<HTMLIFrameElement>('.inv-frame');
  try {
    f?.contentWindow?.focus();
    f?.contentWindow?.print();
  } catch {
    S.showToast('Yazdırma açılamadı.');
  }
}
