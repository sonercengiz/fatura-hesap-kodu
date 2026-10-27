import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from './state';
import { ruleLabel } from '../core/rules';
import { BulkBar } from './SidePanel';
import { fmtAmount } from './InvoiceCard';
import { SORT_LABELS, type SortMode } from '../core/sort';
import { LIST_COLUMNS, type FilterMode, type ListColumnId } from '../core/types';

/** Yalın liste görünümü: tam genişlikte tablo; kısayollar, manuel giriş, toplu seçim ve filtreler aynen çalışır. */
export function ListView() {
  const idx = S.currentIndex.value;
  const box = useRef<HTMLDivElement>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const cols = S.settings.value.listColumns;
  const show = (id: ListColumnId) => cols.includes(id);
  const inv = S.current.value;

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('tr.current')?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  useEffect(() => {
    if (!colsOpen) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.cols-pop, .cols-btn')) setColsOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [colsOpen]);

  const rule = inv ? S.ruleFor.value.get(inv.no) : undefined;
  const code = inv ? S.assignments.value.get(inv.no) : undefined;
  const hint = inv && !rule && S.hint.value && S.hint.value.code !== code ? S.hint.value : null;

  return (
    <main class="listview">
      <div class="lv-head">
        <input
          id="search"
          class="search lv-search"
          placeholder="Ara: no, satıcı, VKN, tutar  (Ctrl+F)"
          value={S.searchText.value}
          onInput={(e) => (S.searchText.value = (e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { S.searchText.value = ''; (e.currentTarget as HTMLInputElement).blur(); }
            if (e.key === 'Enter') { const first = S.invoices.value.findIndex((i) => S.passesFilter(i)); if (first >= 0) S.goTo(first); (e.currentTarget as HTMLInputElement).blur(); }
          }}
        />
        <select class="sort-select" value={S.settings.value.sortMode} title="Liste sırası (çıktı her zaman tarih sırasındadır)" onChange={(e) => S.setSortMode((e.currentTarget as HTMLSelectElement).value as SortMode)}>
          {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => <option value={m}>Sıra: {SORT_LABELS[m]}</option>)}
        </select>
        <select class="filter-select" value={S.filterMode.value} title="Hangi faturalar listelensin ve gezilsin" onChange={(e) => S.setFilter((e.currentTarget as HTMLSelectElement).value as FilterMode)}>
          {(Object.keys(S.FILTER_LABELS) as FilterMode[]).map((m) => <option value={m}>Göster: {S.FILTER_LABELS[m]}</option>)}
        </select>
        <button class={`tiny bulk-toggle ${S.bulkMode.value || S.selected.value.size ? 'on' : ''}`} title="Toplu seçim yardımcılarını aç/kapat" onClick={() => (S.bulkMode.value = !S.bulkMode.value)}>☑ Seç</button>
        <div class="cols-wrap">
          <button class="tiny cols-btn" title="Gösterilecek sütunlar" onClick={() => setColsOpen(!colsOpen)}>Sütunlar ▾</button>
          {colsOpen && (
            <div class="cols-pop">
              {LIST_COLUMNS.map((c) => (
                <label class="cols-item">
                  <input type="checkbox" checked={show(c.id)} disabled={c.id === 'code'} onChange={() => S.toggleColumn(c.id)} />
                  <span>{c.label}</span>
                </label>
              ))}
              <div class="muted small">Seçim bu tarayıcıda hatırlanır. Çıktı dosyasını etkilemez.</div>
            </div>
          )}
        </div>
        <div class="spacer" />
        {inv && rule && rule.code !== code && (
          <button class="hint lv-hint" onClick={() => S.assign(rule.code)} title={`${rule.batchId ? 'Dönem kuralı' : 'Kalıcı kural'}: ${ruleLabel(rule)}`}>
            {rule.batchId ? 'Dönem kuralı' : 'Kural'}: <b>{rule.code}</b> <kbd>Boşluk</kbd>
          </button>
        )}
        {hint && (
          <button class="hint lv-hint" onClick={() => S.assign(hint.code)} title="Bu satıcıya daha önce verilen kodu ata (Boşluk)">
            Bu satıcıya önce: <b>{hint.code}</b> <span class="muted">×{hint.count}</span> <kbd>Boşluk</kbd>
          </button>
        )}
        {S.firms.value.length > 1 && <button class="ghost tiny" title="Bu dönemi ya da seçili faturaları başka firmaya taşı" onClick={() => (S.moveOpen.value = true)}>taşı</button>}
        <span class="muted small">{S.invoices.value.filter(S.passesFilter).length} / {S.invoices.value.length} fatura · çift tık: görseli aç</span>
      </div>
      <div class="lv-bulk"><BulkBar /></div>
      <div class="table-box lv-table" ref={box}>
        <table>
          <thead>
            <tr>
              <th class="lv-check"><input type="checkbox" title="Görünenleri seç / bırak" checked={S.selected.value.size > 0 && S.invoices.value.filter(S.passesFilter).every((i) => S.selected.value.has(i.no))} onChange={(e) => ((e.currentTarget as HTMLInputElement).checked ? S.selectVisible() : S.clearSelection())} /></th>
              <th class="num">#</th>
              {LIST_COLUMNS.filter((c) => show(c.id)).map((c) => <th class={`lv-${c.id}`}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {S.invoices.value.map((i, k) => {
              if (!S.passesFilter(i) && k !== idx) return null;
              const c = S.assignments.value.get(i.no);
              const iss = S.attentionIssues(i);
              const sel = S.selected.value.has(i.no);
              const bulk = S.bulkNos.value.has(i.no);
              const ruled = S.ruleNos.value.has(i.no);
              const si = S.slotIndexOf(c);
              const src = bulk ? 'toplu' : ruled ? 'kural' : c ? 'elle' : '';
              return (
                <tr
                  class={`row ${k === idx ? 'current' : ''} ${c ? `done slot-row-${si}` : ''} ${sel ? 'selected' : ''} ${bulk || ruled ? 'bulk' : ''}`}
                  onClick={(e) => {
                    if (e.shiftKey && S.lastClicked.value >= 0) { S.selectRange(S.lastClicked.value, k); S.lastClicked.value = k; return; }
                    if (e.ctrlKey || e.metaKey) { S.toggleSelect(i.no); S.lastClicked.value = k; return; }
                    S.lastClicked.value = k;
                    S.goTo(k);
                  }}
                  onDblClick={() => S.setLayout('hybrid', i.no)}
                >
                  <td class="lv-check"><input type="checkbox" class="row-check" checked={sel} onClick={(e) => { e.stopPropagation(); const ev = e as MouseEvent; if (ev.shiftKey && S.lastClicked.value >= 0) S.selectRange(S.lastClicked.value, k); else S.toggleSelect(i.no); S.lastClicked.value = k; }} /></td>
                  <td class="num">{k + 1}</td>
                  {show('no') && <td class="mono">{i.no}</td>}
                  {show('date') && <td class="mono">{i.date}</td>}
                  {show('supplier') && <td class="lv-supplier" title={i.supplierName}>{i.supplierName}</td>}
                  {show('vkn') && <td class="mono">{i.supplierVkn}</td>}
                  {show('type') && <td>{i.invoiceType}</td>}
                  {show('profile') && <td>{i.profile}</td>}
                  {show('amount') && <td class="r">{fmtAmount(i.amount, '')}</td>}
                  {show('taxExclusive') && <td class="r">{fmtAmount(i.taxExclusive, '')}</td>}
                  {show('tax') && <td class="r">{fmtAmount(i.taxAmount, '')}</td>}
                  {show('currency') && <td>{i.currency}</td>}
                  {show('lines') && <td class="r">{i.lineCount ?? ''}</td>}
                  {show('source') && <td class="muted">{src}</td>}
                  <td class={`lv-code code-col slot-${si}`} title="Tıkla: kodu elle yaz" onClick={(e) => { e.stopPropagation(); S.goTo(k); S.enterManual(c ?? ''); }}>
                    <span class="row-code">{c ?? <span class="muted">—</span>}</span>
                  </td>
                  {show('account') && <td class="lv-account muted" title={c ? S.accountMap.value.get(c) : ''}>{c ? S.accountMap.value.get(c) ?? '' : ''}</td>}
                  {show('issues') && <td class="lv-issues">{iss.length > 0 && <span class="warn" title={iss.map((x) => S.ISSUE_LABEL[x]).join('\n')}>! {iss.map((x) => S.ISSUE_LABEL[x]).join(' · ')}</span>}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {S.invoices.value.length === 0 && <div class="pdf-status">Bu dönemde fatura yok. XML yükleyin.</div>}
      </div>
    </main>
  );
}
