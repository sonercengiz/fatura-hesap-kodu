import { useEffect, useRef } from 'preact/hooks';
import * as S from './state';
import { ruleLabel, unitLabel } from '../core/rules';
import { askConfirm } from './dialog';
import { fmtAmount } from './InvoiceCard';
import { SORT_LABELS, type SortMode } from '../core/sort';
import type { FilterMode } from '../core/types';
import { useState } from 'preact/hooks';

const LINES_KEY = 'linesOpen';
const readLinesOpen = () => { try { return localStorage.getItem(LINES_KEY) !== '0'; } catch { return true; } };

/**
 * Seçili faturanın kalemleri: tek satırda "ad · miktar × fiyat = tutar · KDV"; en çok üç satır yüksekliğinde, fazlası kaydırılır
 * (panel yüksekliği faturadan faturaya değişmesin, alttaki liste yerinden oynamasın). Başlıktan kapatılır; seçim hatırlanır.
 */
function Lines({ inv }: { inv: NonNullable<typeof S.current.value> }) {
  const [open, setOpen] = useState(readLinesOpen);
  const toggle = () => { setOpen(!open); try { localStorage.setItem(LINES_KEY, open ? '0' : '1'); } catch { /* yok say */ } };
  const fmtQty = (q: number | null, u: string) => (q === null ? '' : `${q.toLocaleString('tr-TR', { maximumFractionDigits: 3 })} ${unitLabel(u)}`);
  const money = (n: number | null | undefined) => (n == null ? '' : n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  return (
    <div class={`lines ${open ? '' : 'closed'}`}>
      <button class="lines-head" onClick={toggle} title={open ? 'Kalemleri gizle' : 'Kalemleri göster'}>
        <span>{open ? '▾' : '▸'} Kalemler ({inv.lines.length})</span>
        <span class="muted small">⚡ kalemden kural</span>
      </button>
      {open && (
        <div class="lines-body">
          {inv.lines.map((l, k) => {
            const sub = [fmtQty(l.qty, l.unit), l.price != null ? `× ${money(l.price)}` : '', l.amount != null ? `= ${money(l.amount)}` : '', l.vat !== null ? `· KDV %${l.vat}` : ''].filter(Boolean).join(' ');
            return (
              <div class="line-row" title={`${l.label ?? l.name}\n${sub}${l.price != null ? ' (birim fiyat KDV hariç)' : ''}`}>
                <span class="line-name">{l.label ?? l.name}</span>
                <span class="line-sub muted">{sub}</span>
                <button class="ghost tiny line-rule" title="Bu kalemden kural yap (kalem adı ve miktarı işaretli gelir)" onClick={() => (S.quickRule.value = { lineIndex: k })}>⚡</button>
              </div>
            );
          })}
        </div>
      )}
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
      <PanelDivider />
      {inv && (
        <div class="detail">
          {inv.excluded && <div class="excl-note">Bu fatura Excel'e girmez <button class="ghost tiny" onClick={() => S.setExcluded([inv.no], false)}>Geri al</button></div>}
          <div class="detail-name" title={inv.supplierName}>{inv.supplierName}</div>
          <div class="detail-rows">
            <div class="detail-row full"><span>Fatura No</span><b title={inv.no}>{inv.no}</b></div>
            <div class="detail-row"><span>Tarih</span><b>{inv.date}</b></div>
            <div class="detail-row"><span>VKN</span><b>{inv.supplierVkn}</b></div>
            <div class="detail-row"><span>Tip</span><b title={`${inv.invoiceType} · ${inv.profile}`}>{inv.invoiceType} · {inv.profile}</b></div>
            <div class="detail-row"><span>Ödenecek</span><b>{fmtAmount(inv.amount, inv.currency)}</b></div>
            <div class="detail-row full"><span>Matrah · vergi</span><b title="Matrah · hesaplanan vergi">{inv.taxExclusive != null ? `${fmtAmount(inv.taxExclusive, inv.currency)}${inv.taxAmount != null ? ` · ${fmtAmount(inv.taxAmount, inv.currency)}` : ''}` : '—'}</b></div>
          </div>
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
          {inv.lines.length > 0 && <Lines inv={inv} />}
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
              class={`row ${k === idx ? 'current' : ''} ${c ? `done slot-row-${si}` : ''} ${sel ? 'selected' : ''} ${bulk || ruled ? 'bulk' : ''} ${i.excluded ? 'excluded' : ''}`}
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
              <span class="row-code">{i.excluded && <span class="excl-tag" title="Excel'e girmez">hariç</span>}{bulk && <span class="bulk-tag" title="Toplu atandı (doğal gezintide atlanır, Ctrl+ok ile görülür)">toplu</span>}{ruled && <span class="bulk-tag" title="Kuralla atandı (doğal gezintide atlanır, Ctrl+ok ile görülür)">kural</span>}{c ?? ''}{iss.length > 0 && <span class="warn-dot" title={iss.map((x) => S.ISSUE_LABEL[x]).join('\n')}>!</span>}</span>
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

/**
 * Görüntü ile liste paneli arasındaki sürüklenebilir çizgi: panel genişliği bu bilgisayarda hatırlanır (Ayarlar › Ekran'dan sıfırlanır).
 * Çift tık varsayılana döndürür. Yığılı yerleşimde (çok dar pencere) gizlidir.
 */
function PanelDivider() {
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const work = el.closest('.work') as HTMLElement | null; if (!work) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('dragging');
    const right = work.getBoundingClientRect().right;
    const move = (ev: PointerEvent) => { S.setScreenPrefs({ panelW: Math.round((right - ev.clientX) / S.uiScale.value) }); };
    const up = () => { el.classList.remove('dragging'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  return <div class="panel-divider" title="Sürükleyin: liste paneli genişliği · çift tık: varsayılan" onPointerDown={onDown} onDblClick={() => S.setScreenPrefs({ panelW: null })} />;
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
      {n > 0 && (() => {
        const sel = S.invoices.value.filter((i) => S.selected.value.has(i.no));
        const inn = sel.filter((i) => !i.excluded).map((i) => i.no);
        const out = sel.filter((i) => i.excluded).map((i) => i.no);
        return (
          <div class="bulk-row bulk-excl">
            {inn.length > 0 && <button class="ghost tiny" onClick={() => S.setExcluded(inn, true)} title="Seçili faturalar Excel çıktısına yazılmaz (istisnai faturalar); kod beklemezler, sayaçlara girmezler. Ctrl+Z geri alır.">Excel'den çıkar ({inn.length})</button>}
            {out.length > 0 && <button class="ghost tiny" onClick={() => S.setExcluded(out, false)} title="Seçili çıkarılmış faturalar yeniden Excel'e girer">Excel'e geri al ({out.length})</button>}
          </div>
        );
      })()}
      {n > 0 && S.slots.value.some(Boolean) && (
        <div class="bulk-row bulk-slots">
          {S.slots.value.map((c, i) => c && <button class={`tiny slot-${i}`} onClick={() => S.assignBulk(c)} title={`${n} faturaya ${c} ata`}>{c}</button>)}
        </div>
      )}
    </div>
  );
}
