import { describe, it, expect } from 'vitest';
import { makeExportRecord } from '../src/core/exports';
import type { Invoice } from '../src/core/types';

const inv = (no: string) => ({ no }) as Invoice;
describe('çıktı kaydı', () => {
  it('satır/sütun, uyarı sayıları, uyarılı faturalar ve kapatılan türler', () => {
    const issues: Record<string, string[]> = { A: [], B: ['no-code'], C: ['no-code', 'payable-diff'], D: ['vat-derived'] };
    const r = makeExportRecord({ batchId: 'b', firmId: 'f', at: 100, fileName: 'EYLÜL 2026 F FATURA.xlsx', columns: ['No', 'Tutar'], invoices: ['A', 'B', 'C', 'D'].map(inv), issuesOf: (i) => issues[i.no], muted: ['vat-derived'] });
    expect(r).toMatchObject({ batchId: 'b', firmId: 'f', at: 100, fileName: 'EYLÜL 2026 F FATURA.xlsx', rows: 4, columns: ['No', 'Tutar'], muted: ['vat-derived'] });
    expect(r.issues).toEqual({ 'no-code': 2, 'payable-diff': 1, 'vat-derived': 1 });
    expect(r.flagged).toEqual([{ no: 'B', kinds: ['no-code'] }, { no: 'C', kinds: ['no-code', 'payable-diff'] }, { no: 'D', kinds: ['vat-derived'] }]);
    expect(r.id).toMatch(/\S/);
    const r2 = makeExportRecord({ batchId: 'b', firmId: 'f', at: 100, fileName: 'x', columns: [], invoices: [], issuesOf: () => [], muted: [] });
    expect(r2.id).not.toBe(r.id);
    expect(r2.flagged).toEqual([]);
  });
});
