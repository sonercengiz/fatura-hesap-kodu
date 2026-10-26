import { useEffect, useRef } from 'preact/hooks';
import * as S from './state';
import { codeColumnAt } from '../core/excel/writeOutput';

export function PreviewModal() {
  const rows = S.outputRows();
  const invs = S.outputOrder.value;
  const byRow = new Map(invs.map((i, k) => [k, i]));
  const at = codeColumnAt(S.settings.value.codeColumnIndex);
  const box = useRef<HTMLDivElement>(null);
  const counts = { 'no-code': 0, 'not-in-chart': 0, type: 0, 'no-view': 0 } as Record<S.IssueKind, number>;
  const rowIssues = rows.slice(1).map((_, i) => {
    const inv = byRow.get(i);
    const iss = inv ? S.issuesFor(inv).filter((k) => k !== 'no-view') : [];
    for (const k of iss) counts[k]++;
    return iss;
  });
  const firstIssue = rowIssues.findIndex((x) => x.length > 0);

  useEffect(() => {
    if (firstIssue >= 0) box.current?.querySelector<HTMLElement>(`tr[data-i="${firstIssue}"]`)?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <div class="modal-backdrop" onClick={() => (S.previewOpen.value = false)}>
      <div class="modal wide" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">
          <b>Çıktı önizlemesi</b>
          <span class="muted">{rows.length - 1} satır · {rows[0]?.length ?? 0} sütun · Hesap Kodu {colName(at)} sütununda · tarih sırası</span>
          <div class="spacer" />
          <span class="legend">
            {(Object.keys(counts) as S.IssueKind[]).filter((k) => counts[k] > 0).map((k) => (
              <span class={`lg lg-${k}`}>{S.ISSUE_LABEL[k]}: {counts[k]}</span>
            ))}
            {firstIssue < 0 && <span class="lg ok">Sorun yok</span>}
          </span>
          <button class="primary" onClick={() => S.exportExcel()}>Excel üret <kbd>F1</kbd></button>
          <button class="ghost" onClick={() => (S.previewOpen.value = false)}>Kapat <kbd>Esc</kbd></button>
        </div>
        <div class="table-box" ref={box}>
          <table>
            <thead>
              <tr>
                <th class="num">#</th>
                {rows[0]?.map((h, c) => <th class={c === at ? 'code-col' : ''}>{String(h ?? '')}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((r, i) => {
                const iss = rowIssues[i];
                const cls = iss.includes('no-code') ? 'iss-code' : iss.includes('not-in-chart') ? 'iss-other iss-chart' : iss.length ? 'iss-other' : '';
                return (
                  <tr data-i={i} class={cls} title={iss.map((k) => S.ISSUE_LABEL[k]).join('\n')} onDblClick={() => { const inv = byRow.get(i); if (inv) { S.goTo(S.invoices.value.indexOf(inv)); S.previewOpen.value = false; } }}>
                    <td class="num">{i + 1}</td>
                    {r.map((v, c) => <td class={c === at ? 'code-col' : ''}>{v == null ? '' : typeof v === 'number' ? v.toLocaleString('tr-TR') : String(v)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function colName(i: number) {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
