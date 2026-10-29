import { useState } from 'preact/hooks';
import * as S from './state';
import { FIELD_DEFS, KDV_FIELD_IDS, colName, vatGroupOf, addColumn, removeColumn, renameColumn, moveColumn, withColumns, type OutputTemplate, type OutputFieldId } from '../core/excel/template';

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

/**
 * Önizleme ve liste tablosunda düzenlenebilir sütun başlığı: harf + başlık; tıkla → yeniden adlandır, sürükle → sırala, ✕ → kaldır.
 * `k` şablondaki sütun sırasıdır (listede gizli sütunlar atlansa da doğru sütun değişir).
 */
export function HeaderCell({ t, k, cls = '', label, letter, onChange = commitTemplate }: { t: OutputTemplate; k: number; cls?: string; label?: string; letter?: string | null; onChange?: (next: OutputTemplate, label: string) => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const c = t.columns[k];
  const shown = label ?? c.header;
  // Başlık hücresiyle aynı hizada (para sağa); KDV sütunlarında oran grubunun rengi
  const g = vatGroupOf(c.id);
  const align = FIELD_DEFS[c.id].money && !/(^| )r( |$)/.test(cls) ? ' r' : '';
  const save = () => {
    if (edit !== null && edit !== c.header) onChange(renameColumn(t, k, edit), `Başlık "${edit || '(boş)'}" oldu`);
    setEdit(null);
  };
  return (
    <th
      class={`${cls}${align}${g ? ` vg vg-${g}` : ''} hdr-edit ${over ? 'drop-over' : ''} ${letter === null ? 'skipped' : ''}`}
      draggable={edit === null}
      title={`${FIELD_DEFS[c.id].label}\nTıkla: başlığı değiştir · sürükle: sırasını değiştir · ✕: Excel'den kaldır`}
      onDragStart={(e) => { e.dataTransfer?.setData('text/x-col', String(k)); }}
      onDragOver={(e) => { if (e.dataTransfer?.types.includes('text/x-col')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const from = Number(e.dataTransfer?.getData('text/x-col')); if (!Number.isNaN(from) && from !== k) onChange(moveColumn(t, from, k), `"${t.columns[from].header || '(boş)'}" ${colName(k)} sütununa taşındı`); }}
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
        <span class="hdr-text" onClick={(e) => { e.stopPropagation(); setEdit(c.header); }}>{shown || <span class="muted">(boş)</span>}</span>
      )}
      <button class="hdr-x" title="Bu sütunu Excel'den kaldır" onClick={(e) => { e.stopPropagation(); onChange(removeColumn(t, k), `"${c.header || '(boş)'}" sütunu kaldırıldı`); }}>✕</button>
    </th>
  );
}

/** Sütun ekleme seçicisi (önizleme ve liste): alan seçilince sona eklenir; eklenmiş alan harfiyle söylenir */
export function AddColumnSelect({ t, onChange = commitTemplate }: { t: OutputTemplate; onChange?: (next: OutputTemplate, label: string) => void }) {
  const ids = Object.keys(FIELD_DEFS) as OutputFieldId[];
  const letters = (id: OutputFieldId) => t.columns.map((c, k) => (c.id === id ? colName(k) : '')).filter(Boolean).join(', ');
  const missingKdv = KDV_FIELD_IDS.filter((id) => !t.columns.some((c) => c.id === id));
  return (
    <select
      class="add-col"
      value=""
      title="Excel'e sütun ekle (sona eklenir; başlığından sürükleyerek yerini değiştirin)"
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = (e.currentTarget as HTMLSelectElement).value;
        (e.currentTarget as HTMLSelectElement).value = '';
        if (v === 'kdv') onChange(withColumns(t, [...t.columns, ...missingKdv.map((id) => ({ id, header: FIELD_DEFS[id].header }))]), `KDV dökümü eklendi (${missingKdv.length} sütun)`);
        else if (v) onChange(addColumn(t, v as OutputFieldId), `"${FIELD_DEFS[v as OutputFieldId].header || 'Boş sütun'}" eklendi`);
      }}
    >
      <option value="">+ Sütun…</option>
      {missingKdv.length > 0 && <option value="kdv">KDV dökümü ({missingKdv.length} sütun)</option>}
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
