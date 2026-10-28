import * as S from './state';

/** Yükleme sonucu: eklenen, atlanan (zaten vardı) ve okunamayan dosyalar, nedenleriyle. */
export function ImportReportModal() {
  const r = S.importReport.value;
  if (!r) return null;
  const close = () => (S.importReport.value = null);
  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">
          <b>Yükleme sonucu</b>
          <span class="muted">{r.added} eklendi{r.upgraded ? ` · ${r.upgraded} XML'i tamamlandı` : ''}{r.ruled ? ` · ${r.ruled} kuralla atandı` : ''}{r.skipped ? ` · ${r.skipped} zaten vardı` : ''}{r.edmMatched || r.edmAdded ? ` · EDM listesi: ${r.edmMatched} eşleşti, ${r.edmAdded} eklendi` : ''} · {r.failed.length} okunamadı</span>
          <div class="spacer" />
          <button class="ghost" onClick={close}>Kapat <kbd>Esc</kbd></button>
        </div>
        <div class="form">
          {r.failed.length === 0 && r.skippedFiles.length === 0 && <div class="muted">Bütün dosyalar okundu; atlanan ya da okunamayan dosya yok.</div>}
          {r.failed.length > 0 && (
            <fieldset>
              <legend>Okunamayan dosyalar ({r.failed.length})</legend>
              <div class="muted small">Bu dosyalar döneme eklenmedi. Fatura olmayan dosyalar (irsaliye, yanıt, zarf) normaldir; bozuk görünen bir fatura varsa EDM'den yeniden indirin.</div>
              <div class="acc-list report-list">
                {r.failed.map((f) => (
                  <div class="acc-row report-row"><span class="report-file" title={f.file}>{f.file}</span><span class="report-reason">{f.reason}</span></div>
                ))}
              </div>
            </fieldset>
          )}
          {r.skippedFiles.length > 0 && (
            <fieldset>
              <legend>Zaten dönemde olanlar ({r.skippedFiles.length})</legend>
              <div class="muted small">Aynı fatura numarası bu dönemde zaten vardı; atama ve görsel korunur, dosya yeniden işlenmez.</div>
              <div class="acc-list report-list">
                {r.skippedFiles.slice(0, 200).map((f) => (
                  <div class="acc-row report-row"><span class="report-file" title={f.file}>{f.file}</span><span class="report-reason mono">{f.no}</span></div>
                ))}
                {r.skippedFiles.length > 200 && <div class="muted small">… {r.skippedFiles.length - 200} dosya daha</div>}
              </div>
            </fieldset>
          )}
        </div>
      </div>
    </div>
  );
}
