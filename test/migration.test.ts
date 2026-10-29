import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import Dexie from 'dexie';

/** Sürüm 3 (firmasız, Excel tabanlı) veritabanı oluşturup uygulamanın sürüm 9 şemasına yükseltilmesini doğrular. */
describe('veritabanı geçişi v3 → v9', () => {
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
    await old.table('batches').put({ id: 'b1', name: 'Ekim', sourceFileName: 'x.xlsx', createdAt: 1, updatedAt: 2, savedAt: null, sheet: { sheetName: 'S', headers: ['Fatura No', 'Fatura Tarihi', 'Fatura Tipi', 'Fatura Türü', 'Gönderen VKN/TCKN', 'Gönderen Unvan/Ad Soyad', 'Tutar', 'Döviz Cinsi'], rows: [['ABC2026000000001', '30/09/2026', 'İstisna', 'Ticari', '111', 'Eski Satıcı', 16950, 'TRY'], ['ABC2026000000002', '01/10/2026', 'Satış', 'Temel', '222', 'Diğer', '1.250,50', 'TRY']] } });
    await old.table('files').put({ id: 'f1', batchId: 'b1', name: 'x.pdf', size: 1, pageCount: 1, pageTexts: [''], blob: new Blob(['x']), addedAt: 1 });
    await old.table('links').put({ batchId: 'b1', no: 'ABC2026000000001', fileId: 'f1', fileName: 'x.pdf', fileSize: 1, pageStart: 1, pageEnd: 1 });
    await old.table('assignments').put({ batchId: 'b1', no: 'ABC2026000000001', code: '770.01', at: 3 });
    await old.table('history').put({ vkn: '111', code: '770.01', count: 4, lastUsed: 5 });
    await old.table('accounts').put({ code: '770.01', name: 'Kırtasiye', addedAt: 1 });
    old.close();
  });

  it('eski veriler varsayılan firmaya taşınır', async () => {
    const { db, DEFAULT_FIRM_ID } = await import('../src/storage/db');
    await db.open();
    expect(db.verno).toBe(16);
    const firms = await db.firms.toArray();
    expect(firms.length).toBe(1);
    expect(firms[0]).toMatchObject({ id: DEFAULT_FIRM_ID, name: 'Eski Firma', chartName: 'Liste X' });
    expect(firms[0].shortcuts[0].code).toBe('770.01');
    const b1 = (await db.batches.get('b1')) as unknown as Record<string, unknown>;
    expect(b1.firmId).toBe(DEFAULT_FIRM_ID);
    expect(b1.autoName).toBe(false);
    expect(b1.sheet).toBeUndefined();
    // Excel satırları fatura kayıtlarına dönüştü (XML'siz), atama korundu
    const inv = await db.invoices.where('batchId').equals('b1').toArray();
    expect(inv.map((i) => i.no).sort()).toEqual(['ABC2026000000001', 'ABC2026000000002']);
    expect(inv.find((i) => i.no === 'ABC2026000000001')).toMatchObject({ issueDate: '2026-09-30', typeCode: 'İstisna', profileId: 'Ticari', supplierVkn: '111', supplierName: 'Eski Satıcı', payable: 16950, currency: 'TRY', xml: null, xsltId: null, order: 0 });
    expect(inv.find((i) => i.no === 'ABC2026000000002')?.payable).toBe(1250.5);
    expect(await db.assignments.get(['b1', 'ABC2026000000001'])).toMatchObject({ code: '770.01' });
    expect(db.tables.map((t) => t.name)).not.toContain('files');
    expect(db.tables.map((t) => t.name)).not.toContain('links');
    expect(db.tables.map((t) => t.name)).toContain('xslts');
    expect(db.tables.map((t) => t.name)).toContain('rules');
    expect(await db.firmHistory.get([DEFAULT_FIRM_ID, '111', '770.01'])).toMatchObject({ count: 4 });
    expect(await db.firmAccounts.get([DEFAULT_FIRM_ID, '770.01'])).toMatchObject({ name: 'Kırtasiye' });
    expect((await db.settings.get('currentFirmId'))?.value).toBe(DEFAULT_FIRM_ID);
    expect(db.tables.map((t) => t.name)).not.toContain('history');
    expect(db.tables.map((t) => t.name)).not.toContain('accounts');
  });
});

/** Sürüm 8'deki tek belirteçli kurallar (kind + pattern) sürüm 9'da koşul listesine (conds) dönüşür. */
describe('veritabanı geçişi v8 → v9: kurallar', () => {
  it('kind + pattern → conds; bozuk kayıt silinir', async () => {
    const { db } = await import('../src/storage/db');
    db.close();
    await Dexie.delete('fatura-hesap-kodu');
    const v8 = new Dexie('fatura-hesap-kodu');
    v8.version(8).stores({ batches: 'id, updatedAt, firmId', invoices: '[batchId+no], batchId', xslts: 'id', assignments: '[batchId+no], batchId, no', settings: 'key', firms: 'id, name', firmHistory: '[firmId+vkn+code], firmId', firmAccounts: '[firmId+code], firmId', rules: 'id, firmId, batchId' });
    await v8.open();
    await v8.table('rules').bulkPut([
      { id: 'r1', firmId: 'f', batchId: null, kind: 'vkn', pattern: '123 456 7801', code: '770.01', enabled: true, createdAt: 1, updatedAt: 2 },
      { id: 'r2', firmId: 'f', batchId: 'b1', kind: 'item', pattern: 'Kargo', code: '760.02', enabled: false, createdAt: 1, updatedAt: 2 },
      { id: 'r3', firmId: 'f', batchId: null, kind: 'bogus', pattern: 'x', code: 'y', enabled: true, createdAt: 1, updatedAt: 2 },
    ]);
    v8.close();
    await db.open();
    expect(db.verno).toBe(16);
    const rules = (await db.rules.orderBy('id').toArray()) as unknown as Record<string, unknown>[];
    expect(rules.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(rules[0]).toMatchObject({ conds: [{ kind: 'vkn', text: '1234567801' }], code: '770.01', enabled: true, batchId: null });
    expect(rules[0].kind).toBeUndefined();
    expect(rules[0].pattern).toBeUndefined();
    expect(rules[1]).toMatchObject({ conds: [{ kind: 'item', text: 'Kargo' }], code: '760.02', enabled: false, batchId: 'b1' });
  });
});
