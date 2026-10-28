import { useEffect, useMemo, useState } from 'preact/hooks';
import * as S from './state';
import { fmtAmount } from './InvoiceCard';
import type { Invoice, FilterMode } from '../core/types';
import { sortPlan, describePlan, DEFAULT_PLAN_SORT, KEY_LABELS, DIR_LABELS, type PlanSort, type SortKey, type Dir } from '../core/printSort';

type Source = 'all' | 'selected' | 'visible';
/** Yazdırma planı: kaynak, sıra, elle düzenleme ve seçenekler; yazdırma tarayıcıdan yapılır (PDF olarak kaydetmek dahil). */
export function PrintModal() {
  const all = S.invoices.value;
  const selectedNos = S.selected.value;
  const visible = all.filter(S.passesFilter);
  const [source, setSource] = useState<Source>(selectedNos.size ? 'selected' : 'all');
  const [sort, setSort] = useState<PlanSort>(DEFAULT_PLAN_SORT);
  const setS = (p: Partial<PlanSort>) => { setSort({ ...sort, ...p }); setManual(null); };
  const [pageBreak, setPageBreak] = useState(true);
  const [strip, setStrip] = useState(true);
  const [summary, setSummary] = useState(false);
  const CHUNK_SUGGEST = 60;
  const [chunkOn, setChunkOn] = useState<boolean | null>(null); // null = otomatik (eşik üstünde açık)
  const [chunkSize, setChunkSize] = useState(50);
  const [manual, setManual] = useState<string[] | null>(null); // elle sürüklenmiş sıra (fatura no listesi)
  const [pfilter, setPfilter] = useState<FilterMode>('all');
  const [psearch, setPsearch] = useState('');
  const [excluded, setExcluded] = useState<Set<string>>(new Set()); // işareti kaldırılanlar
  const [dragNo, setDragNo] = useState<string | null>(null);


  const pool = source === 'selected' ? all.filter((i) => selectedNos.has(i.no)) : source === 'visible' ? visible : all;
  const q = psearch.trim().toLocaleLowerCase('tr');
  const base = pool.filter((i) => {
    const code = S.assignments.value.get(i.no);
    const bulk = S.bulkNos.value.has(i.no);
    const ruled = S.ruleNos.value.has(i.no);
    if (pfilter === 'unassigned' && code) return false;
    if (pfilter === 'manual' && (!code || bulk || ruled)) return false;
    if (pfilter === 'bulk' && !bulk) return false;
    if (pfilter === 'rule' && !ruled) return false;
    if (q && !(S.matchesSearch(i, q) || (code ?? '').toLocaleLowerCase('tr').includes(q))) return false;
    return true;
  });
  const auto = useMemo(() => sortPlan(base, sort, S.assignments.value), [base, sort, S.assignments.value]);
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
  const toPrint = items.filter((i) => !excluded.has(i.no));
  const noView = toPrint.filter((i) => !i.hasView).length;
  const useChunks = (chunkOn ?? toPrint.length > CHUNK_SUGGEST) && toPrint.length > chunkSize;
  const toggle = (no: string) => { const s = new Set(excluded); if (s.has(no)) s.delete(no); else s.add(no); setExcluded(s); };
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
      <div class="modal print-modal" onClick={(e) => e.stopPropagation()} onKeyDownCapture={(e) => { if (e.key === 'Escape') { const t = e.target as HTMLInputElement; e.stopPropagation(); e.preventDefault(); if (t?.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'radio' && t.value) { setPsearch(''); setManual(null); return; } S.closePrint(); } }}>
        <div class="modal-head">
          <b>Yazdırma planı</b>
          <span class="muted">{toPrint.length}{toPrint.length !== items.length ? ` / ${items.length}` : ''} fatura{noView ? ` · ${noView} XML'siz (özet basılır)` : ''}</span>
          <div class="spacer" />
          <button class="primary" disabled={toPrint.length === 0} onClick={() => S.startPrint(toPrint, { pageBreak, strip, summary, chunk: useChunks ? chunkSize : 0 })}>Yazdır ({toPrint.length}{useChunks ? ` · ${Math.ceil(toPrint.length / chunkSize)} parça` : ''}) <kbd>Enter</kbd></button>
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
              <legend>Süz</legend>
              <select value={pfilter} onChange={(e) => { setPfilter((e.currentTarget as HTMLSelectElement).value as FilterMode); setManual(null); }} onKeyDown={(e) => e.stopPropagation()}>
                {(Object.keys(S.FILTER_LABELS) as FilterMode[]).map((m) => <option value={m}>{S.FILTER_LABELS[m]}</option>)}
              </select>
              <input placeholder={`${S.SEARCH_HINT}, hesap kodu`} value={psearch} onInput={(e) => { setPsearch((e.currentTarget as HTMLInputElement).value); setManual(null); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { setPsearch(''); (e.currentTarget as HTMLInputElement).blur(); } }} />
              <div class="muted small">{base.length} / {pool.length} fatura süzgeçten geçti. Listedeki kutucuklarla tek tek de seçebilirsiniz.</div>
            </fieldset>
            <fieldset>
              <legend>Sıra</legend>
              <label><span>Önce şuna göre diz</span>
                <div class="sort-pair">
                  <select value={sort.primary} onChange={(e) => { const k = (e.currentTarget as HTMLSelectElement).value as SortKey; setS({ primary: k, secondary: sort.secondary === k ? (k === 'no' ? 'date' : 'no') : sort.secondary }); }} onKeyDown={(e) => e.stopPropagation()}>
                    {(Object.keys(KEY_LABELS) as SortKey[]).map((k) => <option value={k}>{KEY_LABELS[k]}</option>)}
                  </select>
                  <select value={sort.dir} onChange={(e) => setS({ dir: (e.currentTarget as HTMLSelectElement).value as Dir })} onKeyDown={(e) => e.stopPropagation()}>
                    <option value="asc">{DIR_LABELS[sort.primary][0]}</option><option value="desc">{DIR_LABELS[sort.primary][1]}</option>
                  </select>
                </div>
              </label>
              <label><span>Eşit olanları şuna göre diz</span>
                <div class="sort-pair">
                  <select value={sort.secondary} onChange={(e) => setS({ secondary: (e.currentTarget as HTMLSelectElement).value as SortKey })} onKeyDown={(e) => e.stopPropagation()}>
                    {(Object.keys(KEY_LABELS) as SortKey[]).filter((k) => k !== sort.primary).map((k) => <option value={k}>{KEY_LABELS[k]}</option>)}
                  </select>
                  <select value={sort.dir2} onChange={(e) => setS({ dir2: (e.currentTarget as HTMLSelectElement).value as Dir })} onKeyDown={(e) => e.stopPropagation()}>
                    <option value="asc">{DIR_LABELS[sort.secondary][0]}</option><option value="desc">{DIR_LABELS[sort.secondary][1]}</option>
                  </select>
                </div>
              </label>
              <label class="radio"><input type="checkbox" checked={sort.groupSupplier} disabled={sort.primary === 'supplier'} onChange={(e) => setS({ groupSupplier: (e.currentTarget as HTMLInputElement).checked })} /><span>Aynı satıcının faturaları bir arada dursun</span></label>
              {(() => { const d = describePlan(sort, toPrint, S.assignments.value); return (
                <div class="sort-explain">
                  <div>{d.summary}</div>
                  <div class="sort-ends"><span><b>En üstte:</b> {d.top}</span><span><b>En altta:</b> {d.bottom}</span></div>
                </div>
              ); })()}
              {manual && <div class="muted small">Sırayı elle değiştirdiniz; açıklama otomatik sırayı anlatır. <button class="ghost tiny" onClick={() => setManual(null)}>Otomatik sıraya dön</button></div>}
            </fieldset>
            <fieldset>
              <legend>Sayfa</legend>
              <label class="radio"><input type="checkbox" checked={pageBreak} onChange={(e) => setPageBreak((e.currentTarget as HTMLInputElement).checked)} /><span>Her fatura yeni sayfada</span></label>
              <label class="radio"><input type="checkbox" checked={strip} onChange={(e) => setStrip((e.currentTarget as HTMLInputElement).checked)} /><span>Üstte bilgi şeridi (sıra · fatura no · tarih · hesap kodu)</span></label>
              <label class="radio"><input type="checkbox" checked={summary} onChange={(e) => setSummary((e.currentTarget as HTMLInputElement).checked)} /><span>Başta özet listesi (bir sayfa tablo)</span></label>
              <label class="radio"><input type="checkbox" checked={useChunks} disabled={toPrint.length <= chunkSize && !useChunks} onChange={(e) => setChunkOn((e.currentTarget as HTMLInputElement).checked)} /><span>Parçalara böl: her parça
                <select class="inline-select" value={chunkSize} onChange={(e) => setChunkSize(Number((e.currentTarget as HTMLSelectElement).value))} onKeyDown={(e) => e.stopPropagation()}>{[25, 50, 100].map((n) => <option value={n}>{n}</option>)}</select> fatura
                {useChunks && <> → <b>{Math.ceil(toPrint.length / chunkSize)} parça</b>, sırayla kendiliğinden</>}</span></label>
              {toPrint.length > CHUNK_SUGGEST && <div class="muted small">{toPrint.length} faturayı tek seferde basmak eski bilgisayarları zorlayabilir; bu yüzden parçalı yazdırma kendiliğinden açıldı. Her parça için yazdırma penceresi açılır, sonraki parça otomatik hazırlanır; numaralar kesintisiz devam eder.</div>}
              <div class="muted small">Yazdırma penceresinde "PDF olarak kaydet" seçilirse (parça başına) tek dosya üretilir. Faturalar resmî görünümleriyle, sayfa genişliğine sığacak şekilde basılır.</div>
            </fieldset>
          </div>
          <div class="print-list">
            <div class="print-list-head">
              <input type="checkbox" title="Tümünü işaretle / kaldır" checked={items.length > 0 && toPrint.length === items.length} onChange={(e) => setExcluded((e.currentTarget as HTMLInputElement).checked ? new Set() : new Set(items.map((i) => i.no)))} />
              <span class="muted small">{toPrint.length} işaretli · sürükleyerek sırayı değiştirebilirsiniz</span>
              {excluded.size > 0 && <button class="ghost tiny" onClick={() => setExcluded(new Set())}>Hepsini işaretle</button>}
            </div>
            {items.map((i, k) => {
              const c = S.assignments.value.get(i.no);
              return (
                <div
                  class={`print-row ${dragNo === i.no ? 'dragging' : ''} ${excluded.has(i.no) ? 'off' : ''}`}
                  draggable
                  onDragStart={(e) => { setDragNo(i.no); e.dataTransfer?.setData('text/plain', i.no); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={(e) => { e.preventDefault(); const from = e.dataTransfer?.getData('text/plain') || dragNo; if (from) move(from, i.no); setDragNo(null); }}
                  onDragEnd={() => setDragNo(null)}
                  onDblClick={() => { S.closePrint(); S.goTo(S.invoices.value.indexOf(i)); }}
                  onMouseEnter={() => setHoverNo(i.no)}
                  title="Sürükle: sırala · çift tık: faturaya git"
                >
                  <input type="checkbox" class="print-check" checked={!excluded.has(i.no)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(i.no)} title="Bu faturayı bas / basma" />
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
