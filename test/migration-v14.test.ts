// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { edmTemplate, type OutputTemplate } from '../src/core/excel/template';

/**
 * v14: şablon kapsamı genel › firma › dönem. Eskiden her firmaya şablonun kopyası yazılıyordu: firmalarda en çok kullanılan
 * şablon genel olur, onunla aynı firma kopyaları silinir; farklı olanlar firmaya özel kalır. Her firmanın Excel'i aynı kalır.
 */
describe('veritabanı geçişi v13 → v14: şablon kapsamı', () => {
  it('en çok kullanılan firma şablonu genel olur, aynı olanlar genele bağlanır', async () => {
    const custom: OutputTemplate = { columns: [{ id: 'no', header: 'No' }, { id: 'amount', header: 'Tutar' }], rowOrder: 'date-no', sheetName: 'Sheet0' };
    const other: OutputTemplate = { columns: [{ id: 'no', header: 'Belge' }], rowOrder: 'date-no', sheetName: 'Sheet0' };
    const v13 = new Dexie('fatura-hesap-kodu');
    v13.version(13).stores({ batches: 'id, updatedAt, firmId', invoices: '[batchId+no], batchId, no', xslts: 'id', assignments: '[batchId+no], batchId, no', settings: 'key', firms: 'id, name', firmHistory: '[firmId+vkn+code], firmId', firmAccounts: '[firmId+code], firmId', rules: 'id, firmId, batchId' });
    await v13.open();
    await v13.table('settings').put({ key: 'settings', value: { outputTemplate: edmTemplate(), theme: 'dark' } });
    await v13.table('firms').bulkPut([
      { id: 'a', name: 'A', outputTemplate: custom },
      { id: 'b', name: 'B', outputTemplate: custom },
      { id: 'c', name: 'C', outputTemplate: other },
      { id: 'd', name: 'D', outputTemplate: edmTemplate() },
      { id: 'e', name: 'E' },
    ]);
    v13.close();
    const { db } = await import('../src/storage/db');
    await db.open();
    expect(db.verno).toBe(15);
    const s = (await db.settings.get('settings'))!.value as { outputTemplate: OutputTemplate; theme: string };
    expect(s.outputTemplate.columns.map((c) => c.header)).toEqual(['No', 'Tutar']);
    expect(s.theme).toBe('dark');
    const f = Object.fromEntries((await db.firms.toArray()).map((x) => [x.id, x.outputTemplate?.columns.map((c) => c.header) ?? null]));
    expect(f.a).toBeNull();
    expect(f.b).toBeNull();
    expect(f.c).toEqual(['Belge']);
    // Eski genel (EDM) şablonu kullanan firma kendi özel şablonu olarak korunur: Excel'i değişmez
    expect(f.d?.length).toBe(21);
    expect(f.e).toBeNull();
  });
});
