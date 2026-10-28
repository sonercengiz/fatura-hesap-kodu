// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Dexie from 'dexie';

/** Sürüm 11'de kaydedilmiş faturaların KDV dökümü sürüm 12'de XML'den tamamlanır; XML'siz kayıtlar dokunulmaz. */
describe('veritabanı geçişi v11 → v12: KDV dökümü', () => {
  it("XML'i olan faturaya vatBreakdown eklenir", async () => {
    const xml = readFileSync(resolve(process.cwd(), 'test/fixtures/ubl-sirket.xml'), 'utf8');
    const v11 = new Dexie('fatura-hesap-kodu');
    v11.version(11).stores({ batches: 'id, updatedAt, firmId', invoices: '[batchId+no], batchId, no', xslts: 'id', assignments: '[batchId+no], batchId, no', settings: 'key', firms: 'id, name', firmHistory: '[firmId+vkn+code], firmId', firmAccounts: '[firmId+code], firmId', rules: 'id, firmId, batchId' });
    await v11.open();
    await v11.table('invoices').bulkPut([
      { batchId: 'b1', no: 'ABC2026000000001', xml, xsltId: null, lines: [], vatRates: [20] },
      { batchId: 'b1', no: 'ABC2026000000002', xml: null, xsltId: null, lines: [], vatRates: [] },
    ]);
    v11.close();
    const { db } = await import('../src/storage/db');
    await db.open();
    expect(db.verno).toBe(12);
    const [a, b] = await db.invoices.orderBy('no').toArray();
    expect(a.vatBreakdown).toEqual([{ rate: 20, base: 1250, tax: 250 }]);
    expect(b.vatBreakdown).toBeUndefined();
  });
});
