import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from './state';
import { fmtMoney } from '../core/num';
import type { ExportRecord } from '../storage/db';

/** Kayıttaki uyarı türleri (eski/bilinmeyen tür atlanır), seviye sırasıyla */
const kindsOf = (ks: string[]) => ks.filter((k): k is S.IssueKind => k in S.ISSUE_META).sort((a, b) => S.LEVEL_RANK[S.levelOf(b)] - S.LEVEL_RANK[S.levelOf(a)]);
const when = (at: number) => new Date(at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Uyarı çipi (önizleme lejantıyla aynı renk); sayı verilirse "Kısa ad: n" */
function IssueChip({ k, n, muted }: { k: S.IssueKind; n?: number; muted?: boolean }) {
  const m = S.ISSUE_META[k];
  return <span class={`lg lvl-${m.level}`} title={`${m.label}${muted ? '\nÇıktı anında önizlemede rengi kapalıydı' : ''}`}>{m.short ?? m.label}{n !== undefined ? `: ${n}` : ''}{muted ? ' (kapalıydı)' : ''}</span>;
}

/**
 * Verilen çıktılar (açık dönem): her Excel üretiminde kaydedilen satır/sütun ve uyarılar. Kayıt seçilince çıktı anındaki uyarılı
 * faturalar ve şimdiki durumları ("Sürüyor" / "Giderildi"); Gez bu faturalarda Tab ile dolaşmayı başlatır.
 */
export function ExportsModal() {
  const list = S.exportsList.value;
  const [sel, setSel] = useState<string | null>(list[0]?.id ?? null);
  const rec: ExportRecord | undefined = list.find((r) => r.id === sel) ?? list[0];
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  const close = () => { S.exportsOpen.value = false; };
  const byNo = new Map(S.invoices.value.map((i) => [i.no, i]));

  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal exports-modal" ref={box} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">
          <b>Verilen çıktılar</b>
          <span class="muted small">{S.batchRec.value?.name} · {list.length} çıktı</span>
          <div class="spacer" />
          {rec && rec.flagged.length > 0 && <button class="primary" onClick={() => S.startTour(rec)} title="Bu çıktıdaki uyarılı faturaları sırayla aç: Tab / Shift+Tab yalnızca bunlarda gezer">Gez</button>}
          <button class="ghost" onClick={close}>Kapat <kbd>Esc</kbd></button>
        </div>
        {!list.length ? (
          <div class="exp-empty muted">Bu dönemde henüz Excel üretilmedi. <b>Excel üret</b> (<kbd>F1</kbd>) her seferinde buraya bir kayıt bırakır: kaç satır, hangi uyarılarla verildi.</div>
        ) : (
          <div class="exp-body">
            <div class="exp-list">
              {list.map((r) => {
                const kinds = kindsOf(Object.keys(r.issues));
                return (
                  <button class={`exp-rec ${r.id === rec?.id ? 'on' : ''}`} onClick={() => setSel(r.id)}>
                    <span class="exp-when">{when(r.at)}</span>
                    <span class="exp-file" title={r.fileName}>{r.fileName}</span>
                    <span class="muted small">{r.rows} satır · {r.columns.length} sütun{r.flagged.length ? ` · ${r.flagged.length} uyarılı fatura` : ''}</span>
                    <span class="exp-chips">
                      {r.flagged.length > 0 ? <span class="exp-despite">Uyarılara rağmen</span> : <span class="lg ok">Uyarısız</span>}
                      {kinds.map((k) => <IssueChip k={k} n={r.issues[k]} muted={r.muted.includes(k)} />)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div class="exp-detail">
              {rec && (rec.flagged.length ? (
                <div class="table-box exp-flagged">
                  <table>
                    <thead><tr><th>Fatura No</th><th>Satıcı</th><th>Tutar</th><th>Uyarılar (çıktı anında)</th><th>Şimdi</th></tr></thead>
                    <tbody>
                      {rec.flagged.map((f) => {
                        const inv = byNo.get(f.no);
                        const now = inv ? S.outputIssues(inv).filter((k) => f.kinds.includes(k)) : [];
                        const lvl = S.topLevel(now);
                        return (
                          <tr class={inv ? '' : 'excluded'} onDblClick={() => { if (inv) { S.goTo(S.invoices.value.indexOf(inv)); close(); } }} title={inv ? 'Çift tık: faturayı aç' : undefined}>
                            <td class="mono">{f.no}</td>
                            <td class="exp-supplier" title={inv?.supplierName}>{inv?.supplierName ?? ''}</td>
                            <td class="r">{inv ? fmtMoney(inv.amount) : ''}</td>
                            <td class="exp-kinds">{kindsOf(f.kinds).map((k) => <IssueChip k={k} />)}</td>
                            <td>{!inv ? <span class="exp-now muted">Dönemde yok</span> : lvl ? <span class={`exp-now iss-txt lvl-${lvl}`} title={now.map((k) => S.issueText(inv, k)).join('\n')}>Sürüyor</span> : <span class="exp-now ok">Giderildi</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <div class="exp-empty muted">Bu çıktıda uyarılı fatura yoktu.</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Uyarılı faturalar turu şeridi: üst çubuğun altında; Tab / Shift+Tab yalnızca turun faturalarında gezer */
export function TourBar() {
  const t = S.tour.value;
  if (!t) return null;
  return (
    <div class="tour-bar">
      <b>{t.label}</b>
      <span>· Uyarılı {t.nos.length} fatura · {t.i + 1}/{t.nos.length}</span>
      <button class="tiny ghost" disabled={S.tourAtEnd(-1)} onClick={() => S.tourStep(-1)} title="Önceki uyarılı fatura (Shift+Tab)">◀ Önceki</button>
      <button class="tiny ghost" disabled={S.tourAtEnd(1)} onClick={() => S.tourStep(1)} title="Sonraki uyarılı fatura (Tab)">Sonraki ▶</button>
      <button class="tiny" onClick={S.endTour} title="Turu bitir (Esc); Tab yine atanmamış faturalara gider">Bitir</button>
      <span class="muted small">Tab / Shift+Tab bu faturalarda gezer · Esc bitirir</span>
    </div>
  );
}
