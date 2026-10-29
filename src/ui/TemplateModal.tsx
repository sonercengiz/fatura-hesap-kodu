import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from './state';
import { askConfirm } from './dialog';
import { fmtCell } from '../core/num';
import { HeaderCell, AddColumnSelect, SkipEmptyToggle, scopeNote, SKIPPED_HINT, expandedOf } from './TemplateParts';
import {
  FIELD_DEFS, FIELD_GROUPS, KDV_FIELD_IDS, VAT_FIELD_IDS, VAT_MODE_LABELS, INTERNAL_FIELDS, DATE_CELLS_LABELS, ROW_ORDER_LABELS, DEFAULT_OUTPUT_TEMPLATE, vatFieldsFor, vatUncovered, isEdmDefault,
  buildTemplateRows, expandTemplate, fieldOf, addColumn, removeColumn, renameColumn, moveColumn, toggleField, withColumns,
  type OutputTemplate, type OutputColumn, type OutputFieldId, type RowOrder, type DateCells, type VatMode,
} from '../core/excel/template';
import type { Invoice } from '../core/types';

type Mode = 'simple' | 'advanced';
const SCOPES: S.TemplateScope[] = ['general', 'firm', 'batch'];
const readMode = (): Mode => { try { return localStorage.getItem('tplMode') === 'advanced' ? 'advanced' : 'simple'; } catch { return 'simple'; } };
/** Kayıtlar sırayla yazılır (hızlı yazarken eski değer yenisinin üstüne yazılmasın) */
let saving: Promise<unknown> = Promise.resolve();

/**
 * Çıktı Excel şablonu. Kapsam: Genel › Bu firma › Bu dönem (en özel tanımlı olan kullanılır). Anında kaydeder; değişiklikler
 * pencere içinde geri alınır (Ctrl+Z / Ctrl+Y). Basit: alanlar onay kutusu, sıralama önizleme başlıklarından; Gelişmiş: satır satır.
 */
export function TemplateModal() {
  const used0 = S.templateScope.value;
  const [scope, setScope] = useState<S.TemplateScope>(used0);
  const [mode, setModeState] = useState<Mode>(readMode);
  const [t, setT] = useState<OutputTemplate | null>(() => S.templateAt(used0));
  const [undo, setUndo] = useState<OutputTemplate[]>([]);
  const [redo, setRedo] = useState<OutputTemplate[]>([]);
  const lastKey = useRef<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const used = S.templateScope.value;
  const batch = S.batchRec.value;

  useEffect(() => { box.current?.focus(); }, []);
  const setMode = (m: Mode) => { setModeState(m); try { localStorage.setItem('tplMode', m); } catch { /* yok say */ } };
  const close = () => { S.templateOpen.value = false; };
  S.modalClosers.template = close;

  const save = (next: OutputTemplate, sc = scope) => { saving = saving.then(() => S.setOutputTemplate(next, sc)); };
  /** Değişiklik: yerelde hemen görünür, kapsamına anında yazılır. Aynı başlığa art arda yazmak tek geri alma adımıdır (key). */
  const change = (next: OutputTemplate, key?: string) => {
    if (!t) return;
    if (!key || key !== lastKey.current) { setUndo([...undo, t]); setRedo([]); }
    lastKey.current = key ?? null;
    setT(next);
    save(next);
  };
  const step = (from: OutputTemplate[], to: OutputTemplate[], setFrom: (x: OutputTemplate[]) => void, setTo: (x: OutputTemplate[]) => void) => {
    if (!from.length || !t) return;
    const prev = from[from.length - 1];
    setFrom(from.slice(0, -1)); setTo([...to, t]); lastKey.current = null;
    setT(prev); save(prev);
  };
  const undoOne = () => step(undo, redo, setUndo, setRedo);
  const redoOne = () => step(redo, undo, setRedo, setUndo);
  const pickScope = (sc: S.TemplateScope) => { if (sc === scope) return; setScope(sc); setT(S.templateAt(sc)); setUndo([]); setRedo([]); lastKey.current = null; };

  /** Firmaya/döneme özel şablon başlatır: bir üst kapsamın şablonundan kopya */
  const makeSpecific = () => {
    const base = (scope === 'batch' ? S.templateAt('firm') : null) ?? S.templateAt('general') ?? DEFAULT_OUTPUT_TEMPLATE;
    const copy: OutputTemplate = JSON.parse(JSON.stringify(base));
    setT(copy); setUndo([]); setRedo([]); save(copy);
    S.showToast(scope === 'batch' ? `Bu döneme özel şablon oluşturuldu (${batch?.name})` : `${S.firm.value.name} firmasına özel şablon oluşturuldu`);
  };
  const dropSpecific = async () => {
    if (scope === 'general') return;
    const upper = scope === 'batch' && S.templateAt('firm') ? 'firmanın şablonuyla' : 'genel şablonla';
    const who = scope === 'batch' ? `"${batch?.name}" döneminin` : `${S.firm.value.name} firmasının`;
    if (!(await askConfirm({ title: 'Özel şablonu sil', message: `${who} özel şablonu silinir; Excel'i bundan sonra ${upper} üretilir.`, okLabel: 'Özel şablonu sil', danger: true }))) return;
    saving = saving.then(() => S.clearTemplateAt(scope));
    await saving;
    setT(null); setUndo([]); setRedo([]);
    S.showToast(`Özel şablon silindi; ${upper} devam ediliyor`);
  };

  const scopeName = (sc: S.TemplateScope) => (sc === 'general' ? 'Genel' : sc === 'firm' ? `Bu firma · ${S.firm.value.name}` : `Bu dönem · ${batch?.name ?? '—'}`);
  const scopeState = (sc: S.TemplateScope) => (sc === used ? 'Excel bunu kullanıyor' : sc === 'general' || S.templateAt(sc) ? 'tanımlı, kullanılmıyor' : 'özel şablon yok');

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) {
      e.preventDefault(); e.stopPropagation();
      if (k === 'y' || e.shiftKey) redoOne(); else undoOne();
    }
  };

  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal wide tpl-modal" ref={box} tabIndex={-1} onClick={(e) => e.stopPropagation()} onKeyDownCapture={onKey}>
        <div class="modal-head">
          <b>Excel şablonu</b>
          <div class="tpl-scopes" role="tablist" title="Hangi şablonu düzenliyorsunuz? Excel'e en özel tanımlı olan yazılır: dönem › firma › genel">
            {SCOPES.map((sc) => (
              <button role="tab" aria-selected={sc === scope} class={`tpl-scope ${sc === scope ? 'on' : ''} ${sc === used ? 'used' : ''}`} disabled={sc === 'batch' && !batch} onClick={() => pickScope(sc)}>
                <span class="tpl-scope-name">{scopeName(sc)}</span>
                <span class="tpl-scope-state">{scopeState(sc)}</span>
              </button>
            ))}
          </div>
          <div class="spacer" />
          <div class="seg tpl-mode" role="tablist" title="Basit: alanları işaretleyin, sırayı önizleme başlıklarından sürükleyin. Gelişmiş: satır satır düzenleme, satır sırası, sayfa adı, tarih biçimi">
            <button class={mode === 'simple' ? 'on' : ''} onClick={() => setMode('simple')}>Basit</button>
            <button class={mode === 'advanced' ? 'on' : ''} onClick={() => setMode('advanced')}>Gelişmiş</button>
          </div>
          <button class="ghost" disabled={!undo.length} onClick={undoOne} title="Bu pencerede yapılan son değişikliği geri al (Ctrl+Z); Ctrl+Y yineler">Geri al{undo.length ? ` (${undo.length})` : ''}</button>
          <span class="muted small tpl-saved" title="Her değişiklik hemen kaydedilir; Excel üret ve liste hemen bunu kullanır">✓ anında kaydedilir</span>
          <button class="ghost" onClick={close}>Kapat <kbd>Esc</kbd></button>
        </div>
        {scope !== used && t && (
          <div class="tpl-note warn small">
            Açık dönemin Excel'i <b>{scopeName(used)}</b> şablonunu kullanıyor; burada yaptığınız değişiklik bu dönemi etkilemez ({scopeNote(scope)} değişir).
          </div>
        )}
        {!t ? (
          <div class="tpl-empty">
            <p>
              {scope === 'firm'
                ? <><b>{S.firm.value.name}</b> firmasının özel şablonu yok; Excel'i <b>genel şablonla</b> üretiliyor.</>
                : <><b>{batch?.name}</b> döneminin özel şablonu yok; Excel'i {S.templateAt('firm') ? <b>firmanın şablonuyla</b> : <b>genel şablonla</b>} üretiliyor.</>}
            </p>
            <p class="muted">Yalnızca {scope === 'firm' ? 'bu firmanın' : 'bu dönemin'} Excel'i farklı olsun istiyorsanız özel şablon oluşturun: şu anki şablondan kopyalanır, sonra burada yaptığınız değişiklik yalnızca {scope === 'firm' ? 'bu firmayı' : 'bu dönemi'} etkiler.</p>
            <button class="tpl-make" onClick={makeSpecific}>{scope === 'firm' ? 'Bu firmaya özel şablon oluştur' : 'Bu döneme özel şablon oluştur'}</button>
          </div>
        ) : mode === 'simple' ? (
          <SimpleBody t={t} change={change} />
        ) : (
          <AdvancedBody t={t} change={change} dragIdx={dragIdx} setDragIdx={setDragIdx} />
        )}
        <div class="tpl-foot muted small">
          <span>{t ? `${expandedOf(t).e.columns.length} sütun · ${isEdmDefault(t) ? 'EDM düzeni' : 'özelleştirilmiş'}` : ''}</span>
          {t && <SkipEmptyToggle t={t} empty={emptyOf(t).size} onChange={(n) => change(n)} />}
          <span class="spacer" />
          {t && scope !== 'general' && <button class="ghost tiny" onClick={dropSpecific}>Özel şablonu sil</button>}
        </div>
      </div>
    </div>
  );
}

type Change = (next: OutputTemplate, key?: string) => void;

/** Açık dönemde boş sütun sayısı (açılmış şablonda) */
const emptyOf = (t: OutputTemplate) => expandedOf(t).empty;
/** Şablondaki bir sütunun (KDV dökümünde bütün parçalarının) Excel harfleri: "J–S"; hepsi boşsa "boş, yazılmaz" */
function lettersAt(x: ReturnType<typeof expandedOf>, k: number): string {
  const ls = x.e.columns.map((c, j) => (c.src === k ? x.letters[j] : undefined)).filter((l) => l !== undefined);
  const real = ls.filter((l): l is string => l !== null);
  if (!ls.length) return '';
  if (!real.length) return 'boş, yazılmaz';
  return real.length === 1 ? real[0] : `${real[0]}–${real[real.length - 1]}`;
}
/** Bir alanın Excel'deki harfleri (aynı alan birden çok sütunda olabilir) */
const fieldLetters = (t: OutputTemplate, id: OutputFieldId, x: ReturnType<typeof expandedOf>) => t.columns.map((c, k) => (c.id === id ? lettersAt(x, k) : '')).filter(Boolean).join(', ');

/** Açık dönemde şablonun KDV sütunlarına (Özel) yazılamayan oranlar: söylenir, tek tıkla eklenir */
function VatGap({ t, change }: { t: OutputTemplate; change: Change }) {
  const used = new Set(t.columns.map((c) => c.id));
  const gapCount = new Map<string, number>();
  for (const inv of S.invoices.value) for (const r of new Set(vatUncovered(inv, t))) { const k = r === null ? 'odd' : String(r); gapCount.set(k, (gapCount.get(k) ?? 0) + 1); }
  if (!gapCount.size) return null;
  const gapFields = [...gapCount.keys()].flatMap((k) => vatFieldsFor(k === 'odd' ? null : Number(k))).filter((id) => !used.has(id));
  const gapText = [...gapCount].map(([k, n]) => `${k === 'odd' ? 'oranı uyuşmayan KDV' : `%${k}`} (${n} fatura)`).join(', ');
  return (
    <div class="tpl-gap warn small">
      Bu dönemde şablonda sütunu olmayan KDV var: {gapText}. Eklenmezse bu tutarlar Excel'e yazılmaz.
      {gapFields.length > 0 && <button class="tiny" onClick={() => change(withColumns(t, [...t.columns, ...gapFields.map((id) => ({ id, header: FIELD_DEFS[id].header }))]))}>+ Ekle ({gapFields.length} sütun)</button>}
    </div>
  );
}

/** Önizleme: başlıklar düzenlenir (tıkla: ad, sürükle: sıra, ✕: kaldır); ilk birkaç fatura, KDV dökümü açılmış halde */
function Preview({ t, change, rows = 4 }: { t: OutputTemplate; change: Change; rows?: number }) {
  const sample = S.outputOrder.value.slice(0, rows);
  const x = expandedOf(t);
  const data = buildTemplateRows(sample, x.e, S.outputContext());
  const money = (k: number) => !!fieldOf(x.e.columns[k]).money;
  const cls = (k: number) => (x.e.columns[k].id === 'code' ? 'code-col' : money(k) ? 'r' : '');
  // Sütun eklenince (sona eklenir) önizleme sona kayar: eklenen sütun görünsün
  const tbox = useRef<HTMLDivElement>(null);
  const prevN = useRef(t.columns.length);
  useEffect(() => {
    if (t.columns.length > prevN.current && tbox.current) tbox.current.scrollLeft = tbox.current.scrollWidth;
    prevN.current = t.columns.length;
  }, [t.columns.length]);
  return (
    <div class="tpl-preview">
      <div class="tpl-preview-head muted small">
        <span>Excel önizlemesi{sample.length ? ` (ilk ${sample.length} fatura)` : ''} — başlığa tıklayıp adını değiştirin, sürükleyip sırasını değiştirin, ✕ ile kaldırın</span>
        <span class="spacer" />
        <AddColumnSelect t={t} onChange={(n) => change(n)} />
      </div>
      <div class="table-box" ref={tbox}>
        <table>
          <thead><tr>{x.e.columns.map((c, k) => <HeaderCell t={t} col={c} letter={x.letters[k]} cls={cls(k)} onChange={(n) => change(n)} />)}</tr></thead>
          <tbody>{data.slice(1).map((r) => <tr>{r.map((v, c) => <td class={cls(c)}>{fmtCell(v, money(c))}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

const shortLabel = (id: OutputFieldId) => FIELD_DEFS[id].label.replace(/ \(EDM listesinden; yoksa boş\)$/, '');

type VatChoice = 'none' | VatMode | 'custom';
/** Şablonun KDV seçimi: öğe varsa açılımı, tek tek KDV alanı varsa Özel, hiçbiri yoksa Yok */
const vatChoiceOf = (t: OutputTemplate): VatChoice => {
  const item = t.columns.find((c) => c.id === 'vat');
  if (item) return item.vatMode ?? 'current';
  return t.columns.some((c) => VAT_FIELD_IDS.has(c.id)) ? 'custom' : 'none';
};

/**
 * KDV seçimini değiştirir; KDV sütunları ilk KDV sütununun yerinde kalır. Özel'e geçerken o anki açılımın sabit alanları tek tek
 * sütun olur (değiştirilmiş başlıklarıyla), Özel'den bir açılıma geçerken tek tek KDV alanları tek öğede toplanır.
 */
function setVatChoice(t: OutputTemplate, choice: VatChoice, invoices: Invoice[]): OutputTemplate {
  const isVat = (c: OutputColumn) => c.id === 'vat' || VAT_FIELD_IDS.has(c.id);
  const first = t.columns.findIndex(isVat);
  const rest = t.columns.filter((c) => !isVat(c));
  const at = first < 0 ? rest.length : t.columns.slice(0, first).filter((c) => !isVat(c)).length;
  const item = t.columns.find((c) => c.id === 'vat');
  let ins: OutputColumn[] = [];
  if (choice === 'custom') {
    const from = item ? expandTemplate({ ...t, columns: [item] }, invoices).columns.filter((c) => c.rate === undefined) : [];
    ins = from.length ? from.map((c) => ({ id: c.id, header: c.header })) : KDV_FIELD_IDS.map((id) => ({ id, header: FIELD_DEFS[id].header }));
  } else if (choice !== 'none') {
    ins = [{ id: 'vat', header: FIELD_DEFS.vat.header, vatMode: choice, ...(item?.vatHeaders ? { vatHeaders: item.vatHeaders } : {}) }];
  }
  return withColumns(t, [...rest.slice(0, at), ...ins, ...rest.slice(at)]);
}

/** Açık dönemdeki KDV oranlarının kısa özeti: "%1, %10, %20 ve oranı uyuşmayan 1 fatura" */
function vatSeenText(invoices: Invoice[]): string {
  const rates = new Set<number>();
  let odd = 0;
  for (const i of invoices) { let o = false; for (const p of i.vatBreakdown) { if (p.rate === null) o ||= !!p.tax; else rates.add(p.rate); } if (o) odd++; }
  const list = [...rates].sort((a, b) => a - b).map((r) => `%${String(r).replace('.', ',')}`);
  if (!list.length && !odd) return 'Bu dönemde KDV yok.';
  return `Bu dönemde: ${list.join(', ')}${odd ? `${list.length ? ' ve ' : ''}oranı uyuşmayan ${odd} fatura` : ''}. Dönemde olmayan oranın sütunu yazılmaz.`;
}

/** Basit görünümde KDV dökümü: tek seçim (Yok / Toplam / Güncel oranlar + Diğer / Her oran ayrı / Özel); Özel'de alanlar tek tek */
function VatPicker({ t, change, x }: { t: OutputTemplate; change: Change; x: ReturnType<typeof expandedOf> }) {
  const choice = vatChoiceOf(t);
  const vatAt = t.columns.findIndex((c) => c.id === 'vat');
  const custom = FIELD_GROUPS.find((g) => g.title === 'KDV dökümü')?.ids ?? [];
  const opt = (c: VatChoice, name: string, hint?: string) => (
    <>
      <label class={`tpl-check tpl-radio ${choice === c ? 'on' : ''}`}>
        <input type="radio" name="vat-choice" checked={choice === c} onChange={() => change(setVatChoice(t, c, S.outputIncluded.value))} />
        <span>{name}</span>
        {choice === c && vatAt >= 0 && <span class="tpl-check-at">{lettersAt(x, vatAt)}</span>}
      </label>
      {hint && <div class="tpl-radio-hint muted small">{hint}</div>}
    </>
  );
  return (
    <fieldset class="tpl-group tpl-vat">
      <legend>KDV dökümü</legend>
      {opt('none', 'Yok')}
      {(['total', 'current', 'each'] as VatMode[]).map((m) => opt(m, VAT_MODE_LABELS[m].name, VAT_MODE_LABELS[m].hint))}
      {opt('custom', 'Özel', 'Sütunları tek tek seçin (örn. yalnız %10\'lar)')}
      {choice === 'custom' && (
        <div class="tpl-vat-custom">
          {custom.map((id) => {
            const on = t.columns.some((c) => c.id === id);
            return (
              <label class={`tpl-check ${on ? 'on' : ''}`} title={FIELD_DEFS[id].label}>
                <input type="checkbox" checked={on} onChange={(e) => change(toggleField(t, id, (e.currentTarget as HTMLInputElement).checked))} />
                {/* Kısa ad = Excel başlığı; ayrıntı ipucunda */}
                <span>{FIELD_DEFS[id].header}{/^vat(8|18)/.test(id) ? <span class="muted"> (eski oran)</span> : null}</span>
                {on && <span class="tpl-check-at">{fieldLetters(t, id, x)}</span>}
              </label>
            );
          })}
        </div>
      )}
      <div class="muted small tpl-vat-seen">{vatSeenText(S.outputIncluded.value)}</div>
    </fieldset>
  );
}

/** Basit: alan grupları onay kutusu; işaretlenen sona eklenir, işareti kalkan bütün sütunlarıyla çıkar */
function SimpleBody({ t, change }: { t: OutputTemplate; change: Change }) {
  const x = expandedOf(t);
  return (
    <div class="tpl-simple">
      <div class="tpl-groups">
        {FIELD_GROUPS.map((g) => g.title === 'KDV dökümü' ? <VatPicker t={t} change={change} x={x} /> : (
          <fieldset class="tpl-group">
            <legend>{g.title}</legend>
            {g.ids.map((id) => {
              const on = t.columns.some((c) => c.id === id);
              return (
                <label class={`tpl-check ${on ? 'on' : ''}`} title={FIELD_DEFS[id].label}>
                  <input type="checkbox" checked={on} onChange={(e) => change(toggleField(t, id, (e.currentTarget as HTMLInputElement).checked))} />
                  <span>{shortLabel(id)}</span>
                  {on && <span class="tpl-check-at">{fieldLetters(t, id, x)}</span>}
                </label>
              );
            })}
            {g.title === 'Diğer' && <button class="tiny" onClick={() => change(addColumn(t, 'blank'))} title="Başlığı boş, değeri boş sütun (içe aktarma şablonunda atlanacak sütun için)">+ Boş sütun</button>}
          </fieldset>
        ))}
      </div>
      <div class="tpl-simple-right">
        <VatGap t={t} change={change} />
        <Preview t={t} change={change} rows={6} />
        <div class="muted small">Satır sırası, sayfa adı ve tarih hücreleri <b>Gelişmiş</b>'te. Başlıklar, hesap kodu, VKN ve ETTN metin yazılır ("%20" başlığı "0,2" olmaz).</div>
      </div>
    </div>
  );
}

/** Gelişmiş: satır satır sütunlar (başlık, sıra), satır sırası, sayfa adı, tarih hücreleri, başka şablondan kopya */
function AdvancedBody({ t, change, dragIdx, setDragIdx }: { t: OutputTemplate; change: Change; dragIdx: number | null; setDragIdx: (k: number | null) => void }) {
  const [addId, setAddId] = useState<OutputFieldId>('uuid');
  const used = new Set(t.columns.map((c) => c.id));
  const x = expandedOf(t);
  const lettersFor = (id: OutputFieldId) => fieldLetters(t, id, x);
  const addable = (Object.keys(FIELD_DEFS) as OutputFieldId[]).filter((id) => !INTERNAL_FIELDS.has(id) && !(id === 'vat' && used.has('vat')));
  const sources = [
    ...(S.templateScope.value !== 'general' ? [{ id: 'general', name: 'Genel şablon', t: S.templateAt('general') }] : []),
    ...S.firms.value.filter((f) => f.id !== S.firm.value.id && f.outputTemplate).map((f) => ({ id: f.id, name: `${f.name} firması`, t: f.outputTemplate ?? null })),
  ];
  const add = () => { change(addColumn(t, addId)); const next = addable.find((x) => x !== addId && x !== 'blank' && !used.has(x)); if (next && addId !== 'blank') setAddId(next); };
  const stop = (e: KeyboardEvent) => { if (!((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key))) e.stopPropagation(); };
  return (
    <div class="tpl-body">
      <div class="tpl-cols">
        <div class="muted small">Sürükleyerek sıralayın; başlık metnini doğrudan düzenleyin. Muhasebe programınızın içe aktarma şablonu hangi başlıkları bekliyorsa onları yazın.</div>
        {t.columns.map((c, k) => (
          <div
            class={`tpl-row ${dragIdx === k ? 'dragging' : ''} ${c.id === 'code' ? 'is-code' : ''}`}
            draggable
            onDragStart={(e) => { setDragIdx(k); e.dataTransfer?.setData('text/plain', String(k)); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const from = Number(e.dataTransfer?.getData('text/plain') || String(dragIdx)); if (!Number.isNaN(from)) change(moveColumn(t, from, k)); setDragIdx(null); }}
            onDragEnd={() => setDragIdx(null)}
          >
            {(() => { const l = lettersAt(x, k); const off = l === 'boş, yazılmaz' || l === ''; return <span class={`tpl-letter ${off ? 'skipped' : ''} ${l.length > 2 ? 'wide' : ''}`} title={off ? SKIPPED_HINT : `Excel'de ${l} sütun${l.includes('–') ? 'ları' : 'u'}`}>{off ? '—' : l}</span>; })()}
            {c.id === 'vat' ? (
              <select class="tpl-vat-mode" value={c.vatMode ?? 'current'} title="KDV dökümü Excel'e yazılırken bu dönemdeki oranlara göre sütunlara açılır" onChange={(e) => change(withColumns(t, t.columns.map((col, i) => (i === k ? { ...col, vatMode: (e.currentTarget as HTMLSelectElement).value as VatMode } : col))))} onKeyDown={stop}>
                {(Object.keys(VAT_MODE_LABELS) as VatMode[]).map((m) => <option value={m}>KDV dökümü · {VAT_MODE_LABELS[m].name}</option>)}
              </select>
            ) : (
              <input class="tpl-header" value={c.header} placeholder={c.id === 'blank' ? '(boş başlık)' : FIELD_DEFS[c.id].header} onInput={(e) => change(renameColumn(t, k, (e.currentTarget as HTMLInputElement).value), `h${k}`)} onKeyDown={stop} />
            )}
            <span class="tpl-field muted small" title={c.id === 'vat' ? VAT_MODE_LABELS[c.vatMode ?? 'current'].hint : FIELD_DEFS[c.id].label}>{c.id === 'vat' ? `${VAT_MODE_LABELS[c.vatMode ?? 'current'].hint}. Alt başlıklar önizlemede değiştirilir.` : FIELD_DEFS[c.id].label}</span>
            <button class="ghost tiny" title="Yukarı" disabled={k === 0} onClick={() => change(moveColumn(t, k, k - 1))}>↑</button>
            <button class="ghost tiny" title="Aşağı" disabled={k === t.columns.length - 1} onClick={() => change(moveColumn(t, k, k + 1))}>↓</button>
            <button class="ghost tiny" title="Sütunu kaldır" onClick={() => change(removeColumn(t, k))}>✕</button>
          </div>
        ))}
        <div class="tpl-add">
          <select value={addId} onChange={(e) => setAddId((e.currentTarget as HTMLSelectElement).value as OutputFieldId)} onKeyDown={stop}>
            {addable.map((id) => <option value={id}>{FIELD_DEFS[id].label}{id !== 'blank' && used.has(id) ? ` · ekli: ${lettersFor(id)}` : ''}</option>)}
          </select>
          <button onClick={add}>+ Sütun ekle</button>
          <button class="tpl-add-kdv" onClick={() => change(addColumn(t, 'vat'))} disabled={used.has('vat')} title="Tek öğe: Excel'e yazılırken bu dönemdeki KDV oranlarına göre matrah ve KDV sütunlarına açılır (Güncel oranlar + Diğer; açılımı satırdan değiştirin)">{used.has('vat') ? 'KDV dökümü ekli' : '+ KDV dökümü'}</button>
        </div>
        <VatGap t={t} change={change} />
      </div>
      <div class="tpl-side">
        <label><span>Satır sırası</span>
          <select value={t.rowOrder} onChange={(e) => change({ ...t, rowOrder: (e.currentTarget as HTMLSelectElement).value as RowOrder })} onKeyDown={stop}>
            {(Object.keys(ROW_ORDER_LABELS) as RowOrder[]).map((o) => <option value={o}>{ROW_ORDER_LABELS[o]}</option>)}
          </select>
        </label>
        <label><span>Sayfa adı</span>
          <input value={t.sheetName} onInput={(e) => change({ ...t, sheetName: (e.currentTarget as HTMLInputElement).value }, 'sheet')} onKeyDown={stop} placeholder="Sheet0" />
        </label>
        <label><span>Tarih hücreleri</span>
          <select class="tpl-date-cells" value={t.dateCells ?? 'text'} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value as DateCells; const { dateCells: _d, ...rest } = t; change(v === 'date' ? { ...rest, dateCells: 'date' } : rest); }} onKeyDown={stop} title="Muhasebe programınız tarihi gerçek tarih olarak bekliyorsa seçin; EDM listesi metin kullanır">
            {(Object.keys(DATE_CELLS_LABELS) as DateCells[]).map((o) => <option value={o}>{DATE_CELLS_LABELS[o]}</option>)}
          </select>
        </label>
        <div class="tpl-side-row">
          {sources.length > 0 && (
            <select class="tpl-copy" value="" title="Başka bir şablonu buraya kopyala (Geri al ile dönülür)" onChange={(e) => { const s = sources.find((x) => x.id === (e.currentTarget as HTMLSelectElement).value); (e.currentTarget as HTMLSelectElement).value = ''; if (s?.t) change(JSON.parse(JSON.stringify(s.t))); }} onKeyDown={stop}>
              <option value="">Başka şablondan kopyala…</option>
              {sources.map((s) => <option value={s.id}>{s.name}</option>)}
            </select>
          )}
          <button class="ghost tiny" onClick={() => change(JSON.parse(JSON.stringify(DEFAULT_OUTPUT_TEMPLATE)))} title="EDM fatura listesinin 20 sütunu + C'de Hesap Kodu">EDM varsayılanına dön</button>
        </div>
        <div class="muted small">Başlıklar, hesap kodu, VKN ve ETTN metin tipinde yazılır (Excel sayıya çevirmez; "%20" başlığı "0,2" olmaz). Tutar, matrah, vergi sayıdır. Şablonlar çalışma alanı yedeğine girer.</div>
        <Preview t={t} change={change} rows={3} />
      </div>
    </div>
  );
}
