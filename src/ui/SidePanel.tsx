import { useEffect, useRef } from 'preact/hooks';
import * as S from './state';
import { ruleLabel, unitLabel } from '../core/rules';
import { askConfirm } from './dialog';
import { fmtAmount } from './InvoiceCard';
import { SORT_LABELS, type SortMode } from '../core/sort';
import type { FilterMode } from '../core/types';
import { useState } from 'preact/hooks';

const MAX_LINES = 8;

/** Seçili faturanın kalemleri: ad, miktar, KDV; her kalemden "miktara göre kural" taslağı */
function Lines({ inv, code }: { inv: NonNullable<typeof S.current.value>; code: string | undefined }) {
  const [all, setAll] = useState(false);
  const shown = all ? inv.lines : inv.lines.slice(0, MAX_LINES);
  const fmtQty = (q: number | null, u: string) => (q === null ? '' : `${q.toLocaleString('tr-TR', { maximumFractionDigits: 3 })} ${unitLabel(u)}`);
  void code;
  return (
    <div class="lines">
      <div class="lines-head"><span>Kalemler ({inv.lines.length})</span><span class="muted small">⚡ kalemden kural</span></div>
      {shown.map((l, k) => (
        <div class="line-row" title={`${l.label ?? l.name}${l.price != null ? ` · birim fiyat ${fmtAmount(l.price, inv.currency)} (KDV hariç)` : ''}`}>
          <div class="line-main">
            <span class="line-name">{l.label ?? l.name}</span>
            <span class="line-sub muted">{fmtQty(l.qty, l.unit)}{l.price != null ? ` × ${fmtAmount(l.price, inv.currency)}` : ''}{l.amount != null ? ` = ${fmtAmount(l.amount, inv.currency)}` : ''}{l.vat !== null ? ` · KDV %${l.vat}` : ''}</span>
          </div>
          <button class="ghost tiny line-rule" title="Bu kalemden kural yap (kalem adı ve miktarı işaretli gelir)" onClick={() => (S.quickRule.value = { lineIndex: k })}>⚡</button>
        </div>
      ))}
      {inv.lines.length > MAX_LINES && <button class="ghost tiny" onClick={() => setAll(!all)}>{all ? 'Daha az göster' : `+ ${inv.lines.length - MAX_LINES} kalem daha`}</button>}
    </div>
  );
}

export function SidePanel() {
  const inv = S.current.value;
  const listRef = useRef<HTMLDivElement>(null);
  const idx = S.currentIndex.value;

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('.row.current');
    el?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  const code = inv ? S.assignments.value.get(inv.no) : undefined;

  return (
    <aside class="side">
      {inv && (
        <div class="detail">
          <div class="detail-name">{inv.supplierName}</div>
          <div class="detail-row"><span>Fatura No</span><b>{inv.no}</b></div>
          <div class="detail-row"><span>Tarih</span><b>{inv.date}</b></div>
          <div class="detail-row"><span>VKN</span><b>{inv.supplierVkn}</b></div>
          <div class="detail-row"><span>Tip</span><b>{inv.invoiceType} · {inv.profile}</b></div>
          <div class="detail-row"><span>Ödenecek</span><b>{fmtAmount(inv.amount, inv.currency)}</b></div>
          {inv.taxExclusive != null && (
            <div class="detail-row"><span>Matrah · vergi</span><b>{fmtAmount(inv.taxExclusive, inv.currency)}{inv.taxAmount != null ? ` · ${fmtAmount(inv.taxAmount, inv.currency)}` : ''}</b></div>
          )}
          <div class={`detail-code slot-${S.slotIndexOf(code)}`}>
            <span>Atanan{S.ruleNos.value.has(inv.no) && <span class="bulk-tag" title="Kuralla atandı">kural</span>}</span>
            <b>{code ?? '—'}</b>
          </div>
          {(() => {
            const r = S.ruleFor.value.get(inv.no);
            const perm = r?.batchId ? S.overriddenBy(r) : null;
            if (r && r.code !== code) return (
              <button class="hint" onClick={() => S.assign(r.code)} title={`${r.batchId ? 'Dönem kuralı' : 'Kalıcı kural'}: ${ruleLabel(r)}`}>
                {r.batchId ? 'Dönem kuralı' : 'Kural'} diyor ki: <b>{r.code}</b> <span class="muted">({ruleLabel(r)})</span> <kbd>Boşluk</kbd>
              </button>
            );
            if (r && r.batchId && perm && perm.count > 0 && S.ruleNos.value.has(inv.no)) return (
              <div class="muted small rule-note" title="Bu döneme özel kural, kalıcı kuralın önüne geçti">Dönem kuralı · kalıcı {perm.codes.join(', ')} yerine</div>
            );
            if (code && !r) return (
              <button class="ghost tiny rule-make" onClick={() => (S.quickRule.value = { lineIndex: -1 })} title="Bu faturanın bilgilerinden kural yap (satıcı, tarih, KDV, kalemler…)">⚡ Kural yap: bu faturadan → {code}</button>
            );
            return null;
          })()}
          {S.hint.value && S.hint.value.code !== code && !S.ruleFor.value.has(inv.no) && (
            <button class="hint" onClick={() => S.assign(S.hint.value!.code)} title="Bu satıcıya daha önce verilen kodu ata (Boşluk)">
              Bu satıcıya önce: <b>{S.hint.value.code}</b> <span class="muted">×{S.hint.value.count}</span> <kbd>Boşluk</kbd>
            </button>
          )}
          {code && S.accounts.value.length > 0 && S.accountMap.value.has(code) && (
            <div class="detail-row"><span>Hesap adı</span><b>{S.accountMap.value.get(code)}</b></div>
          )}
          {inv.lines.length > 0 && <Lines inv={inv} code={code} />}
          {S.issuesFor(inv).filter((k) => k !== 'no-code').map((k) => (
            <div class="issue">{S.ISSUE_LABEL[k]}</div>
          ))}
        </div>
      )}
      <div class="list-controls">
        <select class="sort-select" value={S.settings.value.sortMode} title="Liste sırası (çıktı her zaman tarih sırasındadır)" onChange={(e) => S.setSortMode((e.currentTarget as HTMLSelectElement).value as SortMode)}>
          {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => <option value={m}>Sıra: {SORT_LABELS[m]}</option>)}
        </select>
        <select class="filter-select" value={S.filterMode.value} title="Hangi faturalar listelensin ve gezilsin" onChange={(e) => S.setFilter((e.currentTarget as HTMLSelectElement).value as FilterMode)}>
          {(Object.keys(S.FILTER_LABELS) as FilterMode[]).map((m) => <option value={m}>Göster: {S.FILTER_LABELS[m]}</option>)}
        </select>
        <button class={`tiny bulk-toggle ${S.bulkMode.value || S.selected.value.size ? 'on' : ''}`} title="Toplu seçim yardımcılarını aç/kapat" onClick={() => (S.bulkMode.value = !S.bulkMode.value)}>☑ Seç</button>
      </div>
      <input
        id="search"
        class="search"
        placeholder="Ara: no, satıcı, tutar  (Ctrl+F)"
        value={S.searchText.value}
        onInput={(e) => (S.searchText.value = (e.currentTarget as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            S.searchText.value = '';
            (e.currentTarget as HTMLInputElement).blur();
          }
          if (e.key === 'Enter') {
            const first = S.invoices.value.findIndex((i) => S.passesFilter(i));
            if (first >= 0) S.goTo(first);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
      <BulkBar />
      <div class="list" ref={listRef}>
        {S.invoices.value.map((i, k) => {
          if (!S.passesFilter(i) && k !== idx) return null;
          const c = S.assignments.value.get(i.no);
          const iss = S.attentionIssues(i);
          const sel = S.selected.value.has(i.no);
          const bulk = S.bulkNos.value.has(i.no);
          const ruled = S.ruleNos.value.has(i.no);
          const si = S.slotIndexOf(c);
          return (
            <div
              class={`row ${k === idx ? 'current' : ''} ${c ? `done slot-row-${si}` : ''} ${sel ? 'selected' : ''} ${bulk || ruled ? 'bulk' : ''}`}
              onClick={(e) => {
                if (e.shiftKey && S.lastClicked.value >= 0) { S.selectRange(S.lastClicked.value, k); S.lastClicked.value = k; return; }
                if (e.ctrlKey || e.metaKey) { S.toggleSelect(i.no); S.lastClicked.value = k; return; }
                S.lastClicked.value = k;
                S.goTo(k);
              }}
            >
              <input type="checkbox" class="row-check" checked={sel} title="Seç (Shift: aralık, Ctrl: tekil)" onClick={(e) => { e.stopPropagation(); const ev = e as MouseEvent; if (ev.shiftKey && S.lastClicked.value >= 0) S.selectRange(S.lastClicked.value, k); else S.toggleSelect(i.no); S.lastClicked.value = k; }} />
              <span class={`dot slot-${si}`} />
              <span class="row-main">
                <span class="row-name">{i.supplierName}</span>
                <span class="row-sub">{i.no} · {i.date}</span>
              </span>
              <span class="row-code">{bulk && <span class="bulk-tag" title="Toplu atandı (doğal gezintide atlanır, Ctrl+ok ile görülür)">toplu</span>}{ruled && <span class="bulk-tag" title="Kuralla atandı (doğal gezintide atlanır, Ctrl+ok ile görülür)">kural</span>}{c ?? ''}{iss.length > 0 && <span class="warn-dot" title={iss.map((x) => S.ISSUE_LABEL[x]).join('\n')}>!</span>}</span>
            </div>
          );
        })}
      </div>
      <div class="files">
        <span>{S.invoices.value.length} fatura · {S.viewCount.value} görselli</span>
        {inv && <button class="ghost tiny" title="Bu faturayı dönemden çıkar (yanlış yüklendiyse)" onClick={async () => { if (await askConfirm({ title: 'Faturayı çıkar', message: `${inv.no} (${inv.supplierName}) bu dönemden çıkarılacak; ataması da silinir.`, okLabel: 'Çıkar', danger: true })) S.removeInvoices([inv.no]); }}>çıkar</button>}
        {S.firms.value.length > 1 && <button class="ghost tiny" title="Bu dönemi ya da seçili faturaları başka firmaya taşı" onClick={() => (S.moveOpen.value = true)}>taşı</button>}
        {S.selected.value.size > 1 && <button class="ghost tiny" title="Seçili faturaları dönemden çıkar" onClick={async () => { const n = S.selected.value.size; if (await askConfirm({ title: 'Seçilileri çıkar', message: `${n} fatura bu dönemden çıkarılacak; atamaları da silinir.`, okLabel: 'Çıkar', danger: true })) S.removeInvoices(Array.from(S.selected.value)); }}>{S.selected.value.size} seçiliyi çıkar</button>}
      </div>
    </aside>
  );
}

export function BulkBar() {
  const n = S.selected.value.size;
  if (!S.bulkMode.value && n === 0) return null;
  const [code, setCode] = useState('');
  const inv = S.current.value;
  const visible = S.invoices.value.filter(S.passesFilter).length;
  const sameSupplier = inv ? S.invoices.value.filter((i) => i.supplierVkn === inv.supplierVkn && S.passesFilter(i)).length : 0;
  return (
    <div class={`bulk-bar ${n ? 'active' : ''}`}>
      <div class="bulk-row">
        <button class="ghost tiny" onClick={() => S.selectVisible()} title="Listede görünen tüm faturaları seç">Görünenleri seç ({visible})</button>
        {inv && <button class="ghost tiny" onClick={() => S.selectSupplier(inv.supplierVkn)} title={`${inv.supplierName} faturalarını seç`}>Bu satıcıyı seç ({sameSupplier})</button>}
        {n > 0 && <button class="ghost tiny" onClick={() => S.clearSelection()} title="Seçimi temizle (Esc)">✕ {n} seçili</button>}
      </div>
      {n > 0 && (
        <div class="bulk-row">
          <input
            class="bulk-input"
            placeholder={`${n} faturaya kod: yazıp Enter`}
            value={code}
            onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') { e.preventDefault(); S.assignBulk(code).then(() => setCode('')); }
              else if (e.key === 'Escape') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); }
            }}
          />
          <button class="primary tiny" onClick={() => S.assignBulk(code).then(() => setCode(''))} disabled={!code.trim()}>Toplu ata</button>
        </div>
      )}
      {n > 0 && S.slots.value.some(Boolean) && (
        <div class="bulk-row bulk-slots">
          {S.slots.value.map((c, i) => c && <button class={`tiny slot-${i}`} onClick={() => S.assignBulk(c)} title={`${n} faturaya ${c} ata`}>{c}</button>)}
        </div>
      )}
    </div>
  );
}
