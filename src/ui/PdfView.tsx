import { useEffect, useRef, useState } from 'preact/hooks';
import type { PdfRef, ViewMode } from '../core/types';
import type { FileRecord } from '../storage/db';
import { getCachedPdf } from '../pdf/pdfjs';

let lastScroll = 0;

export function PdfView(props: { file: FileRecord; pref: PdfRef; invoiceNo: string; viewMode: ViewMode; marginPx: number }) {
  const { file, pref, invoiceNo, viewMode, marginPx } = props;
  const box = useRef<HTMLDivElement>(null);
  const pages = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let t: number | undefined;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => setTick((x) => x + 1), 150);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const host = pages.current;
    const scroller = box.current;
    if (!host || !scroller) return;
    host.innerHTML = '';
    setStatus('loading');
    (async () => {
      const doc = await getCachedPdf(file.id, file.blob);
      const width = Math.max(200, scroller.clientWidth - 32);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (let p = pref.pageStart; p <= pref.pageEnd; p++) {
        if (cancelled) return;
        const page = await doc.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: width / base.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width = `${Math.floor(vp.width)}px`;
        canvas.style.height = `${Math.floor(vp.height)}px`;
        canvas.className = 'pdf-page';
        if (cancelled) return;
        host.appendChild(canvas);
        await page.render({ canvas, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise;
        if (p === pref.pageStart && !cancelled) {
          if (viewMode === 'top') scroller.scrollTop = 0;
          else if (viewMode === 'margin') scroller.scrollTop = marginPx;
          else scroller.scrollTop = lastScroll;
          setStatus('ready');
        }
      }
    })().catch((e) => {
      console.warn(e);
      if (!cancelled) setStatus('error');
    });
    return () => {
      cancelled = true;
    };
  }, [file.id, pref.pageStart, pref.pageEnd, invoiceNo, tick]);

  return (
    <div
      class="pdf-scroller"
      ref={box}
      onScroll={(e) => {
        lastScroll = (e.currentTarget as HTMLDivElement).scrollTop;
      }}
    >
      <div class="pdf-pages" key="pages" ref={pages} />
      {status === 'loading' && <div class="pdf-status" key="status">PDF yükleniyor…</div>}
      {status === 'error' && <div class="pdf-status" key="status">PDF çizilemedi.</div>}
    </div>
  );
}
