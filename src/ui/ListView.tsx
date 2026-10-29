import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from './state';
import { BulkBar, MoveButton, RemoveButton, RuleActions } from './SidePanel';
import { fmtAmount } from './InvoiceCard';
import { SORT_LABELS, type SortMode } from '../core/sort';
import type { FilterMode, ListColumnId } from '../core/types';
import { fieldOf, ROW_ORDER_LABELS, type ExpandedColumn } from '../core/excel/template';
import type { CellValue } from '../core/types';
import { HeaderCell, AddColumnSelect, SkipEmptyToggle, scopeNote, skippedCount } from './TemplateParts';

const readShowEmpty = () => { try { return localStorage.getItem('listShowEmpty') === '1'; } catch { return false; } };
const MONO = new Set<ListColumnId>(['no', 'date', 'vkn', 'uuid']);

/** Bir alan hücresi: para sağa yaslı Türkçe biçimli, numara/VKN/ETTN eşit aralıklı, satıcı ve hesap adı kırpılır */
function cell(col: ExpandedColumn, v: CellValue) {
  const id = col.id as ListColumnId;
  if (fieldOf(col).money) return <td class="r">{typeof v === 'number' ? fmtAmount(v, '') : String(v ?? '')}</td>;
  const t = v == null ? '' : String(v);
  if (MONO.has(id)) return <td class="mono">{t}</td>;
  if (id === 'name') return <td class="lv-supplier" title={t}>{t}</td>;
  if (id === 'accountName') return <td class="lv-account muted" title={t}>{t}</td>;
  if (typeof v === 'number') return <td class="r">{t}</td>;
  return <td class="lv-text" title={t.length > 30 ? t : undefined}>{t}</td>;
}

/** Yalın liste görünümü: tam genişlikte tablo; kısayollar, elle giriş, toplu seçim ve filtreler aynen çalışır. */
export function ListView() {
  const idx = S.currentIndex.value;
  const box = useRef<HTMLDivElement>(null);
  const [showEmpty, setShowEmptyState] = useState(readShowEmpty);
  const setShowEmpty = (v: boolean) => { setShowEmptyState(v); try { localStorage.setItem('listShowEmpty', v ? '1' : '0'); } catch { /* yok say */ } };
  const t = S.outputTemplate.value;
  // Liste Excel'e yazılan (açılmış) sütunları gösterir: KDV dökümü dönemdeki oranlara açılmış halde
  const e = S.expandedTemplate.value;
  const ctx = S.outputContext();
  const inv = S.current.value;
  // Liste = Excel şablonu (aynı sütunlar, sıra, başlıklar); burada yapılan değişiklik Excel'i de değiştirir. Boş sütun (başlıksız) ve
  // dönemde bütün satırlarda boş olan sütunlar yalnızca ekranda gizlenir (Excel'e yine yazılır); no ve hesap kodu hep görünür.
  // "Boş" = Excel'e girecek faturaların hepsinde boş (Excel'deki atlama ile aynı ölçü)
  const empty = S.emptyCols.value;
  // Bilerek "boş da olsa yaz" denen (keep) sütun gizlenmez
  const hidden = e.columns.map((c, k) => (c.id === 'blank' || (!showEmpty && empty.has(k) && !c.keep) ? k : -1)).filter((k) => k >= 0);
  const emptyCount = skippedCount(e, empty);
  const cols: { id: ListColumnId; k: number }[] = [...e.columns.map((c, k) => ({ id: c.id as ListColumnId, k })).filter((c) => !hidden.includes(c.k)), { id: 'issues', k: -1 }];

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('tr.current')?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  const rule = inv ? S.ruleFor.value.get(inv.no) : undefined;
  const code = inv ? S.assignments.value.get(inv.no) : undefined;
  const hint = inv && !rule && S.hint.value && S.hint.value.code !== code ? S.hint.value : null;

  return (
    <main class="listview">
      <div class="lv-head">
        <input
          id="search"
          class="search lv-search"
          placeholder={`${S.SEARCH_HINT}  (Ctrl+F)`}
          value={S.searchText.value}
          onInput={(e) => (S.searchText.value = (e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { S.searchText.value = ''; (e.currentTarget as HTMLInputElement).blur(); }
            if (e.key === 'Enter') { const first = S.invoices.value.findIndex((i) => S.passesFilter(i)); if (first >= 0) S.goTo(first); (e.currentTarget as HTMLInputElement).blur(); }
          }}
        />
        <select class="sort-select" value={S.settings.value.sortMode} title={`Ekrandaki liste sırası. Excel'in satır sırası şablondan gelir: ${ROW_ORDER_LABELS[S.outputTemplate.value.rowOrder]}`} onChange={(e) => S.setSortMode((e.currentTarget as HTMLSelectElement).value as SortMode)}>
          {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => <option value={m}>Sıra: {SORT_LABELS[m]}</option>)}
        </select>
        <select class="filter-select" value={S.filterMode.value} title="Hangi faturalar listelensin ve gezilsin" onChange={(e) => S.setFilter((e.currentTarget as HTMLSelectElement).value as FilterMode)}>
          {(Object.keys(S.FILTER_LABELS) as FilterMode[]).map((m) => <option value={m}>Göster: {S.FILTER_LABELS[m]}</option>)}
        </select>
        <button class={`tiny bulk-toggle ${S.bulkMode.value || S.selected.value.size ? 'on' : ''}`} title="Toplu seçim yardımcılarını aç/kapat" onClick={() => (S.bulkMode.value = !S.bulkMode.value)}>☑ Seç</button>
        <div class="lv-cols" title={`Liste, Excel şablonunun aynısıdır: başlığa tıklayıp adını değiştirin, sürükleyip sırasını değiştirin, ✕ ile kaldırın. Değişiklik Excel'e de yansır (${scopeNote(S.templateScope.value)}).`}>
          <AddColumnSelect t={t} />
          <SkipEmptyToggle t={t} empty={emptyCount} />
          {emptyCount > 0 && (
            <button class="tiny ghost lv-empty" onClick={() => setShowEmpty(!showEmpty)} title={`Bu dönemde bütün satırlarda boş olan sütunlar (çoğunlukla EDM listesi yüklenmediği için). Göz atmak için açabilirsiniz. ${t.keepEmpty ? 'Excel\'e yine yazılırlar ("Boş sütunları atla" kapalı).' : 'Excel\'e yazılmazlar ("Boş sütunları atla" açık).'}`}>
              Boş sütunlar ({emptyCount}) · {showEmpty ? 'Gizle' : 'Göster'}
            </button>
          )}
          <button class="tiny ghost" onClick={() => (S.templateOpen.value = true)}>Şablon…</button>
        </div>
        <div class="spacer" />
        {inv && <RuleActions inv={inv} code={code} compact />}
        {hint && (
          <button class="hint lv-hint" onClick={() => S.assign(hint.code)} title="Bu satıcıya daha önce verilen kodu ata (Boşluk)">
            Bu satıcıya önce: <b>{hint.code}</b> <span class="muted">×{hint.count}</span> <kbd>Boşluk</kbd>
          </button>
        )}
        <RemoveButton />
        <MoveButton />
        <span class="muted small">{S.invoices.value.filter(S.passesFilter).length} / {S.invoices.value.length} fatura · çift tık: Görsel görünümde aç</span>
      </div>
      <div class="lv-bulk"><BulkBar /></div>
      <div class="table-box lv-table" ref={box}>
        <table>
          <thead>
            <tr>
              <th class="lv-check"><input type="checkbox" title="Görünenleri seç / bırak" checked={S.selected.value.size > 0 && S.invoices.value.filter(S.passesFilter).every((i) => S.selected.value.has(i.no))} onChange={(e) => ((e.currentTarget as HTMLInputElement).checked ? S.selectVisible() : S.clearSelection())} /></th>
              <th class="num">#</th>
              {cols.map((c) => (c.id === 'issues' ? <th class="lv-issues" title="Yalnızca listede: uyarılar (Excel'e girmez)">Dikkat</th> : <HeaderCell t={t} col={e.columns[c.k]} letter={S.excelLetters.value[c.k]} cls={`lv-${c.id}`} />))}
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
              const src = bulk ? 'Toplu' : ruled ? 'Kural' : c ? 'Elle' : '';
              return (
                <tr
                  class={`row ${k === idx ? 'current' : ''} ${c ? `done slot-row-${si}` : ''} ${sel ? 'selected' : ''} ${bulk || ruled ? 'bulk' : ''} ${i.excluded ? 'excluded' : ''}`}
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
                  {cols.map(({ id, k: ck }) => {
                    if (id === 'code') return (
                      <td class={`lv-code code-col slot-${si}`} title="Tıkla: kodu elle yaz" onClick={(e) => { e.stopPropagation(); S.goTo(k); S.enterManual(c ?? ''); }}>
                        <span class="row-code">{i.excluded && <span class="excl-tag" title="Excel'e girmez">Hariç</span>}{c ?? <span class="muted">—</span>}</span>
                      </td>
                    );
                    if (id === 'issues') return <td class="lv-issues">{iss.length > 0 && <span class="warn" title={iss.map((x) => S.issueText(i, x)).join('\n')}>! {iss.map((x) => S.ISSUE_LABEL[x]).join(' · ')}</span>}</td>;
                    if (id === 'source') return <td class="muted">{src}</td>;
                    return cell(e.columns[ck], fieldOf(e.columns[ck]).value(i, ctx));
                  })}
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
