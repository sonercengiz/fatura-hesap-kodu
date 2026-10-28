import { useEffect, useRef } from 'preact/hooks';
import * as S from './state';
import { FIELD_DEFS, colName } from '../core/excel/template';
import { HeaderCell, AddColumnSelect, SkipEmptyToggle } from './TemplateParts';
import { fmtCell } from '../core/num';

export function PreviewModal() {
  // Çıkarılanlar da gösterilir (soluk, üstü çizili) ki buradan geri alınabilsin; Excel'e yalnızca işaretliler yazılır
  const rows = S.outputRowsAll();
  const invs = S.outputOrder.value;
  const excl = S.excludedCount.value;
  let excelRow = 1;
  const byRow = new Map(invs.map((i, k) => [k, i]));
  const at = S.outputCodeAt.value;
  const t = S.outputTemplate.value;
  const money = S.writtenTemplate.value.columns.map((c) => !!FIELD_DEFS[c.id]?.money);
  // Excel'e yazılan sütunların şablondaki sırası (boş sütunlar atlanıyorsa onlar yok); başlık düzenlemesi şablona yazar
  const shownIdx = t.columns.map((_, k) => k).filter((k) => S.excelLetters.value[k] !== null);
  const skipped = t.columns.length - shownIdx.length;
  const box = useRef<HTMLDivElement>(null);
  const counts = Object.fromEntries(Object.keys(S.ISSUE_LABEL).map((k) => [k, 0])) as Record<S.IssueKind, number>;
  // Şablonda Hesap Kodu sütunu yoksa (yalnızca veri toplama) kodsuzluk çıktı için sorun değildir
  const skip = new Set<S.IssueKind>(at < 0 ? ['no-view', 'no-code', 'not-in-chart'] : ['no-view']);
  const rowIssues = rows.slice(1).map((_, i) => {
    const inv = byRow.get(i);
    const iss = inv ? S.issuesFor(inv).filter((k) => !skip.has(k)) : [];
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
          <span class="muted">{rows.length - 1 - excl} satır{excl > 0 ? ` (+${excl} çıkarıldı)` : ''} ·  <span title={skipped > 0 ? `${skipped} boş sütun Excel'e yazılmıyor (Boş sütunları atla)` : undefined}>{rows[0]?.length ?? 0} sütun</span> · {at >= 0 ? `Hesap Kodu ${colName(at)} sütununda` : 'Hesap Kodu sütunu yok'}</span>
          <SkipEmptyToggle t={t} empty={S.emptyCols.value.size} />
          <AddColumnSelect t={t} />
          <button class="ghost tiny" onClick={() => { S.previewOpen.value = false; S.templateOpen.value = true; }} title="Şablon penceresi: genel / firma / dönem şablonu, satır sırası, sayfa adı, tarih biçimi">Şablon penceresi…</button>
          <div class="spacer" />
          <span class="legend">
            {(Object.keys(counts) as S.IssueKind[]).filter((k) => counts[k] > 0).map((k) => (
              <span class={`lg lg-${k}`} title={S.ISSUE_LABEL[k]}>{S.ISSUE_SHORT[k] ?? S.ISSUE_LABEL[k]}: {counts[k]}</span>
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
                <th class="pv-incl" title="İşareti kaldırılan fatura Excel'e yazılmaz (istisnai faturalar). Ctrl+Z geri alır.">Excel</th>
                {/* Başlıklar burada da düzenlenir (ad, sıra, kaldır); değişiklik Excel şablonuna anında yazılır */}
                {shownIdx.map((k, c) => <HeaderCell t={t} k={k} letter={S.excelLetters.value[k]} cls={c === at ? 'code-col' : money[c] ? 'r' : ''} />)}
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((r, i) => {
                const iss = rowIssues[i];
                const inv = byRow.get(i);
                const out = !!inv?.excluded;
                const cls = out ? 'excluded' : iss.includes('no-code') ? 'iss-code' : iss.includes('not-in-chart') ? 'iss-other iss-chart' : iss.length ? 'iss-other' : '';
                return (
                  <tr data-i={i} class={cls} title={out ? 'Excel\'e girmez' : inv ? iss.map((k) => S.issueText(inv, k)).join('\n') : ''} onDblClick={() => { if (inv) { S.goTo(S.invoices.value.indexOf(inv)); S.previewOpen.value = false; } }}>
                    <td class="num">{out ? '—' : excelRow++}</td>
                    <td class="pv-incl"><input type="checkbox" checked={!out} title={out ? 'Excel\'e geri al' : 'Excel\'den çıkar'} onClick={(e) => e.stopPropagation()} onChange={(e) => inv && S.setExcluded([inv.no], !(e.currentTarget as HTMLInputElement).checked)} /></td>
                    {r.map((v, c) => <td class={c === at ? 'code-col' : money[c] ? 'r' : ''}>{fmtCell(v, money[c])}</td>)}
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
