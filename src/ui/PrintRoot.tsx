import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from './state';
import { fmtAmount } from './InvoiceCard';

/** Sayfa genişliği (A4 dik, 96 dpi, kenar boşlukları düşülmüş) */
const PAGE_W = 740;

/**
 * Yazdırma kökü: her fatura kendi çerçevesinde (stil çakışması olmaz), içeriğe göre boyutlanır ve gerekirse
 * sayfa genişliğine ölçeklenir. Hepsi hazır olunca tarayıcının yazdırma penceresi açılır.
 */
export function PrintRoot() {
  const job = S.printJob.value;
  const [htmls, setHtmls] = useState<Map<string, string>>(new Map());
  const [ready, setReady] = useState(0);
  const printed = useRef(false);

  const part = job ? job.parts[job.part] : [];
  const offset = job ? job.parts.slice(0, job.part).reduce((n, p) => n + p.length, 0) : 0;
  const multi = !!job && job.parts.length > 1;

  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    printed.current = false;
    setReady(0);
    setHtmls(new Map());
    (async () => {
      const m = new Map<string, string>();
      for (const inv of part) {
        const v = await S.getInvoiceView(inv.no);
        if (cancelled) return;
        m.set(inv.no, v?.html ?? '');
        S.busy.value = `${multi ? `Parça ${job.part + 1}/${job.parts.length}: ` : ''}yazdırma hazırlanıyor ${m.size}/${part.length}`;
      }
      setHtmls(m);
    })();
    return () => { cancelled = true; };
  }, [job]);

  useEffect(() => {
    if (!job || htmls.size < part.length || ready < part.length || printed.current) return;
    printed.current = true;
    S.busy.value = null;
    const done = () => { window.removeEventListener('afterprint', done); S.nextPrintPart(); };
    window.addEventListener('afterprint', done);
    // Yazı tipleri ve çizim otursun
    setTimeout(() => { try { window.print(); } catch { done(); } }, 150);
  }, [job, htmls, ready]);

  if (!job) return null;
  const onLoad = (e: Event) => {
    const f = e.currentTarget as HTMLIFrameElement;
    try {
      const d = f.contentDocument!;
      d.documentElement.style.overflow = 'hidden';
      const w = Math.max(d.documentElement.scrollWidth, d.body?.scrollWidth ?? 0);
      const h = Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight ?? 0);
      const scale = w > PAGE_W ? PAGE_W / w : 1;
      f.style.width = `${w}px`;
      f.style.height = `${h}px`;
      f.style.transform = scale < 1 ? `scale(${scale})` : '';
      (f.parentElement as HTMLElement).style.height = `${Math.ceil(h * scale)}px`;
    } catch { /* boyutlanamazsa olduğu gibi */ }
    setReady((n) => n + 1);
  };
  const codes = S.assignments.value;
  const total = job.items.length;
  return (
    <>
    {multi && (
      <div class="print-parts-bar">
        <span>Parçalı yazdırma · parça <b>{job.part + 1}/{job.parts.length}</b> · faturalar {offset + 1}–{offset + part.length} / {total}</span>
        <span class="muted small">Her parça için yazdırma penceresi açılır; sonraki parça kendiliğinden gelir.</span>
        <button class="tiny" onClick={() => S.finishPrint()}>Durdur</button>
      </div>
    )}
    <div class="print-root" aria-hidden>
      {job.opts.summary && job.part === 0 && (
        <section class="print-summary print-item">
          <h2>{S.firm.value.name} · {S.batchRec.value?.name}</h2>
          <div class="muted">{job.items.length} fatura · {new Date().toLocaleDateString('tr-TR')}</div>
          <table>
            <thead><tr><th>#</th><th>Fatura No</th><th>Tarih</th><th>Satıcı</th><th class="r">Tutar</th><th>Hesap Kodu</th></tr></thead>
            <tbody>
              {job.items.map((i, k) => <tr><td>{k + 1}</td><td>{i.no}</td><td>{i.date}</td><td>{i.supplierName}</td><td class="r">{fmtAmount(i.amount, i.currency)}</td><td>{codes.get(i.no) ?? ''}</td></tr>)}
            </tbody>
          </table>
        </section>
      )}
      {part.map((i, k) => (
        <section class={`print-item ${job.opts.pageBreak ? 'brk' : ''}`}>
          {job.opts.strip && (
            <div class="print-strip">
              <span>{offset + k + 1} / {total}</span>
              <span>{i.no}</span>
              <span>{i.date}</span>
              <span class="print-strip-name">{i.supplierName}</span>
              <span>{fmtAmount(i.amount, i.currency)}</span>
              <b>{codes.get(i.no) ?? '—'}</b>
            </div>
          )}
          <div class="print-frame-box">
            {htmls.has(i.no) && <iframe class="print-frame" sandbox="allow-same-origin" srcdoc={htmls.get(i.no)} onLoad={onLoad} title={i.no} />}
          </div>
        </section>
      ))}
    </div>
    </>
  );
}
