import { useState } from 'preact/hooks';
import * as S from './state';
import { FIELD_DEFS, INTERNAL_FIELDS, colName, vatGroupOf, fieldOf, defaultHeaderOf, expandTemplate, emptyColumns, excelLettersOf, addColumn, removeColumn, renameColumn, moveColumn, withColumns, dropIndex, fieldFill, clearKeep, keepCount, type OutputTemplate, type OutputFieldId, type ExpandedColumn } from '../core/excel/template';

/**
 * Şablonu her yerden (önizleme, liste) aynı şekilde değiştirir: geçerli şablonun kapsamına anında yazar, bildirimde "Geri al".
 * Şablon penceresinin kendi geri alma yığını var; bu yalnızca pencere dışındaki düzenlemeler içindir.
 */
export function commitTemplate(next: OutputTemplate, label: string) {
  const scope = S.templateScope.value;
  const prev = S.templateAt(scope) ?? S.outputTemplate.value;
  S.setOutputTemplate(next, scope);
  S.showToast(`${label} · ${scopeNote(scope)}`, 5000, { label: 'Geri al', run: () => { S.setOutputTemplate(prev, scope); } });
}

/** Değişikliğin hangi Excel'leri etkilediği, kısa */
export function scopeNote(scope: S.TemplateScope): string {
  return scope === 'batch' ? `yalnızca bu dönemin Excel'i (${S.batchRec.value?.name ?? ''})` : scope === 'firm' ? `${S.firm.value.name} firmasının Excel'i` : 'genel şablon (özel şablonu olmayan bütün firmalar)';
}

/** Excel'e yazılmayan (bu dönemde boş, atlanan) sütunun ipucu; görünür metin yok, başlık gri */
export const SKIPPED_HINT = 'Bu dönemde boş; Excel\'e yazılmıyor (Boş sütunları atla)';

/** KDV dökümü öğesinin bir alt başlığını değiştirir (varsayılana dönerse kaydı silinir) */
function renameVatPart(t: OutputTemplate, k: number, part: string, header: string, def: string): OutputTemplate {
  const item = t.columns[k];
  const vatHeaders = { ...item.vatHeaders };
  if (header === def) delete vatHeaders[part]; else vatHeaders[part] = header;
  const { vatHeaders: _old, ...rest } = item;
  return withColumns(t, t.columns.map((c, i) => (i === k ? { ...rest, ...(Object.keys(vatHeaders).length ? { vatHeaders } : {}) } : c)));
}

type DropSide = 'before' | 'after';
const DRAG_TYPE = 'text/x-col';

/**
 * Sütun sürükle-bırak (liste, önizleme, şablon önizlemesi ve Gelişmiş satırlar aynı): işaretçi hedefin ön yarısındaysa önüne,
 * arka yarısındaysa arkasına bırakılır; bırakılacak yerde ekleme çizgisi görünür (`drop-before` / `drop-after`).
 * `axis` 'x' başlık hücresi (sol/sağ yarı), 'y' Gelişmiş satır (üst/alt yarı).
 */
export function useColumnDrag(k: number, onMove: (from: number, to: number) => void, axis: 'x' | 'y' = 'x') {
  const [side, setSide] = useState<DropSide | null>(null);
  const sideOf = (e: DragEvent): DropSide => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return axis === 'x' ? (e.clientX < r.left + r.width / 2 ? 'before' : 'after') : (e.clientY < r.top + r.height / 2 ? 'before' : 'after');
  };
  return {
    dropCls: side ? `drop-${side}` : '',
    dragProps: {
      onDragStart: (e: DragEvent) => { e.dataTransfer?.setData(DRAG_TYPE, String(k)); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; },
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        const s = sideOf(e);
        if (s !== side) setSide(s);
      },
      onDragLeave: () => setSide(null),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        const s = side ?? sideOf(e);
        setSide(null);
        const from = Number(e.dataTransfer?.getData(DRAG_TYPE));
        if (Number.isNaN(from) || e.dataTransfer?.getData(DRAG_TYPE) === '') return;
        const to = dropIndex(from, k, s);
        if (to !== from) onMove(from, to);
      },
    },
  };
}

/** Taşınan sütunun bildirimi: '"Tutar" C sütununa taşındı' (harf yeni yerindeki Excel harfi; KDV dökümünde ilk parçasınınki) */
export function moveLabel(t: OutputTemplate, from: number, to: number): string {
  const next = moveColumn(t, from, to);
  const x = expandedOf(next);
  const j = x.e.columns.findIndex((c) => c.src === to);
  const letter = j >= 0 ? x.letters[j] : null;
  const what = t.columns[from].id === 'vat' ? 'KDV dökümü' : `"${t.columns[from].header || '(boş)'}"`;
  return letter ? `${what} ${letter} sütununa taşındı` : `${what} taşındı`;
}

/**
 * Önizleme ve liste tablosunda düzenlenebilir sütun başlığı: harf + başlık; tıkla → yeniden adlandır, sürükle → araya taşı, ✕ → kaldır.
 * `col` Excel'e yazılan (açılmış) sütundur; `col.src` şablondaki sütun. KDV dökümünün bir parçasında ad yalnızca o başlığı değiştirir,
 * sürükleme ve ✕ bütün KDV dökümünü taşır/kaldırır. `letter === null`: bu dönemde boş, Excel'e yazılmıyor (gri başlık, harf yok).
 */
export function HeaderCell({ t, col, cls = '', label, letter, onChange = commitTemplate }: { t: OutputTemplate; col: ExpandedColumn; cls?: string; label?: string; letter?: string | null; onChange?: (next: OutputTemplate, label: string) => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  const k = col.src;
  const inVat = !!col.part;
  const shown = label ?? col.header;
  const { dropCls, dragProps } = useColumnDrag(k, (from, to) => onChange(moveColumn(t, from, to), moveLabel(t, from, to)));
  const save = () => {
    if (edit !== null && edit !== col.header) {
      onChange(inVat ? renameVatPart(t, k, col.part as string, edit, defaultHeaderOf(col)) : renameColumn(t, k, edit), `Başlık "${edit || '(boş)'}" oldu`);
    }
    setEdit(null);
  };
  // KDV sütunlarında oran grubunun rengi (yazılmayan sütunda renk yok)
  const off = letter === null;
  const g = off ? null : vatGroupOf(col);
  const what = inVat ? 'KDV dökümü' : `"${col.header || '(boş)'}"`;
  return (
    <th
      class={`${cls}${g ? ` vg vg-${g}` : ''} hdr-edit ${dropCls} ${off ? 'off' : ''}`}
      draggable={edit === null}
      title={`${fieldOf(col).label}${inVat ? ' · KDV dökümünün parçası' : ''}${off ? `\n${SKIPPED_HINT}` : ''}\nTıkla: başlığı değiştir · Sürükle: ${inVat ? 'KDV dökümünün' : ''} yerini değiştir · ✕: ${inVat ? 'KDV dökümünü' : ''} Excel'den kaldır`.replace(/  +/g, ' ')}
      {...dragProps}
    >
      <span class="col-letter">{off ? '\u00a0' : letter ?? colName(k)}</span>
      {edit !== null ? (
        <input
          class="hdr-input"
          value={edit}
          ref={(el) => el?.focus()}
          onInput={(e) => setEdit((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') setEdit(null); }}
          onBlur={save}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span class="hdr-text" onClick={(e) => { e.stopPropagation(); setEdit(col.header); }}>{shown || <span class="muted">(boş)</span>}</span>
      )}
      <button class="hdr-x" title={inVat ? 'KDV dökümünü Excel\'den kaldır (bütün KDV sütunları)' : 'Bu sütunu Excel\'den kaldır'} onClick={(e) => { e.stopPropagation(); onChange(removeColumn(t, k), `${what} ${inVat ? 'Excel\'den kaldırıldı' : 'sütunu kaldırıldı'}`); }}>✕</button>
    </th>
  );
}

/** Atlanan (bu dönemde boş, keep'siz) sütun sayısı: "Boş sütunları atla (n)" ve listedeki "Boş sütunlar (n)" */
export const skippedCount = (e: { columns: { keep?: true }[] }, empty: Set<number>) => [...empty].filter((k) => !e.columns[k].keep).length;

/** Alanı şablona ekler: "Boş sütunları atla" açıkken bu dönemde boş alan "boş da olsa yaz" (keep) ile eklenir, yoksa eklenir eklenmez görünmez olurdu */
export function addField(t: OutputTemplate, id: OutputFieldId): OutputTemplate {
  const inv = S.outputIncluded.value;
  const empty = !t.keepEmpty && inv.length > 0 && id !== 'blank' && id !== 'code' && fieldFill(id, inv, S.outputContext()) === 0;
  return empty ? withColumns(t, [...t.columns, { ...addColumn(t, id).columns[t.columns.length], keep: true }]) : addColumn(t, id);
}

/** Şablonun açık dönemdeki açılımı ve Excel harfleri (şablon penceresinin yerel kopyası için) */
export function expandedOf(t: OutputTemplate) {
  const e = expandTemplate(t, S.outputIncluded.value);
  const empty = emptyColumns(e, S.outputIncluded.value, S.outputContext());
  return { e, empty, letters: excelLettersOf(e, empty) };
}

/** Sütun ekleme seçicisi (önizleme ve liste): alan seçilince sona eklenir; eklenmiş alan harfiyle söylenir */
export function AddColumnSelect({ t, onChange = commitTemplate }: { t: OutputTemplate; onChange?: (next: OutputTemplate, label: string) => void }) {
  const ids = (Object.keys(FIELD_DEFS) as OutputFieldId[]).filter((id) => !INTERNAL_FIELDS.has(id) && id !== 'vat');
  const { e, letters: L } = expandedOf(t);
  const letters = (id: OutputFieldId) => { const ls = e.columns.map((c, k) => (c.id === id ? L[k] ?? '' : null)).filter((l): l is string => l !== null); return !ls.length ? '' : ls.some(Boolean) ? `ekli: ${ls.filter(Boolean).join(', ')}` : 'ekli, bu dönemde boş'; };
  const hasVat = t.columns.some((c) => c.id === 'vat');
  return (
    <select
      class="add-col"
      value=""
      title="Excel'e sütun ekle (sona eklenir; başlığından sürükleyerek yerini değiştirin)"
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = (e.currentTarget as HTMLSelectElement).value;
        (e.currentTarget as HTMLSelectElement).value = '';
        if (v === 'vat') onChange(addField(t, 'vat'), 'KDV dökümü eklendi (Güncel oranlar + Diğer)');
        else if (v) onChange(addField(t, v as OutputFieldId), `"${FIELD_DEFS[v as OutputFieldId].header || 'Boş sütun'}" eklendi`);
      }}
    >
      <option value="">+ Sütun…</option>
      {!hasVat && <option value="vat">KDV dökümü (oranlara göre sütunlar; şablon penceresinde açılımı seçilir)</option>}
      {ids.map((id) => <option value={id}>{FIELD_DEFS[id].label}{id !== 'blank' && letters(id) ? ` · ${letters(id)}` : ''}</option>)}
    </select>
  );
}

/**
 * "Boş sütunları atla" (şablonun parçası, varsayılan açık): dönemde bütün faturalarda boş olan sütunlar Excel'e yazılmaz. Bilerek
 * "boş da olsa yaz" denen (keep) sütun varsa kutu işaretli ama gri görünür; yeniden işaretlemek bu işaretleri siler.
 */
export function SkipEmptyToggle({ t, empty, onChange = commitTemplate }: { t: OutputTemplate; empty: number; onChange?: (next: OutputTemplate, label: string) => void }) {
  const on = !t.keepEmpty;
  const kept = keepCount(t);
  const partial = on && kept > 0;
  const title = partial
    ? `Boş sütunlar atlanıyor; ${kept} sütunu bilerek eklediniz, boş da olsa yazılır. Kutuyu kaldırırsanız bütün boş sütunlar yazılır; yeniden işaretlerseniz bu seçimler de kalkar.`
    : `Bu dönemde bütün faturalarda boş olan sütunlar Excel'e yazılmaz${empty ? ` (şu an ${empty} sütun)` : ''}. Kutuyu kaldırırsanız ekranda gördüğünüz gibi hepsi yazılır. Bilerek eklenen Boş sütun ve Hesap Kodu her zaman yazılır.`;
  return (
    <label class={`skip-empty ${partial ? 'partial' : ''}`} title={title}>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          const v = (e.currentTarget as HTMLInputElement).checked;
          const { keepEmpty: _k, ...rest } = t;
          // Yeniden işaretlenince "boş da olsa yaz" seçimleri silinir: görünen tik yine "bu dönemde yazılıyor" demektir
          onChange(v ? clearKeep(rest) : { ...rest, keepEmpty: true }, v ? 'Boş sütunlar Excel\'e yazılmayacak' : 'Boş sütunlar da Excel\'e yazılacak');
        }}
        onKeyDown={(e) => { if (e.key === ' ') e.stopPropagation(); /* Boşluk kutuyu değiştirir; F1/F5 gibi kısayollar çalışır */ }}
      />
      Boş sütunları atla{on && empty > 0 ? <span class="skip-count"> ({empty})</span> : null}
    </label>
  );
}
