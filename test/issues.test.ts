import { describe, it, expect } from 'vitest';
import { amountGaps, type OutputTemplate, type OutputColumn } from '../src/core/excel/template';
import type { Invoice } from '../src/core/types';

const mk = (over: Partial<Invoice> = {}): Invoice => ({
  no: 'A', order: 0, date: '10/09/2026', isoDate: '2026-09-10', uuid: 'u', supplierVkn: '1', supplierName: 'S', amount: 1180, taxInclusive: 1180, taxExclusive: 1000, taxAmount: 180,
  currency: 'TRY', invoiceType: 'Satış', profile: 'Temel', hasView: true, itemText: '', lineCount: 1, typeCode: 'SATIS', lines: [], vatRates: [], excluded: false,
  vatBreakdown: [{ rate: 18, base: 1000, tax: 180 }],
  ...over,
});
const tpl = (...ids: (OutputColumn['id'] | OutputColumn)[]): OutputTemplate => ({ columns: ids.map((x) => (typeof x === 'string' ? { id: x, header: x } : x)), rowOrder: 'date-no', sheetName: 'S' });
const texts = (inv: Invoice, t: OutputTemplate) => amountGaps(inv, t).map((g) => g.text);

describe('Tutar bilgisi Excel\'e girmiyor (amount-gap)', () => {
  it('KDV sütunları varken sütunu olmayan oran söylenir (%18)', () => {
    expect(texts(mk(), tpl('no', 'amount', 'vat20Base', 'vat20Tax'))).toEqual(['%18 KDV 180,00']);
    expect(texts(mk(), tpl('no', 'amount', { id: 'vat', header: 'KDV', vatMode: 'current' }))).toEqual([]);
    expect(texts(mk(), tpl('no', 'amount', 'vat18Base', 'vat18Tax'))).toEqual([]);
  });
  it('ÖİV sütunu yoksa ÖİV, KDV dışı vergi sütunu yoksa öbür vergiler', () => {
    const inv = mk({ vatBreakdown: [], taxExtras: { other: [{ code: '4081', name: 'ÖİV', amount: 36.1 }, { code: '8006', name: 'Telsiz ücreti', amount: 26.98 }], withholding: null, exchangeRate: null } });
    expect(texts(inv, tpl('amount'))).toEqual(['ÖİV 36,10', 'Telsiz ücreti 26,98']);
    expect(texts(inv, tpl('amount', 'oivTax'))).toEqual(['Telsiz ücreti 26,98']);
    expect(texts(inv, tpl('amount', 'otherTaxTotal'))).toEqual([]);
    expect(texts(inv, tpl('amount', 'otherTaxesText'))).toEqual([]);
  });
  it('ÖTV kendi sütunuyla da kapsanır', () => {
    const inv = mk({ vatBreakdown: [], taxExtras: { other: [{ code: '0071', name: 'ÖTV (1. liste)', amount: 500 }], withholding: null, exchangeRate: null } });
    expect(texts(inv, tpl('amount'))).toEqual(['ÖTV (1. liste) 500,00']);
    expect(texts(inv, tpl('amount', 'otvTax'))).toEqual([]);
  });
  it('tevkifat sütunu yoksa tevkifat', () => {
    const inv = mk({ vatBreakdown: [], taxExtras: { other: [], withholding: 90, exchangeRate: null } });
    expect(texts(inv, tpl('amount'))).toEqual(['Tevkifat 90,00']);
    expect(texts(inv, tpl('amount', 'withholding'))).toEqual([]);
  });
  it('döviz faturasında TL karşılığı ya da kur sütunu yoksa', () => {
    const inv = mk({ vatBreakdown: [], currency: 'USD', taxExtras: { other: [], withholding: null, exchangeRate: 41.2 } });
    expect(texts(inv, tpl('amount'))).toEqual(['Döviz (USD): TL karşılığı ve kur']);
    expect(texts(inv, tpl('amount', 'amountTry'))).toEqual([]);
    expect(texts(inv, tpl('amount', 'exchangeRate'))).toEqual([]);
    expect(texts(mk({ vatBreakdown: [] }), tpl('amount'))).toEqual([]);
  });
  it('şablonda hiç tutar sütunu yoksa (yalnızca veri toplama) uyarı yok', () => {
    const inv = mk({ taxExtras: { other: [{ code: '4081', name: 'ÖİV', amount: 36.1 }], withholding: 90, exchangeRate: null }, currency: 'USD' });
    expect(texts(inv, tpl('no', 'name', 'vkn'))).toEqual([]);
    expect(texts(inv, tpl('no', 'vat20Base')).length).toBeGreaterThan(0);
  });
});
