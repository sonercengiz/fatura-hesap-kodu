// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';

/** v16: verilen çıktıların kaydı (exports tablosu: id, batchId, at). Var olan veriye dokunulmaz. */
describe('veritabanı geçişi v15 → v16: çıktı geçmişi', () => {
  it('exports tablosu eklenir, dönem ve ayarlar yerinde', async () => {
    const v15 = new Dexie('fatura-hesap-kodu');
    v15.version(15).stores({ batches: 'id, updatedAt, firmId', invoices: '[batchId+no], batchId, no', xslts: 'id', assignments: '[batchId+no], batchId, no', settings: 'key', firms: 'id, name', firmHistory: '[firmId+vkn+code], firmId', firmAccounts: '[firmId+code], firmId', rules: 'id, firmId, batchId' });
    await v15.open();
    await v15.table('settings').put({ key: 'settings', value: { theme: 'dark' } });
    await v15.table('batches').put({ id: 'x', firmId: 'a', name: 'Eylül', updatedAt: 1 });
    v15.close();
    const { db } = await import('../src/storage/db');
    await db.open();
    expect(db.verno).toBe(16);
    expect(db.tables.map((t) => t.name)).toContain('exports');
    expect(await db.exports.count()).toBe(0);
    await db.exports.put({ id: 'e1', batchId: 'x', firmId: 'a', at: 5, fileName: 'f.xlsx', rows: 1, columns: ['No'], issues: {}, muted: [], flagged: [] });
    expect((await db.exports.where('batchId').equals('x').toArray()).map((r) => r.id)).toEqual(['e1']);
    expect((await db.batches.get('x'))!.name).toBe('Eylül');
    expect((await db.settings.get('settings'))!.value).toEqual({ theme: 'dark' });
  });
});
