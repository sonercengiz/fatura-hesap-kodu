import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from './state';
import { askConfirm } from './dialog';
import { fmtCell } from '../core/num';
import { HeaderCell, AddColumnSelect, SkipEmptyToggle, scopeNote } from './TemplateParts';
import {
  FIELD_DEFS, FIELD_GROUPS, KDV_FIELD_IDS, DATE_CELLS_LABELS, ROW_ORDER_LABELS, DEFAULT_OUTPUT_TEMPLATE, vatFieldsFor, vatUncovered, isEdmDefault, buildTemplateRows,
  addColumn, removeColumn, renameColumn, moveColumn, toggleField, withColumns, emptyColumns, excelLettersOf, type OutputTemplate, type OutputFieldId, type RowOrder, type DateCells,
} from '../core/excel/template';

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
          <span>{t ? `${t.columns.length} sütun · ${isEdmDefault(t) ? 'EDM düzeni' : 'özelleştirilmiş'}` : ''}</span>
          {t && <SkipEmptyToggle t={t} empty={emptyOf(t).size} onChange={(n) => change(n)} />}
          <span class="spacer" />
          {t && scope !== 'general' && <button class="ghost tiny" onClick={dropSpecific}>Özel şablonu sil</button>}
        </div>
      </div>
    </div>
  );
}

type Change = (next: OutputTemplate, key?: string) => void;

/** Açık dönemde boş sütunlar ve her sütunun Excel'deki gerçek harfi (atlanan sütun null) */
const emptyOf = (t: OutputTemplate) => emptyColumns(t, S.outputIncluded.value, S.outputContext());
const lettersOf = (t: OutputTemplate) => excelLettersOf(t, emptyOf(t));
/** Bir alanın Excel'deki harfleri (atlanıyorsa "atlanır") */
const fieldLetters = (t: OutputTemplate, id: OutputFieldId, L: (string | null)[]) => t.columns.map((c, k) => (c.id === id ? L[k] ?? 'atlanır' : '')).filter(Boolean).join(', ');

/** Açık dönemde şablonun KDV dökümüne yazılamayan oranlar: söylenir, tek tıkla eklenir */
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

/** Önizleme: başlıklar düzenlenir (tıkla: ad, sürükle: sıra, ✕: kaldır); ilk birkaç fatura */
function Preview({ t, change, rows = 4 }: { t: OutputTemplate; change: Change; rows?: number }) {
  const sample = S.outputOrder.value.slice(0, rows);
  const data = buildTemplateRows(sample, t, S.outputContext());
  const cls = (k: number) => (t.columns[k].id === 'code' ? 'code-col' : FIELD_DEFS[t.columns[k].id]?.money ? 'r' : '');
  const L = lettersOf(t);
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
          <thead><tr>{t.columns.map((_, k) => <HeaderCell t={t} k={k} letter={L[k]} cls={cls(k)} onChange={(n) => change(n)} />)}</tr></thead>
          <tbody>{data.slice(1).map((r) => <tr>{r.map((v, c) => <td class={cls(c)}>{fmtCell(v, !!FIELD_DEFS[t.columns[c].id]?.money)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

const shortLabel = (id: OutputFieldId) => FIELD_DEFS[id].label.replace(/ \(EDM listesinden; yoksa boş\)$/, '');

/** Basit: alan grupları onay kutusu; işaretlenen sona eklenir, işareti kalkan bütün sütunlarıyla çıkar */
function SimpleBody({ t, change }: { t: OutputTemplate; change: Change }) {
  const L = lettersOf(t);
  const letters = (id: OutputFieldId) => fieldLetters(t, id, L);
  const missingKdv = KDV_FIELD_IDS.filter((id) => !t.columns.some((c) => c.id === id));
  return (
    <div class="tpl-simple">
      <div class="tpl-groups">
        {FIELD_GROUPS.map((g) => (
          <fieldset class="tpl-group">
            <legend>{g.title}{g.title === 'KDV dökümü' && missingKdv.length > 0 && <button class="tiny link" onClick={() => change(withColumns(t, [...t.columns, ...missingKdv.map((id) => ({ id, header: FIELD_DEFS[id].header }))]))}>hepsi</button>}</legend>
            {g.ids.map((id) => {
              const on = t.columns.some((c) => c.id === id);
              return (
                <label class={`tpl-check ${on ? 'on' : ''}`} title={FIELD_DEFS[id].label}>
                  <input type="checkbox" checked={on} onChange={(e) => change(toggleField(t, id, (e.currentTarget as HTMLInputElement).checked))} />
                  <span>{shortLabel(id)}</span>
                  {on && <span class="tpl-check-at">{letters(id)}</span>}
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
  const L = lettersOf(t);
  const lettersFor = (id: OutputFieldId) => fieldLetters(t, id, L);
  const addable = Object.keys(FIELD_DEFS) as OutputFieldId[];
  const missingKdv = KDV_FIELD_IDS.filter((id) => !used.has(id));
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
            <span class={`tpl-letter ${L[k] === null ? 'skipped' : ''}`} title={L[k] === null ? 'Bu dönemde boş: Excel\'e yazılmıyor (Boş sütunları atla)' : `Excel'de ${L[k]} sütunu`}>{L[k] ?? '—'}</span>
            <input class="tpl-header" value={c.header} placeholder={c.id === 'blank' ? '(boş başlık)' : FIELD_DEFS[c.id].header} onInput={(e) => change(renameColumn(t, k, (e.currentTarget as HTMLInputElement).value), `h${k}`)} onKeyDown={stop} />
            <span class="tpl-field muted small" title={FIELD_DEFS[c.id].label}>{FIELD_DEFS[c.id].label}</span>
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
          <button class="tpl-add-kdv" onClick={() => change(withColumns(t, [...t.columns, ...missingKdv.map((id) => ({ id, header: FIELD_DEFS[id].header }))]))} disabled={!missingKdv.length} title="KDV oranına göre matrah ve KDV tutarı sütunları: %0, %1, %10, %20 ve oranı uyuşmayan KDV. Faturada o oran yoksa hücre boş kalır.">{missingKdv.length ? `+ KDV dökümü (${missingKdv.length} sütun)` : 'KDV dökümü ekli'}</button>
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
