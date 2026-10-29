import { describe, it, expect } from 'vitest';
import { expandTemplate, buildTemplateRows, normalizeTemplate, foldLegacyKdv, vatUncovered, emptyColumns, skipEmpty, excelLettersOf, FIELD_DEFS, KDV_FIELD_IDS, vatGroupOf, type OutputTemplate, type VatMode } from '../src/core/excel/template';
import type { Invoice } from '../src/core/types';

const mk = (no: string, vatBreakdown: Invoice['vatBreakdown']): Invoice => ({
  no, order: 0, date: '10/09/2026', isoDate: '2026-09-10', uuid: 'u', supplierVkn: '1', supplierName: 'S', amount: 0, taxInclusive: 0, taxExclusive: 0, taxAmount: 0,
  currency: 'TRY', invoiceType: 'Satış', profile: 'Temel', hasView: true, itemText: '', lineCount: 1, typeCode: 'SATIS', lines: [], vatRates: [], vatBreakdown, excluded: false,
});
// %20'li, %1 + %10'lu, %18 + %20'li (eski oran), oranı uyuşmayan satırlı (operatör) ve %8 + %18'li fatura
const invs = [
  mk('A', [{ rate: 20, base: 100, tax: 20 }]),
  mk('B', [{ rate: 1, base: 200, tax: 2 }, { rate: 10, base: 50, tax: 5 }]),
  mk('C', [{ rate: 18, base: 1000, tax: 180 }, { rate: 20, base: 500, tax: 100 }]),
  mk('D', [{ rate: 20, base: 400, tax: 80 }, { rate: null, base: 400, tax: 15.3 }]),
  mk('E', [{ rate: 8, base: 100, tax: 8 }, { rate: 18, base: 10, tax: 1.8 }]),
];
const tpl = (vatMode: VatMode, extra: Partial<OutputTemplate['columns'][number]> = {}): OutputTemplate => ({ columns: [{ id: 'no', header: 'No' }, { id: 'vat', header: 'KDV dökümü', vatMode, ...extra }, { id: 'amount', header: 'Tutar' }], rowOrder: 'date-no', sheetName: 'S' });
const ctx = { codes: new Map<string, string>() };
const heads = (t: OutputTemplate, list = invs) => expandTemplate(t, list).columns.map((c) => c.header);
const rowOf = (t: OutputTemplate, no: string) => { const e = expandTemplate(t, invs); const r = buildTemplateRows(invs, e, ctx); return Object.fromEntries(r[0].map((h, k) => [h, r[1 + invs.findIndex((i) => i.no === no)][k]])); };

describe('KDV dökümü açılımları', () => {
  it('Toplam: oran fark etmeksizin matrah + KDV (oranı uyuşmayan vergi KDV toplamına girer, matrahı sayılmaz)', () => {
    expect(heads(tpl('total'))).toEqual(['No', 'KDV Matrahı', 'KDV Toplamı', 'Tutar']);
    expect(rowOf(tpl('total'), 'C')).toMatchObject({ 'KDV Matrahı': 1500, 'KDV Toplamı': 280 });
    expect(rowOf(tpl('total'), 'D')).toMatchObject({ 'KDV Matrahı': 400, 'KDV Toplamı': 95.3 });
  });
  it('Güncel oranlar + Diğer: %0/%1/%10/%20 ayrı; başka oranlar Diğer Oran + Matrah + KDV; oranı uyuşmayan ayrı', () => {
    expect(heads(tpl('current'))).toEqual(['No', 'Matrah %0', 'Matrah %1', 'KDV %1', 'Matrah %10', 'KDV %10', 'Matrah %20', 'KDV %20', 'Diğer Oran', 'Diğer Matrah', 'Diğer KDV', 'Oranı Uyuşmayan KDV', 'Tutar']);
    expect(rowOf(tpl('current'), 'C')).toMatchObject({ 'Matrah %20': 500, 'KDV %20': 100, 'Diğer Oran': '%18', 'Diğer Matrah': 1000, 'Diğer KDV': 180, 'Oranı Uyuşmayan KDV': null });
    expect(rowOf(tpl('current'), 'E')).toMatchObject({ 'Diğer Oran': '%8, %18', 'Diğer Matrah': 110, 'Diğer KDV': 9.8 });
    expect(rowOf(tpl('current'), 'D')).toMatchObject({ 'Diğer Oran': '', 'Diğer KDV': null, 'Oranı Uyuşmayan KDV': 15.3 });
    // Dönemde olmayan oran sütunu boş: "Boş sütunları atla" düşürür, harfler kayar
    const e = expandTemplate(tpl('current'), invs);
    const empty = emptyColumns(e, invs, ctx);
    expect(skipEmpty(e, empty).columns.map((c) => c.header)).not.toContain('Matrah %0');
    expect(excelLettersOf(e, empty)[1]).toBeNull();
  });
  it('Her oran ayrı: dönemde görülen oranlar küçükten büyüğe, sabit alanı olmayan oran da (örn. %5), oranı uyuşmayan yalnızca varsa', () => {
    expect(heads(tpl('each'))).toEqual(['No', 'Matrah %1', 'KDV %1', 'Matrah %8', 'KDV %8', 'Matrah %10', 'KDV %10', 'Matrah %18', 'KDV %18', 'Matrah %20', 'KDV %20', 'Oranı Uyuşmayan KDV', 'Tutar']);
    const odd5 = [mk('F', [{ rate: 5, base: 100, tax: 5 }, { rate: 0, base: 30, tax: 0 }])];
    expect(heads(tpl('each'), odd5)).toEqual(['No', 'Matrah %0', 'Matrah %5', 'KDV %5', 'Tutar']);
    const e = expandTemplate(tpl('each'), odd5);
    expect(buildTemplateRows(odd5, e, ctx)[1]).toEqual(['F', 30, 100, 5, 0]);
    expect(vatGroupOf(e.columns[2])).toBe('5');
  });
  it('alt başlıklar değiştirilebilir; öğe normalize edilince açılımı ve başlıkları korunur', () => {
    const t = tpl('current', { vatHeaders: { b20: '%20 Kdv Matrahı', rr: 'Diğer KDV Oranı' } });
    expect(heads(t)).toContain('%20 Kdv Matrahı');
    expect(heads(t)).toContain('Diğer KDV Oranı');
    const n = normalizeTemplate(JSON.parse(JSON.stringify(t)));
    expect(n.columns[1]).toEqual({ id: 'vat', header: 'KDV dökümü', vatMode: 'current', vatHeaders: { b20: '%20 Kdv Matrahı', rr: 'Diğer KDV Oranı' } });
    expect(normalizeTemplate({ columns: [{ id: 'vat', header: 'x', vatMode: 'bozuk' as VatMode }] }).columns[0].vatMode).toBe('current');
    expect(normalizeTemplate({ columns: [{ id: 'no', header: 'No' }, { id: 'vatRateBase', header: 'iç' }] }).columns.map((c) => c.id)).toEqual(['no']);
  });
  it('KDV dökümü öğesi varken hiçbir oran "sütunu yok" sayılmaz; Özel\'de Diğer ve toplam sütunları kapsar', () => {
    for (const m of ['total', 'current', 'each'] as VatMode[]) expect(invs.flatMap((i) => vatUncovered(i, tpl(m)))).toEqual([]);
    const custom: OutputTemplate = { columns: [{ id: 'vat20Base', header: 'M20' }, { id: 'vatRestTax', header: 'Diğer KDV' }], rowOrder: 'date-no', sheetName: 'S' };
    expect(vatUncovered(invs[2], custom)).toEqual([]);
    expect(vatUncovered(invs[3], custom)).toEqual([null]);
    expect(vatUncovered(invs[1], custom)).toEqual([1, 10]);
  });
  it('eski "+ KDV dökümü" 8 sütunu tek öğeye katlanır (göç), değiştirilmiş başlıklar alt başlık olur', () => {
    const cols = [{ id: 'no' as const, header: 'No' }, ...KDV_FIELD_IDS.map((id) => ({ id, header: id === 'vat20Base' ? 'M20' : FIELD_DEFS[id].header })), { id: 'amount' as const, header: 'Tutar' }];
    expect(foldLegacyKdv(cols)).toEqual([{ id: 'no', header: 'No' }, { id: 'vat', header: 'KDV dökümü', vatMode: 'current', vatHeaders: { b20: 'M20' } }, { id: 'amount', header: 'Tutar' }]);
    const partial = cols.filter((c) => c.id !== 'vat1Tax');
    expect(foldLegacyKdv(partial)).toBe(partial);
  });
});
