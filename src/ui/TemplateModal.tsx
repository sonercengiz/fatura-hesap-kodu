import { useState } from 'preact/hooks';
import * as S from './state';
import { askConfirm } from './dialog';
import { fmtCell } from '../core/num';
import { FIELD_DEFS, KDV_FIELD_IDS, DATE_CELLS_LABELS, colName, type DateCells, vatFieldsFor, vatUncovered, ROW_ORDER_LABELS, DEFAULT_OUTPUT_TEMPLATE, isEdmDefault, buildTemplateRows, type OutputTemplate, type OutputFieldId, type RowOrder } from '../core/excel/template';

/** Çıktı Excel şablonu: sütunlar (sıra, başlık), satır sırası, sayfa adı; canlı önizleme. */
export function TemplateModal() {
  const [t, setT] = useState<OutputTemplate>(() => JSON.parse(JSON.stringify(S.outputTemplate.value)));
  const [addId, setAddId] = useState<OutputFieldId>('uuid');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  // Uygulamada anında kaydetmeyen tek pencere: değişiklik Kaydet'e basınca geçerli olur, kaydedilmemişse kapatırken sorulur
  const dirty = JSON.stringify(t) !== JSON.stringify(S.outputTemplate.value);
  const close = async () => {
    if (dirty && !(await askConfirm({ title: 'Şablon kaydedilmedi', message: 'Bu pencerede yaptığınız değişiklikler Kaydet\'e basılmadan geçerli olmaz. Kaydetmeden kapatılırsa kaybolur.', okLabel: 'Kaydetmeden kapat', danger: true }))) return;
    S.templateOpen.value = false;
  };
  S.modalClosers.template = close;
  const save = async () => { await S.setOutputTemplate(t); S.templateOpen.value = false; S.showToast(`Çıktı şablonu kaydedildi (${S.firm.value.name})`); };
  const others = S.firms.value.filter((f) => f.id !== S.firm.value.id && f.outputTemplate);
  const copyFrom = (id: string) => { const f = others.find((x) => x.id === id); if (f?.outputTemplate) setT(JSON.parse(JSON.stringify(f.outputTemplate))); };
  const used = new Set(t.columns.map((c) => c.id));
  // Aynı alan birden çok sütunda olabilir (GMS şablonunda Tarih C ve Belge Tarihi H aynı değer); eklenmişse harfi söylenir
  const addable = Object.keys(FIELD_DEFS) as OutputFieldId[];
  const lettersOf = (id: OutputFieldId) => t.columns.map((c, k) => (c.id === id ? colName(k) : '')).filter(Boolean).join(', ');
  const update = (k: number, patch: Partial<typeof t.columns[number]>) => setT({ ...t, columns: t.columns.map((c, i) => (i === k ? { ...c, ...patch } : c)) });
  const remove = (k: number) => setT({ ...t, columns: t.columns.filter((_, i) => i !== k) });
  const move = (from: number, to: number) => { if (from === to) return; const cols = t.columns.slice(); const [c] = cols.splice(from, 1); cols.splice(to, 0, c); setT({ ...t, columns: cols }); };
  const add = () => { if (!addId) return; setT({ ...t, columns: [...t.columns, { id: addId, header: FIELD_DEFS[addId].header }] }); const next = addable.find((x) => x !== addId && x !== 'blank' && !used.has(x)); if (next && addId !== 'blank') setAddId(next); };
  const missingKdv = KDV_FIELD_IDS.filter((id) => !used.has(id));
  // Açık dönemde şablonun KDV dökümüne yazılamayan oranlar (örn. eski %8/%18): söylenir, tek tıkla eklenir
  const gapCount = new Map<string, number>();
  for (const inv of S.invoices.value) for (const r of new Set(vatUncovered(inv, t))) { const k = r === null ? 'odd' : String(r); gapCount.set(k, (gapCount.get(k) ?? 0) + 1); }
  const gapFields = [...gapCount.keys()].flatMap((k) => vatFieldsFor(k === 'odd' ? null : Number(k))).filter((id) => !used.has(id));
  const gapText = [...gapCount].map(([k, n]) => `${k === 'odd' ? 'oranı uyuşmayan KDV' : `%${k}`} (${n} fatura)`).join(', ');
  const addKdv = () => setT({ ...t, columns: [...t.columns, ...missingKdv.map((id) => ({ id, header: FIELD_DEFS[id].header }))] });
  const sample = S.outputOrder.value.slice(0, 3);
  const preview = buildTemplateRows(sample, t, S.outputContext());

  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal wide tpl-modal" onClick={(e) => e.stopPropagation()} onKeyDownCapture={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
        <div class="modal-head">
          <b>Çıktı Excel şablonu</b>
          <span class="tpl-firm" title="Her firmanın kendi şablonu var; burada yaptığınız değişiklik yalnızca bu firmanın Excel'ini etkiler">{S.firm.value.name}</span>
          <span class="muted">{t.columns.length} sütun · {isEdmDefault(t) ? 'EDM düzeni' : 'özelleştirilmiş'}</span>
          {dirty
            ? <span class="tpl-dirty" title="Değişiklikler Kaydet'e basınca geçerli olur">● kaydedilmedi</span>
            : <span class="muted small" title="Uygulamanın diğer pencereleri anında kaydeder; bu pencere Kaydet ile çalışır">değişiklikler Kaydet ile geçerli olur</span>}
          <div class="spacer" />
          {others.length > 0 && (
            <select class="tpl-copy" value="" title="Başka bir firmanın şablonunu buraya kopyala (Kaydet'e basana kadar bir şey değişmez)" onChange={(e) => { copyFrom((e.currentTarget as HTMLSelectElement).value); (e.currentTarget as HTMLSelectElement).value = ''; }} onKeyDown={(e) => e.stopPropagation()}>
              <option value="">Başka firmadan al…</option>
              {others.map((f) => <option value={f.id}>{f.name}</option>)}
            </select>
          )}
          <button class="ghost" onClick={() => setT(JSON.parse(JSON.stringify(DEFAULT_OUTPUT_TEMPLATE)))} title="EDM fatura listesinin 20 sütunu + C'de Hesap Kodu">EDM varsayılanına dön</button>
          <button class="primary" onClick={save} disabled={t.columns.length === 0}>Kaydet</button>
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
                <button class="ghost tiny" title="Sütunu kaldır" onClick={() => remove(k)}>✕</button>
              </div>
            ))}
            <div class="tpl-add">
              <select value={addId} onChange={(e) => setAddId((e.currentTarget as HTMLSelectElement).value as OutputFieldId)} onKeyDown={(e) => e.stopPropagation()}>
                {addable.map((id) => <option value={id}>{FIELD_DEFS[id].label}{id !== 'blank' && used.has(id) ? ` · ekli: ${lettersOf(id)}` : ''}</option>)}
              </select>
              <button onClick={add} disabled={!addable.length}>+ Sütun ekle</button>
              <button class="tpl-add-kdv" onClick={addKdv} disabled={!missingKdv.length} title="KDV oranına göre matrah ve KDV tutarı sütunları: %0, %1, %10, %20 ve diğer oranlar (%8, %18 gibi). Faturada o oran yoksa hücre boş kalır.">{missingKdv.length ? `+ KDV dökümü (${missingKdv.length} sütun)` : 'KDV dökümü ekli'}</button>
            </div>
            {gapText && (
              <div class="tpl-gap warn small">
                Bu dönemde şablonda sütunu olmayan KDV var: {gapText}. Eklenmezse bu tutarlar Excel'e yazılmaz.
                {gapFields.length > 0 && <button class="tiny" onClick={() => setT({ ...t, columns: [...t.columns, ...gapFields.map((id) => ({ id, header: FIELD_DEFS[id].header }))] })}>+ Ekle ({gapFields.length} sütun)</button>}
              </div>
            )}
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
            <label><span>Tarih hücreleri</span>
              <select class="tpl-date-cells" value={t.dateCells ?? 'text'} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value as DateCells; const { dateCells: _, ...rest } = t; setT(v === 'date' ? { ...rest, dateCells: 'date' } : rest); }} onKeyDown={(e) => e.stopPropagation()} title="GMS'nin kendi içe aktarma şablonu gerçek tarih kullanır; EDM listesi metin">
                {(Object.keys(DATE_CELLS_LABELS) as DateCells[]).map((o) => <option value={o}>{DATE_CELLS_LABELS[o]}</option>)}
              </select>
            </label>
            <div class="muted small">Başlıklar, hesap kodu, VKN ve ETTN metin tipinde yazılır (Excel sayıya çevirmez; "%20" başlığı "0,2" olmaz). Tutar, matrah, vergi sayıdır. Şablon bu firmaya özeldir ve çalışma alanı yedeğine girer; yeni firma açık firmanın şablonuyla başlar.</div>
            <div class="tpl-preview">
              <div class="muted small">Önizleme (ilk {sample.length} satır)</div>
              <div class="table-box">
                <table>
                  <thead><tr>{preview[0]?.map((h, c) => <th class={t.columns[c].id === 'code' ? 'code-col' : FIELD_DEFS[t.columns[c].id]?.money ? 'r' : ''}><span class="col-letter">{colName(c)}</span>{String(h ?? '') || <span class="muted">(boş)</span>}</th>)}</tr></thead>
                  <tbody>{preview.slice(1).map((r) => <tr>{r.map((v, c) => <td class={t.columns[c].id === 'code' ? 'code-col' : FIELD_DEFS[t.columns[c].id]?.money ? 'r' : ''}>{fmtCell(v, !!FIELD_DEFS[t.columns[c].id]?.money)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
