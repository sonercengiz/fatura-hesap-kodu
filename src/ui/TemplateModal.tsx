import { useState } from 'preact/hooks';
import * as S from './state';
import { FIELD_DEFS, ROW_ORDER_LABELS, DEFAULT_OUTPUT_TEMPLATE, isEdmDefault, buildTemplateRows, type OutputTemplate, type OutputFieldId, type RowOrder } from '../core/excel/template';

const colName = (i: number) => { let s = ''; let n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };

/** Çıktı Excel şablonu: sütunlar (sıra, başlık), satır sırası, sayfa adı; canlı önizleme. */
export function TemplateModal() {
  const [t, setT] = useState<OutputTemplate>(() => JSON.parse(JSON.stringify(S.settings.value.outputTemplate)));
  const [addId, setAddId] = useState<OutputFieldId>('uuid');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const close = () => (S.templateOpen.value = false);
  const save = async () => { await S.setOutputTemplate(t); close(); S.showToast('Çıktı şablonu kaydedildi'); };
  const used = new Set(t.columns.map((c) => c.id));
  const addable = (Object.keys(FIELD_DEFS) as OutputFieldId[]).filter((id) => id === 'blank' || !used.has(id));
  const update = (k: number, patch: Partial<typeof t.columns[number]>) => setT({ ...t, columns: t.columns.map((c, i) => (i === k ? { ...c, ...patch } : c)) });
  const remove = (k: number) => setT({ ...t, columns: t.columns.filter((_, i) => i !== k) });
  const move = (from: number, to: number) => { if (from === to) return; const cols = t.columns.slice(); const [c] = cols.splice(from, 1); cols.splice(to, 0, c); setT({ ...t, columns: cols }); };
  const add = () => { if (!addId) return; setT({ ...t, columns: [...t.columns, { id: addId, header: FIELD_DEFS[addId].header }] }); const next = addable.filter((x) => x !== addId)[0]; if (next) setAddId(next); };
  const sample = S.outputOrder.value.slice(0, 3);
  const preview = buildTemplateRows(sample, t, S.outputContext());
  const codeOk = t.columns.some((c) => c.id === 'code');

  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal wide tpl-modal" onClick={(e) => e.stopPropagation()} onKeyDownCapture={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
        <div class="modal-head">
          <b>Çıktı Excel şablonu</b>
          <span class="muted">{t.columns.length} sütun · {isEdmDefault(t) ? 'EDM düzeni' : 'özelleştirilmiş'}</span>
          <div class="spacer" />
          <button class="ghost" onClick={() => setT(JSON.parse(JSON.stringify(DEFAULT_OUTPUT_TEMPLATE)))} title="EDM fatura listesinin 20 sütunu + C'de Hesap Kodu">EDM varsayılanına dön</button>
          <button class="primary" onClick={save} disabled={!codeOk || t.columns.length === 0}>Kaydet</button>
          <button class="ghost" onClick={close}>Vazgeç <kbd>Esc</kbd></button>
        </div>
        <div class="tpl-body">
          <div class="tpl-cols">
            <div class="muted small">Sürükleyerek sıralayın; başlık metnini doğrudan düzenleyin. GMS içe aktarma şablonunuz hangi başlıkları bekliyorsa onları yazın.</div>
            {t.columns.map((c, k) => (
              <div
                class={`tpl-row ${dragIdx === k ? 'dragging' : ''} ${c.id === 'code' ? 'is-code' : ''}`}
                draggable
                onDragStart={(e) => { setDragIdx(k); e.dataTransfer?.setData('text/plain', String(k)); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const from = Number(e.dataTransfer?.getData('text/plain') || String(dragIdx)); if (!Number.isNaN(from)) move(from, k); setDragIdx(null); }}
                onDragEnd={() => setDragIdx(null)}
              >
                <span class="tpl-letter">{colName(k)}</span>
                <input class="tpl-header" value={c.header} placeholder={c.id === 'blank' ? '(boş başlık)' : FIELD_DEFS[c.id].header} onInput={(e) => update(k, { header: (e.currentTarget as HTMLInputElement).value })} onKeyDown={(e) => e.stopPropagation()} />
                <span class="tpl-field muted small" title={FIELD_DEFS[c.id].label}>{FIELD_DEFS[c.id].label}</span>
                <button class="ghost tiny" title="Yukarı" disabled={k === 0} onClick={() => move(k, k - 1)}>↑</button>
                <button class="ghost tiny" title="Aşağı" disabled={k === t.columns.length - 1} onClick={() => move(k, k + 1)}>↓</button>
                <button class="ghost tiny" title={c.id === 'code' ? 'Hesap Kodu sütunu kaldırılamaz' : 'Sütunu kaldır'} disabled={c.id === 'code'} onClick={() => remove(k)}>✕</button>
              </div>
            ))}
            <div class="tpl-add">
              <select value={addId} onChange={(e) => setAddId((e.currentTarget as HTMLSelectElement).value as OutputFieldId)} onKeyDown={(e) => e.stopPropagation()}>
                {addable.map((id) => <option value={id}>{FIELD_DEFS[id].label}</option>)}
              </select>
              <button onClick={add} disabled={!addable.length}>+ Sütun ekle</button>
            </div>
          </div>
          <div class="tpl-side">
            <label><span>Satır sırası</span>
              <select value={t.rowOrder} onChange={(e) => setT({ ...t, rowOrder: (e.currentTarget as HTMLSelectElement).value as RowOrder })} onKeyDown={(e) => e.stopPropagation()}>
                {(Object.keys(ROW_ORDER_LABELS) as RowOrder[]).map((o) => <option value={o}>{ROW_ORDER_LABELS[o]}</option>)}
              </select>
            </label>
            <label><span>Sayfa adı</span>
              <input value={t.sheetName} onInput={(e) => setT({ ...t, sheetName: (e.currentTarget as HTMLInputElement).value })} onKeyDown={(e) => e.stopPropagation()} placeholder="Sheet0" />
            </label>
            <div class="muted small">Hesap kodu, VKN ve ETTN metin tipinde yazılır (Excel sayıya çevirmez). Tutar, matrah, vergi sayıdır. Şablon çalışma alanı yedeğine girer.</div>
            <div class="tpl-preview">
              <div class="muted small">Önizleme (ilk {sample.length} satır)</div>
              <div class="table-box">
                <table>
                  <thead><tr>{preview[0]?.map((h, c) => <th class={t.columns[c].id === 'code' ? 'code-col' : ''}>{String(h ?? '') || <span class="muted">(boş)</span>}</th>)}</tr></thead>
                  <tbody>{preview.slice(1).map((r) => <tr>{r.map((v, c) => <td class={t.columns[c].id === 'code' ? 'code-col' : ''}>{v == null ? '' : typeof v === 'number' ? v.toLocaleString('tr-TR') : String(v)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
