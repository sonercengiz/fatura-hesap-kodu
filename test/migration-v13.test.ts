// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Dexie from 'dexie';
import { operatorXml } from './e2e-helpers.mjs';

/** Sürüm 12'de kaydedilmiş faturalara v13'te vergiler dahil toplam eklenir; matrahı yazılmamış KDV yeniden hesaplanır. */
describe('veritabanı geçişi v12 → v13: fatura toplamı, türetilmiş matrah', () => {
  it("XML'i olan faturalar tamamlanır, XML'siz kayıt dokunulmaz", async () => {
    const xml = readFileSync(resolve(process.cwd(), 'test/fixtures/ubl-sirket.xml'), 'utf8');
    const v12 = new Dexie('fatura-hesap-kodu');
    v12.version(12).stores({ batches: 'id, updatedAt, firmId', invoices: '[batchId+no], batchId, no', xslts: 'id', assignments: '[batchId+no], batchId, no', settings: 'key', firms: 'id, name', firmHistory: '[firmId+vkn+code], firmId', firmAccounts: '[firmId+code], firmId', rules: 'id, firmId, batchId' });
    await v12.open();
    await v12.table('invoices').bulkPut([
      { batchId: 'b1', no: 'ABC2026000000001', xml, payable: 1500, vatBreakdown: [{ rate: 20, base: 1250, tax: 250 }] },
      // v12'nin kaydettiği hali: matrah yazılmadığı için KDV "oranı uyuşmayan" sayılmıştı
      { batchId: 'b1', no: 'OPR2026000000001', xml: operatorXml(xml), payable: 562.25, vatBreakdown: [{ rate: null, base: 0, tax: 72.2 }] },
      { batchId: 'b1', no: 'EDM2026000000001', xml: null, payable: 100 },
    ]);
    v12.close();
    const { db } = await import('../src/storage/db');
    await db.open();
    expect(db.verno).toBe(13);
    const [a, edm, op] = await db.invoices.orderBy('no').toArray();
    expect(a.taxInclusive).toBe(1500);
    expect(op.taxInclusive).toBe(496.26);
    expect(op.payable).toBe(562.25);
    expect(op.vatBreakdown).toEqual([{ rate: 20, base: 360.98, tax: 72.2, derived: true }]);
    expect(edm.taxInclusive).toBeUndefined();
  });
});
