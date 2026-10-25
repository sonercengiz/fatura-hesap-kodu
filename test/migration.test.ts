import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import Dexie from 'dexie';

/** Sürüm 3 (firmasız) veritabanı oluşturup uygulamanın sürüm 5 şemasına yükseltilmesini doğrular. */
describe('veritabanı geçişi v3 → v5', () => {
  beforeAll(async () => {
    const old = new Dexie('fatura-hesap-kodu');
    old.version(3).stores({
      batches: 'id, updatedAt',
      assignments: '[batchId+no], batchId, no',
      files: 'id, batchId',
      history: '[vkn+code], vkn, code',
      settings: 'key',
      links: '++id, batchId, fileId, no',
      accounts: 'code',
    });
    await old.open();
    await old.table('settings').put({ key: 'settings', value: { firmName: 'Eski Firma', shortcuts: [{ key: 'q', code: '770.01' }, { key: 'w', code: null }, { key: 'e', code: null }, { key: 'a', code: null }, { key: 's', code: null }, { key: 'd', code: null }], chartName: 'Liste X', theme: 'dark' } });
    await old.table('batches').put({ id: 'b1', name: 'Ekim', sourceFileName: 'x.xlsx', createdAt: 1, updatedAt: 2, savedAt: null, sheet: { sheetName: 'S', headers: ['Fatura No'], rows: [['A']] } });
    await old.table('history').put({ vkn: '111', code: '770.01', count: 4, lastUsed: 5 });
    await old.table('accounts').put({ code: '770.01', name: 'Kırtasiye', addedAt: 1 });
    old.close();
  });

  it('eski veriler varsayılan firmaya taşınır', async () => {
    const { db, DEFAULT_FIRM_ID } = await import('../src/storage/db');
    await db.open();
    expect(db.verno).toBe(5);
    const firms = await db.firms.toArray();
    expect(firms.length).toBe(1);
    expect(firms[0]).toMatchObject({ id: DEFAULT_FIRM_ID, name: 'Eski Firma', chartName: 'Liste X' });
    expect(firms[0].shortcuts[0].code).toBe('770.01');
    expect((await db.batches.get('b1'))?.firmId).toBe(DEFAULT_FIRM_ID);
    expect(await db.firmHistory.get([DEFAULT_FIRM_ID, '111', '770.01'])).toMatchObject({ count: 4 });
    expect(await db.firmAccounts.get([DEFAULT_FIRM_ID, '770.01'])).toMatchObject({ name: 'Kırtasiye' });
    expect((await db.settings.get('currentFirmId'))?.value).toBe(DEFAULT_FIRM_ID);
    expect(db.tables.map((t) => t.name)).not.toContain('history');
    expect(db.tables.map((t) => t.name)).not.toContain('accounts');
  });
});
