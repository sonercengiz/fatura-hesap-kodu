import { useEffect, useMemo, useState } from 'preact/hooks';
import * as S from './state';
import { fmtAmount } from './InvoiceCard';
import type { Invoice } from '../core/types';
import { sortInvoices } from '../core/sort';

type Source = 'all' | 'selected' | 'visible';
type Order = 'date' | 'supplier' | 'code' | 'added';
const ORDER_LABELS: Record<Order, string> = { date: 'Tarih (çıktı sırası)', supplier: 'Satıcı (A→Z), sonra tarih', code: 'Hesap kodu, sonra tarih', added: 'Yükleme sırası' };

function orderList(list: Invoice[], order: Order, reverse: boolean, codes: Map<string, string>): Invoice[] {
  let out: Invoice[];
  const byDate = sortInvoices(list, 'date-supplier');
  if (order === 'date') out = byDate;
  else if (order === 'added') out = sortInvoices(list, 'added');
  else if (order === 'supplier') out = byDate.slice().sort((a, b) => a.supplierName.localeCompare(b.supplierName, 'tr') || 0);
  else out = byDate.slice().sort((a, b) => {
    const ca = codes.get(a.no) ?? '￿';
    const cb = codes.get(b.no) ?? '￿';
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });
  return reverse ? out.slice().reverse() : out;
}

/** Yazdırma planı: kaynak, sıra, elle düzenleme ve seçenekler; yazdırma tarayıcıdan yapılır (PDF olarak kaydetmek dahil). */
export function PrintModal() {
  const all = S.invoices.value;
  const selectedNos = S.selected.value;
  const visible = all.filter(S.passesFilter);
  const [source, setSource] = useState<Source>(selectedNos.size ? 'selected' : 'all');
  const [order, setOrder] = useState<Order>('date');
  const [reverse, setReverse] = useState(false);
  const [pageBreak, setPageBreak] = useState(true);
  const [strip, setStrip] = useState(true);
  const [summary, setSummary] = useState(false);
  const [manual, setManual] = useState<string[] | null>(null); // elle sürüklenmiş sıra (fatura no listesi)
  const [dragNo, setDragNo] = useState<string | null>(null);


  const base = source === 'selected' ? all.filter((i) => selectedNos.has(i.no)) : source === 'visible' ? visible : all;
  const auto = useMemo(() => orderList(base, order, reverse, S.assignments.value), [base, order, reverse, S.assignments.value]);
  const items = useMemo(() => {
    if (!manual) return auto;
    const byNo = new Map(auto.map((i) => [i.no, i]));
    const kept = manual.map((no) => byNo.get(no)).filter((x): x is Invoice => !!x);
    const rest = auto.filter((i) => !manual.includes(i.no));
    return [...kept, ...rest];
  }, [auto, manual]);

  const move = (from: string, to: string) => {
    if (from === to) return;
    const nos = items.map((i) => i.no);
    const a = nos.indexOf(from);
    const b = nos.indexOf(to);
    if (a < 0 || b < 0) return;
    nos.splice(a, 1);
    nos.splice(b, 0, from);
    setManual(nos);
  };
  const noView = items.filter((i) => !i.hasView).length;
  const [hoverNo, setHoverNo] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ no: string; html: string } | null>(null);
  const previewNo = hoverNo ?? items[0]?.no ?? null;
  useEffect(() => {
    if (!previewNo) { setPreview(null); return; }
    let cancelled = false;
    S.getInvoiceView(previewNo).then((v) => { if (!cancelled && v) setPreview({ no: previewNo, html: v.html }); });
    return () => { cancelled = true; };
  }, [previewNo]);
  const previewInv = previewNo ? items.find((i) => i.no === previewNo) : undefined;

  return (
    <div class="modal-backdrop" onClick={() => S.closePrint()}>
      <div class="modal print-modal" onClick={(e) => e.stopPropagation()} onKeyDownCapture={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); S.closePrint(); } }}>
        <div class="modal-head">
          <b>Yazdırma planı</b>
          <span class="muted">{items.length} fatura{noView ? ` · ${noView} görselsiz (özet basılır)` : ''}</span>
          <div class="spacer" />
          <button class="primary" disabled={items.length === 0} onClick={() => S.startPrint(items, { pageBreak, strip, summary })}>Yazdır ({items.length}) <kbd>Enter</kbd></button>
          <button class="ghost" onClick={() => S.closePrint()}>Kapat <kbd>Esc</kbd></button>
        </div>
        <div class="print-body">
          <div class="print-opts">
            <fieldset>
              <legend>Hangi faturalar</legend>
              {([['all', `Tümü (${all.length})`], ['selected', `Seçili (${selectedNos.size})`], ['visible', `Listede görünenler (${visible.length})`]] as [Source, string][]).map(([v, l]) => (
                <label class="radio"><input type="radio" name="psrc" checked={source === v} disabled={v === 'selected' && selectedNos.size === 0} onChange={() => { setSource(v); setManual(null); }} /><span>{l}</span></label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Sıra</legend>
              {(Object.keys(ORDER_LABELS) as Order[]).map((v) => (
                <label class="radio"><input type="radio" name="pord" checked={order === v} onChange={() => { setOrder(v); setManual(null); }} /><span>{ORDER_LABELS[v]}</span></label>
              ))}
              <label class="radio"><input type="checkbox" checked={reverse} onChange={(e) => { setReverse((e.currentTarget as HTMLInputElement).checked); setManual(null); }} /><span>Tersten</span></label>
              {manual && <div class="muted small">Elle düzenlendi. <button class="ghost tiny" onClick={() => setManual(null)}>Sıfırla</button></div>}
            </fieldset>
            <fieldset>
              <legend>Sayfa</legend>
              <label class="radio"><input type="checkbox" checked={pageBreak} onChange={(e) => setPageBreak((e.currentTarget as HTMLInputElement).checked)} /><span>Her fatura yeni sayfada</span></label>
              <label class="radio"><input type="checkbox" checked={strip} onChange={(e) => setStrip((e.currentTarget as HTMLInputElement).checked)} /><span>Üstte bilgi şeridi (sıra · fatura no · tarih · hesap kodu)</span></label>
              <label class="radio"><input type="checkbox" checked={summary} onChange={(e) => setSummary((e.currentTarget as HTMLInputElement).checked)} /><span>Başta özet listesi (bir sayfa tablo)</span></label>
              <div class="muted small">Yazdırma penceresinde "PDF olarak kaydet" seçilirse tek dosya üretilir. Faturalar resmî görünümleriyle, sayfa genişliğine sığacak şekilde basılır.</div>
            </fieldset>
          </div>
          <div class="print-list">
            <div class="muted small" style="padding:4px 10px">Sürükleyerek sırayı değiştirebilirsiniz.</div>
            {items.map((i, k) => {
              const c = S.assignments.value.get(i.no);
              return (
                <div
                  class={`print-row ${dragNo === i.no ? 'dragging' : ''}`}
                  draggable
                  onDragStart={(e) => { setDragNo(i.no); e.dataTransfer?.setData('text/plain', i.no); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={(e) => { e.preventDefault(); const from = e.dataTransfer?.getData('text/plain') || dragNo; if (from) move(from, i.no); setDragNo(null); }}
                  onDragEnd={() => setDragNo(null)}
                  onDblClick={() => { S.closePrint(); S.goTo(S.invoices.value.indexOf(i)); }}
                  onMouseEnter={() => setHoverNo(i.no)}
                  title="Sürükle: sırala · çift tık: faturaya git"
                >
                  <span class="print-n">{k + 1}</span>
                  <span class="print-main"><span class="row-name">{i.supplierName}</span><span class="row-sub">{i.no} · {i.date} · {fmtAmount(i.amount, i.currency)}</span></span>
                  <span class={`print-code slot-${S.slotIndexOf(c)}`}>{c ?? '—'}</span>
                  <span class="print-grip" aria-hidden>⋮⋮</span>
                </div>
              );
            })}
            {items.length === 0 && <div class="chart-empty">Yazdırılacak fatura yok.</div>}
          </div>
          <div class="print-preview" onMouseEnter={() => undefined}>
            <div class="print-preview-head muted small">{previewInv ? `${items.indexOf(previewInv) + 1}. ${previewInv.no}` : 'Önizleme'}</div>
            <div class="print-preview-page">
              {preview && preview.no === previewNo && <iframe class="print-preview-frame" sandbox="allow-same-origin" srcdoc={preview.html} title="önizleme" />}
            </div>
            <div class="muted small">Basılacak görünüm: faturanın kendi şablonu (EDM PDF'i ile aynı).</div>
          </div>
        </div>
      </div>
    </div>
  );
}
