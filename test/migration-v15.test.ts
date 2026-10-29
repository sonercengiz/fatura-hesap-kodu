// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { operatorXml } from './e2e-helpers.mjs';
import { FIELD_DEFS, KDV_FIELD_IDS, type OutputTemplate } from '../src/core/excel/template';

/** v15: XML'i olan faturalara KDV dışı vergiler / tevkifat / kur eklenir; eski "+ KDV dökümü" düğmesinin 8 sütunu tek "KDV dökümü · Güncel oranlar + Diğer" öğesi olur (genel, firma, dönem) */
describe('veritabanı geçişi v14 → v15: KDV dökümü öğesi', () => {
  it('8 KDV sütunu tek öğeye katlanır; değiştirilmiş başlık korunur, eksik takım dokunulmaz', async () => {
    const kdv = KDV_FIELD_IDS.map((id) => ({ id, header: FIELD_DEFS[id].header }));
    const general: OutputTemplate = { columns: [{ id: 'no', header: 'No' }, ...kdv], rowOrder: 'date-no', sheetName: 'S' };
    const firm: OutputTemplate = { columns: [...kdv.map((c) => (c.id === 'vat10Tax' ? { ...c, header: 'Kdv 10' } : c)), { id: 'amount', header: 'Tutar' }], rowOrder: 'date-no', sheetName: 'S' };
    const partial: OutputTemplate = { columns: kdv.slice(0, 4), rowOrder: 'date-no', sheetName: 'S' };
    const v14 = new Dexie('fatura-hesap-kodu');
    v14.version(14).stores({ batches: 'id, updatedAt, firmId', invoices: '[batchId+no], batchId, no', xslts: 'id', assignments: '[batchId+no], batchId, no', settings: 'key', firms: 'id, name', firmHistory: '[firmId+vkn+code], firmId', firmAccounts: '[firmId+code], firmId', rules: 'id, firmId, batchId' });
    await v14.open();
    await v14.table('settings').put({ key: 'settings', value: { outputTemplate: general, theme: 'dark' } });
    await v14.table('firms').bulkPut([{ id: 'a', name: 'A', outputTemplate: firm }, { id: 'b', name: 'B' }]);
    await v14.table('batches').bulkPut([{ id: 'x', firmId: 'a', name: 'Eylül', updatedAt: 1, outputTemplate: partial }]);
    const xml = readFileSync(resolve(process.cwd(), 'test/fixtures/ubl-sirket.xml'), 'utf8');
    await v14.table('invoices').bulkPut([{ batchId: 'x', no: 'OPR2026000000001', xml: operatorXml(xml), payable: 562.25 }, { batchId: 'x', no: 'EDM1', payable: 10 }]);
    v14.close();
    const { db } = await import('../src/storage/db');
    await db.open();
    expect(db.verno).toBe(15);
    const s = (await db.settings.get('settings'))!.value as { outputTemplate: OutputTemplate; theme: string };
    expect(s.outputTemplate.columns).toEqual([{ id: 'no', header: 'No' }, { id: 'vat', header: 'KDV dökümü', vatMode: 'current' }]);
    expect(s.theme).toBe('dark');
    expect((await db.firms.get('a'))!.outputTemplate!.columns).toEqual([{ id: 'vat', header: 'KDV dökümü', vatMode: 'current', vatHeaders: { t10: 'Kdv 10' } }, { id: 'amount', header: 'Tutar' }]);
    expect((await db.firms.get('b'))!.outputTemplate).toBeUndefined();
    expect((await db.batches.get('x'))!.outputTemplate!.columns.map((c) => c.id)).toEqual(['vat0Base', 'vat1Base', 'vat1Tax', 'vat10Base']);
    const op = await db.invoices.get(['x', 'OPR2026000000001']);
    expect(op!.taxExtras).toEqual({ other: [{ code: '4081', name: 'ÖİV', amount: 36.1 }, { code: '8006', name: 'Telsiz ücreti', amount: 26.98 }], withholding: null, exchangeRate: null });
    expect((await db.invoices.get(['x', 'EDM1']))!.taxExtras).toBeUndefined();
  });
});
