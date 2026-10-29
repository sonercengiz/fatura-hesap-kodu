import { signal, effect } from '@preact/signals';
import { buildTemplateWorkbook, buildFileName } from '../../core/excel/writeOutput';
import { makeExportRecord } from '../../core/exports';
import { db, type ExportRecord } from '../../storage/db';
import { batchRec, firm, invoices, outputIncluded, writtenTemplate, outputContext, outputCodeAt, showToast, goTo } from './core';
import { issuesFor, previewMuted, type IssueKind } from './issues';

/** Açık dönemin verilen çıktıları, yeniden eskiye */
export const exportsList = signal<ExportRecord[]>([]);
/** "Verilen çıktılar" penceresi */
export const exportsOpen = signal(false);

/** Çıktı anındaki uyarılar (önizlemedeki gibi: Hesap Kodu sütunu yoksa kodsuzluk sayılmaz; XML eksikliği çıktıyı etkilemez) */
export function outputIssues(inv: Parameters<typeof issuesFor>[0]): IssueKind[] {
  const skip = new Set<IssueKind>(outputCodeAt.value < 0 ? ['no-view', 'no-code', 'not-in-chart'] : ['no-view']);
  return issuesFor(inv).filter((k) => !skip.has(k));
}

/** Dönem değişince (ya da yeniden okununca) kayıtlar ve tur yenilenir */
let shownBatch: string | null = null;
effect(() => {
  const id = batchRec.value?.id ?? null;
  if (id !== shownBatch) { shownBatch = id; tour.value = null; }
  if (!id) { exportsList.value = []; return; }
  db.exports.where('batchId').equals(id).toArray().then((rs) => { if (batchRec.value?.id === id) exportsList.value = rs.sort((a, b) => b.at - a.at); });
});

export async function exportExcel() {
  const b = batchRec.value;
  if (!b) return;
  if (outputIncluded.value.length === 0) { showToast('Excel\'e girecek fatura yok: hepsi çıkarılmış.', 4000); return; }
  const bytes = await buildTemplateWorkbook(outputIncluded.value, writtenTemplate.value, outputContext());
  const name = buildFileName(firm.value.name, outputIncluded.value);
  const blob = new Blob([bytes as unknown as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  // Çıktının kaydı: hangi uyarılarla verildiği sonradan görülsün, uyarılı faturalar gezilsin
  const rec = makeExportRecord({ batchId: b.id, firmId: b.firmId, at: Date.now(), fileName: name, columns: writtenTemplate.value.columns.map((c) => c.header), invoices: outputIncluded.value, issuesOf: outputIssues, muted: previewMuted.value });
  await db.exports.put(rec);
  exportsList.value = [rec, ...exportsList.value];
  const n = rec.flagged.length;
  showToast(`İndirildi: ${name}${n ? ` · ${n} uyarılı fatura` : ''}`, n ? 6000 : 4000, n ? { label: 'Çıktılar', run: () => (exportsOpen.value = true) } : undefined);
}

/** Çıktı kaydının kısa adı: "Çıktı 29.10 14:05" */
export const exportLabel = (r: ExportRecord) => `Çıktı ${exportStamp(r.at)}`;
/** "29.10 14:05" (tarayıcının gün/ay biçiminden bağımsız) */
export function exportStamp(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Uyarılı faturalar turu: açıkken Tab / Shift+Tab yalnızca bu faturalarda gezer */
export const tour = signal<{ exportId: string; label: string; nos: string[]; i: number } | null>(null);

/** Turda `dir` yönündeki ilk (dönemde hâlâ olan) faturaya gider; uçta durur (başa dönmez), söyler */
export function tourStep(dir: 1 | -1) {
  const t = tour.value;
  if (!t || !t.nos.length) return;
  const list = invoices.value;
  for (let i = t.i + dir; i >= 0 && i < t.nos.length; i += dir) {
    const idx = list.findIndex((x) => x.no === t.nos[i]);
    if (idx >= 0) { tour.value = { ...t, i }; goTo(idx); return; }
  }
  showToast(dir > 0 ? 'Turun son faturası; Bitir ile turu kapatın.' : 'Turun ilk faturası.');
}
/** Tur uçta mı (düğme devre dışı kalsın) */
export const tourAtEnd = (dir: 1 | -1) => { const t = tour.value; if (!t) return true; const nos = new Set(invoices.value.map((x) => x.no)); for (let i = t.i + dir; i >= 0 && i < t.nos.length; i += dir) if (nos.has(t.nos[i])) return false; return true; };

export function startTour(r: ExportRecord) {
  const nos = r.flagged.map((f) => f.no);
  if (!nos.length) return;
  tour.value = { exportId: r.id, label: exportLabel(r), nos, i: -1 };
  exportsOpen.value = false;
  tourStep(1);
}

export const endTour = () => { tour.value = null; };
