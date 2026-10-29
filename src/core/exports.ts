import type { Invoice } from './types';
import type { ExportRecord } from '../storage/db';

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Excel çıktısının kaydı: Excel'e giren faturaların o anki uyarıları (sayılar + uyarılı faturalar, çıktı sırasıyla) */
export function makeExportRecord<K extends string>(p: { batchId: string; firmId: string; at: number; fileName: string; columns: string[]; invoices: Invoice[]; issuesOf: (inv: Invoice) => K[]; muted: K[] }): ExportRecord {
  const issues: Partial<Record<string, number>> = {};
  const flagged: ExportRecord['flagged'] = [];
  for (const inv of p.invoices) {
    const kinds = p.issuesOf(inv);
    if (!kinds.length) continue;
    flagged.push({ no: inv.no, kinds: [...kinds] });
    for (const k of kinds) issues[k] = (issues[k] ?? 0) + 1;
  }
  return { id: newId(), batchId: p.batchId, firmId: p.firmId, at: p.at, fileName: p.fileName, rows: p.invoices.length, columns: p.columns, issues, muted: [...p.muted], flagged };
}
