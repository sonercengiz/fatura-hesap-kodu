import { useEffect, useState } from 'preact/hooks';
import * as S from './state';
import { db, type BatchRecord } from '../storage/db';

/** Yanlış firmaya yüklenen dönemi ya da seçili faturaları başka firmaya taşır (geri taşıma aynı pencereden). */
export function MoveModal() {
  const cur = S.firm.value;
  const others = S.firms.value.filter((f) => f.id !== cur.id);
  const sel = S.selected.value;
  const [scope, setScope] = useState<'batch' | 'selected'>(sel.size ? 'selected' : 'batch');
  const [firmId, setFirmId] = useState(others[0]?.id ?? '');
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [batchId, setBatchId] = useState<string>('__new');
  const close = () => (S.moveOpen.value = false);
  useEffect(() => {
    if (!firmId) return;
    db.batches.where('firmId').equals(firmId).toArray().then((l) => { setBatches(l.sort((a, b) => b.updatedAt - a.updatedAt)); setBatchId('__new'); });
  }, [firmId]);
  const b = S.batchRec.value;
  if (!b) return null;
  const go = async () => {
    if (!firmId) return;
    if (scope === 'batch') await S.moveBatchToFirm(firmId);
    else await S.moveInvoicesToFirm(Array.from(sel), firmId, batchId === '__new' ? null : batchId);
    close();
  };
  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal" onClick={(e) => e.stopPropagation()} onKeyDownCapture={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
        <div class="modal-head">
          <b>Başka firmaya taşı</b>
          <span class="muted">{cur.name} › …</span>
          <div class="spacer" />
          <button class="ghost" onClick={close}>Vazgeç <kbd>Esc</kbd></button>
        </div>
        <div class="form">
          {others.length === 0 ? (
            <div class="muted">Başka firma yok. Önce üst çubuktan "+ Yeni firma…" ile firma ekleyin.</div>
          ) : (
            <>
              <fieldset>
                <legend>Ne taşınsın</legend>
                <label class="radio"><input type="radio" name="mscope" checked={scope === 'batch'} onChange={() => setScope('batch')} /><span>"{b.name}" döneminin tamamı ({S.invoices.value.length} fatura, atamaları ve döneme özel kurallarıyla)</span></label>
                <label class="radio"><input type="radio" name="mscope" checked={scope === 'selected'} disabled={sel.size === 0} onChange={() => setScope('selected')} /><span>Seçili faturalar ({sel.size}) atamalarıyla</span></label>
                {sel.size === 0 && <div class="muted small">Belirli faturaları taşımak için önce listeden seçin (☑ Seç, Shift/Ctrl+tık).</div>}
              </fieldset>
              <label><span>Hedef firma</span>
                <select value={firmId} onChange={(e) => setFirmId((e.currentTarget as HTMLSelectElement).value)} onKeyDown={(e) => e.stopPropagation()}>
                  {others.map((f) => <option value={f.id}>{f.name}</option>)}
                </select>
              </label>
              {scope === 'selected' && (
                <label><span>Hedef dönem</span>
                  <select value={batchId} onChange={(e) => setBatchId((e.currentTarget as HTMLSelectElement).value)} onKeyDown={(e) => e.stopPropagation()}>
                    <option value="__new">Yeni dönem (faturaların ayına göre adlanır)</option>
                    {batches.map((x) => <option value={x.id}>{x.name} · {new Date(x.createdAt).toLocaleDateString('tr-TR')}</option>)}
                  </select>
                </label>
              )}
              <div class="muted small">Taşıma geri alınabilir: hedef firmada aynı pencereyle geri taşıyın. Satıcı bazlı öneri geçmişi de taşınır.</div>
              <div class="row-inline" style="justify-content:flex-end">
                <button class="primary" onClick={go} disabled={!firmId || (scope === 'selected' && sel.size === 0)}>Taşı</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
