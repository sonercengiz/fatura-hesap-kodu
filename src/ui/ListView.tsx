import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from './state';
import { BulkBar, MoveButton, RemoveButton, RuleActions } from './SidePanel';
import { fmtAmount } from './InvoiceCard';
import { SORT_LABELS, type SortMode } from '../core/sort';
import { DEFAULT_LIST_COLUMNS, normalizeListColumns, type FilterMode, type ListColumnId } from '../core/types';
import { FIELD_DEFS, KDV_FIELD_IDS, ROW_ORDER_LABELS, type OutputFieldId } from '../core/excel/template';
import type { CellValue } from '../core/types';

/** Listede kısa başlıklar; diğer alanlarda Excel'deki başlık */
const SHORT: Partial<Record<ListColumnId, string>> = { date: 'Tarih', name: 'Satıcı', vkn: 'VKN / TCKN', type: 'Tip', profile: 'Tür', amount: 'Tutar', taxExclusive: 'Matrah', tax: 'Vergi', currency: 'Döviz', lineCount: 'Kalem', source: 'Kaynak', accountName: 'Hesap adı', issues: 'Dikkat' };
const colLabel = (id: ListColumnId) => SHORT[id] ?? (id === 'issues' ? 'Dikkat' : FIELD_DEFS[id].header || FIELD_DEFS[id].label);
const isField = (id: string) => id in FIELD_DEFS;
/** Eklenebilecek alanlar: boş sütun hariç bütün çıktı alanları + Dikkat */
const ALL_LIST_IDS: ListColumnId[] = [...(Object.keys(FIELD_DEFS) as OutputFieldId[]).filter((id) => id !== 'blank'), 'issues'];
const MONO = new Set<ListColumnId>(['no', 'date', 'vkn', 'uuid']);

/** Bir alan hücresi: para sağa yaslı Türkçe biçimli, numara/VKN/ETTN eşit aralıklı, satıcı ve hesap adı kırpılır */
function cell(id: OutputFieldId, v: CellValue) {
  if (FIELD_DEFS[id].money) return <td class="r">{typeof v === 'number' ? fmtAmount(v, '') : String(v ?? '')}</td>;
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
  const [colsOpen, setColsOpen] = useState(false);
  const follow = S.settings.value.listFollowsTemplate;
  const own = normalizeListColumns(S.settings.value.listColumns, isField);
  // Excel şablonuyla aynı: şablonun sütunları, sırası ve başlıkları (boş sütun hariç) + listede Dikkat
  const cols: { id: ListColumnId; head: string }[] = follow
    ? [...S.outputTemplate.value.columns.filter((c) => c.id !== 'blank').map((c) => ({ id: c.id as ListColumnId, head: c.header || colLabel(c.id) })), { id: 'issues', head: 'Dikkat' }]
    : own.map((id) => ({ id, head: colLabel(id) }));
  const ctx = S.outputContext();
  const inv = S.current.value;
  const stop = (e: KeyboardEvent) => e.stopPropagation();
  const moveCol = (k: number, d: -1 | 1) => { const a = own.slice(); const j = k + d; if (j < 0 || j >= a.length) return; [a[k], a[j]] = [a[j], a[k]]; S.setListColumns(a); };
  const addable = ALL_LIST_IDS.filter((id) => !own.includes(id));
  const missingKdv = KDV_FIELD_IDS.filter((id) => !own.includes(id));
  const openTemplate = () => { setColsOpen(false); S.templateOpen.value = true; };

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
        <div class="cols-wrap">
          <button class="tiny cols-btn" title="Gösterilecek sütunlar" onClick={() => setColsOpen(!colsOpen)}>Sütunlar ▾</button>
          {colsOpen && (
            <div class="cols-pop">
              <div class="cols-mode">
                <label><input type="radio" name="lv-cols" checked={!follow} onChange={() => S.setListFollowsTemplate(false)} /> Kendi seçimim</label>
                <label title="Liste, açık firmanın Excel şablonundaki sütunları aynı sırayla ve aynı başlıklarla gösterir"><input type="radio" name="lv-cols" checked={follow} onChange={() => S.setListFollowsTemplate(true)} /> Excel şablonuyla aynı</label>
              </div>
              {follow ? (
                <div class="muted small cols-note">Liste, <b>{S.firm.value.name}</b> firmasının Excel şablonunu ({S.outputTemplate.value.columns.length} sütun) aynı sırayla ve başlıklarla gösterir; ekranda ne görüyorsanız Excel'e o çıkar. Sona yalnızca listede olan "Dikkat" eklenir.</div>
              ) : (
                <>
                  <div class="cols-list">
                    {own.map((id, k) => (
                      <div class={`cols-row ${id === 'code' ? 'is-code' : ''}`}>
                        <span class="cols-name" title={id === 'issues' ? 'Uyarılar (yalnızca listede)' : FIELD_DEFS[id].label}>{colLabel(id)}</span>
                        <button class="ghost tiny" title="Sola (yukarı)" disabled={k === 0} onClick={() => moveCol(k, -1)}>↑</button>
                        <button class="ghost tiny" title="Sağa (aşağı)" disabled={k === own.length - 1} onClick={() => moveCol(k, 1)}>↓</button>
                        <button class="ghost tiny" title="Sütunu kaldır" disabled={own.length === 1} onClick={() => S.setListColumns(own.filter((x) => x !== id))}>✕</button>
                      </div>
                    ))}
                  </div>
                  <select class="cols-add" value="" onKeyDown={stop} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value as ListColumnId; if (v) S.setListColumns([...own, v]); }}>
                    <option value="">+ Sütun ekle…</option>
                    {addable.map((id) => <option value={id}>{id === 'issues' ? 'Dikkat (uyarılar)' : FIELD_DEFS[id].label}</option>)}
                  </select>
                  <div class="cols-foot">
                    {missingKdv.length > 0 && <button class="tiny" onClick={() => S.setListColumns([...own, ...missingKdv])} title="KDV oranına göre matrah ve KDV sütunları">+ KDV dökümü</button>}
                    <button class="tiny ghost" onClick={() => S.setListColumns(DEFAULT_LIST_COLUMNS)}>Varsayılana dön</button>
                  </div>
                  <div class="muted small cols-note">Seçim bu tarayıcıda hatırlanır; Excel dosyasını etkilemez.</div>
                </>
              )}
              <button class="tiny cols-tpl" onClick={openTemplate}>Excel şablonunu düzenle ({S.firm.value.name})…</button>
            </div>
          )}
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
              {cols.map((c) => <th class={`lv-${c.id}`}>{c.head}</th>)}
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
                  {cols.map(({ id }) => {
                    if (id === 'code') return (
                      <td class={`lv-code code-col slot-${si}`} title="Tıkla: kodu elle yaz" onClick={(e) => { e.stopPropagation(); S.goTo(k); S.enterManual(c ?? ''); }}>
                        <span class="row-code">{i.excluded && <span class="excl-tag" title="Excel'e girmez">hariç</span>}{c ?? <span class="muted">—</span>}</span>
                      </td>
                    );
                    if (id === 'issues') return <td class="lv-issues">{iss.length > 0 && <span class="warn" title={iss.map((x) => S.issueText(i, x)).join('\n')}>! {iss.map((x) => S.ISSUE_LABEL[x]).join(' · ')}</span>}</td>;
                    if (id === 'source') return <td class="muted">{src}</td>;
                    return cell(id, FIELD_DEFS[id].value(i, ctx));
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
