import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import * as S from './state';
import { db, type BatchRecord } from '../storage/db';

/** Dönemi ya da seçili faturaları başka firmaya, seçili faturaları aynı firmanın başka dönemine de taşır (geri taşıma aynı pencereden). */
export function MoveModal() {
  const cur = S.firm.value;
  const others = S.firms.value.filter((f) => f.id !== cur.id);
  const sel = S.selected.value;
  const [scope, setScope] = useState<'batch' | 'selected'>(sel.size ? 'selected' : 'batch');
  const [firmId, setFirmId] = useState(others[0]?.id ?? cur.id);
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [batchId, setBatchId] = useState<string>('__new');
  const close = () => (S.moveOpen.value = false);
  // Açılınca odak pencerede: Enter/Esc arkadaki "taşı" düğmesine değil pencereye gitsin
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { root.current?.focus(); }, []);
  useEffect(() => {
    if (!firmId) return;
    // Açık dönem hedef olamaz (aynı firmada taşırken)
    db.batches.where('firmId').equals(firmId).toArray().then((l) => { setBatches(l.filter((x) => x.id !== S.batchRec.value?.id).sort((a, b) => b.updatedAt - a.updatedAt)); setBatchId('__new'); });
  }, [firmId]);
  const b = S.batchRec.value;
  if (!b) return null;
  // Aynı firmada dönemin tamamı taşınamaz (zaten orada): yalnızca seçili faturalar başka döneme gider
  const sameFirm = firmId === cur.id;
  const eff = sameFirm ? 'selected' : scope;
  const can = !!firmId && !(eff === 'selected' && sel.size === 0);
  const go = async () => {
    if (!can) return;
    if (eff === 'batch') await S.moveBatchToFirm(firmId);
    else await S.moveInvoicesToFirm(Array.from(sel), firmId, batchId === '__new' ? null : batchId);
    close();
  };
  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal" ref={root} tabIndex={-1} onClick={(e) => e.stopPropagation()} onKeyDownCapture={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
        // Enter = Taşı (onay pencereleri gibi; taşıma geri taşınabilir). Açılır listede Enter seçim demektir, ona dokunulmaz.
        else if (e.key === 'Enter' && !(e.target instanceof HTMLSelectElement)) { e.stopPropagation(); e.preventDefault(); go(); }
      }}>
        <div class="modal-head">
          <b>Başka firmaya ya da döneme taşı</b>
          <span class="muted">{cur.name} › {b.name}</span>
        </div>
        <div class="form">
          <fieldset>
            <legend>Ne taşınsın</legend>
            <label class="radio"><input type="radio" name="mscope" checked={eff === 'batch'} disabled={sameFirm} onChange={() => setScope('batch')} /><span>"{b.name}" döneminin tamamı ({S.invoices.value.length} fatura, atamaları ve döneme özel kurallarıyla)</span></label>
            <label class="radio"><input type="radio" name="mscope" checked={eff === 'selected'} disabled={sel.size === 0} onChange={() => setScope('selected')} /><span>Seçili faturalar ({sel.size}) atamalarıyla</span></label>
            {sel.size === 0 && <div class="muted small">Belirli faturaları taşımak için önce listeden seçin (☑ Seç, Shift/Ctrl+tık).</div>}
            {sameFirm && sel.size > 0 && <div class="muted small">Aynı firmada yalnızca seçili faturalar başka döneme taşınır.</div>}
          </fieldset>
          <label><span>Hedef firma</span>
            <select value={firmId} onChange={(e) => setFirmId((e.currentTarget as HTMLSelectElement).value)} onKeyDown={(e) => e.stopPropagation()}>
              {others.map((f) => <option value={f.id}>{f.name}</option>)}
              <option value={cur.id}>{cur.name} (bu firma, başka dönem)</option>
            </select>
          </label>
          {eff === 'selected' && (
            <label><span>Hedef dönem</span>
              <select value={batchId} onChange={(e) => setBatchId((e.currentTarget as HTMLSelectElement).value)} onKeyDown={(e) => e.stopPropagation()}>
                <option value="__new">Yeni dönem (faturaların ayına göre adlanır)</option>
                {batches.map((x) => <option value={x.id}>{x.name} · {new Date(x.createdAt).toLocaleDateString('tr-TR')}</option>)}
              </select>
            </label>
          )}
          <div class="muted small">Taşıma geri alınabilir: hedefte aynı pencereyle geri taşıyın.{sameFirm ? '' : ' Satıcı bazlı öneri geçmişi de taşınır.'} Hedefte zaten olan fatura burada bırakılır.</div>
          <div class="row-inline" style="justify-content:flex-end; gap:8px">
            <button class="ghost" onClick={close}>Vazgeç <kbd>Esc</kbd></button>
            <button class="primary" onClick={go} disabled={!can}>Taşı <kbd>Enter</kbd></button>
          </div>
        </div>
      </div>
    </div>
  );
}
