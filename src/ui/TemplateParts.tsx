import { useState } from 'preact/hooks';
import * as S from './state';
import { FIELD_DEFS, INTERNAL_FIELDS, colName, vatGroupOf, fieldOf, defaultHeaderOf, expandTemplate, emptyColumns, excelLettersOf, addColumn, removeColumn, renameColumn, moveColumn, withColumns, type OutputTemplate, type OutputFieldId, type ExpandedColumn } from '../core/excel/template';

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

/** Atlanan sütunun açıklaması (harfin yerinde "boş, yazılmaz") */
export const SKIPPED_HINT = 'Bu dönemdeki faturaların hiçbirinde bu bilgi yok; sütun Excel\'e yazılmaz, sonraki sütun onun harfini alır. "Boş sütunları atla" kutusunu kaldırırsanız yazılır.';

/** KDV dökümü öğesinin bir alt başlığını değiştirir (varsayılana dönerse kaydı silinir) */
function renameVatPart(t: OutputTemplate, k: number, part: string, header: string, def: string): OutputTemplate {
  const item = t.columns[k];
  const vatHeaders = { ...item.vatHeaders };
  if (header === def) delete vatHeaders[part]; else vatHeaders[part] = header;
  const { vatHeaders: _old, ...rest } = item;
  return withColumns(t, t.columns.map((c, i) => (i === k ? { ...rest, ...(Object.keys(vatHeaders).length ? { vatHeaders } : {}) } : c)));
}

/**
 * Önizleme ve liste tablosunda düzenlenebilir sütun başlığı: harf + başlık; tıkla → yeniden adlandır, sürükle → sırala, ✕ → kaldır.
 * `col` Excel'e yazılan (açılmış) sütundur; `col.src` şablondaki sütun. KDV dökümünün bir parçasında ad yalnızca o başlığı değiştirir,
 * sürükleme ve ✕ bütün KDV dökümünü taşır/kaldırır.
 */
export function HeaderCell({ t, col, cls = '', label, letter, onChange = commitTemplate }: { t: OutputTemplate; col: ExpandedColumn; cls?: string; label?: string; letter?: string | null; onChange?: (next: OutputTemplate, label: string) => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const k = col.src;
  const inVat = !!col.part;
  const shown = label ?? col.header;
  const save = () => {
    if (edit !== null && edit !== col.header) {
      onChange(inVat ? renameVatPart(t, k, col.part as string, edit, defaultHeaderOf(col)) : renameColumn(t, k, edit), `Başlık "${edit || '(boş)'}" oldu`);
    }
    setEdit(null);
  };
  // Başlık hücresiyle aynı hizada (para sağa); KDV sütunlarında oran grubunun rengi
  const g = vatGroupOf(col);
  const align = fieldOf(col).money && !/(^| )r( |$)/.test(cls) ? ' r' : '';
  const what = inVat ? 'KDV dökümü' : `"${col.header || '(boş)'}"`;
  return (
    <th
      class={`${cls}${align}${g ? ` vg vg-${g}` : ''} hdr-edit ${over ? 'drop-over' : ''} ${letter === null ? 'skipped' : ''}`}
      draggable={edit === null}
      title={`${fieldOf(col).label}${inVat ? ' · KDV dökümünün parçası' : ''}\nTıkla: başlığı değiştir · sürükle: ${inVat ? 'KDV dökümünün' : ''} sırasını değiştir · ✕: ${inVat ? 'KDV dökümünü' : ''} Excel'den kaldır`.replace(/  +/g, ' ')}
      onDragStart={(e) => { e.dataTransfer?.setData('text/x-col', String(k)); }}
      onDragOver={(e) => { if (e.dataTransfer?.types.includes('text/x-col')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const from = Number(e.dataTransfer?.getData('text/x-col')); if (!Number.isNaN(from) && from !== k) onChange(moveColumn(t, from, k), `"${t.columns[from].id === 'vat' ? 'KDV dökümü' : t.columns[from].header || '(boş)'}" taşındı`); }}
    >
      {letter === null
        ? <span class="col-letter skipped" title={SKIPPED_HINT}>boş, yazılmaz</span>
        : <span class="col-letter">{letter ?? colName(k)}</span>}
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
  const letters = (id: OutputFieldId) => e.columns.map((c, k) => (c.id === id ? L[k] ?? 'boş' : '')).filter(Boolean).join(', ');
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
        if (v === 'vat') onChange(addColumn(t, 'vat'), 'KDV dökümü eklendi (Güncel oranlar + Diğer)');
        else if (v) onChange(addColumn(t, v as OutputFieldId), `"${FIELD_DEFS[v as OutputFieldId].header || 'Boş sütun'}" eklendi`);
      }}
    >
      <option value="">+ Sütun…</option>
      {!hasVat && <option value="vat">KDV dökümü (oranlara göre sütunlar; şablon penceresinde açılımı seçilir)</option>}
      {ids.map((id) => <option value={id}>{FIELD_DEFS[id].label}{id !== 'blank' && letters(id) ? ` · ekli: ${letters(id)}` : ''}</option>)}
    </select>
  );
}

/** "Boş sütunları atla" (şablonun parçası, varsayılan açık): dönemde bütün faturalarda boş olan sütunlar Excel'e yazılmaz */
export function SkipEmptyToggle({ t, empty, onChange = commitTemplate }: { t: OutputTemplate; empty: number; onChange?: (next: OutputTemplate, label: string) => void }) {
  const on = !t.keepEmpty;
  return (
    <label class="skip-empty" title={`Bu dönemde bütün faturalarda boş olan sütunlar Excel'e yazılmaz${empty ? ` (şu an ${empty} sütun)` : ''}. Kutuyu kaldırırsanız ekranda gördüğünüz gibi hepsi yazılır. Bilerek eklenen Boş sütun ve Hesap Kodu her zaman yazılır.`}>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          const v = (e.currentTarget as HTMLInputElement).checked;
          const { keepEmpty: _k, ...rest } = t;
          onChange(v ? rest : { ...rest, keepEmpty: true }, v ? 'Boş sütunlar Excel\'e yazılmayacak' : 'Boş sütunlar da Excel\'e yazılacak');
        }}
        onKeyDown={(e) => { if (e.key === ' ') e.stopPropagation(); /* Boşluk kutuyu değiştirir; F1/F5 gibi kısayollar çalışır */ }}
      />
      Boş sütunları atla{on && empty > 0 ? <span class="skip-count"> ({empty})</span> : null}
    </label>
  );
}
