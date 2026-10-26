import { useEffect, useRef, useState } from 'preact/hooks';
import type { ViewMode } from '../core/types';
import * as S from './state';

let lastScroll = 0;

/** Faturanın resmî görünümü: XML + XSLT dönüşümü, betiksiz (sandbox) bir çerçevede. */
export function InvoiceView(props: { invoiceNo: string; viewMode: ViewMode; marginPx: number }) {
  const { invoiceNo, viewMode, marginPx } = props;
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [official, setOfficial] = useState(true);
  const [html, setHtml] = useState<string>('');
  const dark = S.settings.value.theme === 'dark';

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

  const onLoad = () => {
    const w = frame.current?.contentWindow;
    if (!w) return;
    try {
      if (viewMode === 'top') w.scrollTo(0, 0);
      else if (viewMode === 'margin') w.scrollTo(0, marginPx);
      else w.scrollTo(0, lastScroll);
      w.addEventListener('scroll', () => { lastScroll = w.scrollY; });
    } catch { /* erişim yoksa yok say */ }
    setStatus('ready');
  };

  return (
    <div class={`inv-view ${dark ? 'dim' : ''}`}>
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
