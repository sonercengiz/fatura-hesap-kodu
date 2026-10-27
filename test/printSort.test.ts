import { describe, it, expect } from 'vitest';
import { sortPlan, describePlan, DEFAULT_PLAN_SORT } from '../src/core/printSort';
import type { Invoice } from '../src/core/types';

const mk = (order: number, no: string, date: string, vkn: string, amount: number): Invoice => ({ no, order, date, isoDate: '', uuid: '', supplierVkn: vkn, supplierName: `Satıcı ${vkn}`, amount, taxExclusive: null, taxAmount: null, currency: 'TRY', invoiceType: '', profile: '', hasView: true, itemText: '', lineCount: null, typeCode: 'SATIS', lines: [], vatRates: [] });
const list = [
  mk(0, 'ZZZ2026000000009', '30/09/2026', 'A', 50),
  mk(1, 'BBB2026000000002', '29/09/2026', 'B', 10),
  mk(2, 'AAA2026000000005', '30/09/2026', 'C', 70),
  mk(3, 'BBB2026000000001', '29/09/2026', 'B', 20),
  mk(4, 'CCC2026000000001', '30/09/2026', 'A', 30),
  mk(5, 'AAA2026000000007', '30/09/2026', 'C', 40),
  mk(6, 'DDD2026000000001', '28/09/2026', 'D', 60),
];
const codes = new Map([['DDD2026000000001', '770.02'], ['ZZZ2026000000009', '153'], ['BBB2026000000002', '770.01']]);

describe('yazdırma sırası', () => {
  it('varsayılan: tarih eskiden yeniye, gün içinde yalnızca fatura no (gruplama yok)', () => {
    expect(DEFAULT_PLAN_SORT.groupSupplier).toBe(false);
    expect(sortPlan(list, DEFAULT_PLAN_SORT, codes).map((i) => i.no)).toEqual([
      'DDD2026000000001', 'BBB2026000000001', 'BBB2026000000002',
      'AAA2026000000005', 'AAA2026000000007', 'CCC2026000000001', 'ZZZ2026000000009',
    ]);
  });
  it('satıcı gruplama açıkken gün içinde satıcı blokları', () => {
    expect(sortPlan(list, { ...DEFAULT_PLAN_SORT, groupSupplier: true }, codes).map((i) => i.no)).toEqual([
      'DDD2026000000001', 'BBB2026000000001', 'BBB2026000000002',
      'AAA2026000000005', 'AAA2026000000007', // C bloğu (en küçük no)
      'CCC2026000000001', 'ZZZ2026000000009', // A bloğu
    ]);
  });
  it('tarih yeniden eskiye; gruplama kapalıyken saf no sırası', () => {
    const r = sortPlan(list, { ...DEFAULT_PLAN_SORT, dir: 'desc' }, codes).map((i) => i.no);
    expect(r.slice(0, 4)).toEqual(['AAA2026000000005', 'AAA2026000000007', 'CCC2026000000001', 'ZZZ2026000000009']);
    expect(r[6]).toBe('DDD2026000000001');
  });
  it('tutar büyükten küçüğe; hesap kodu: atanmamışlar sonda', () => {
    expect(sortPlan(list, { primary: 'amount', dir: 'desc', secondary: 'no', dir2: 'asc', groupSupplier: false }, codes).map((i) => i.amount)).toEqual([70, 60, 50, 40, 30, 20, 10]);
    const byCode = sortPlan(list, { primary: 'code', dir: 'asc', secondary: 'date', dir2: 'asc', groupSupplier: false }, codes);
    expect(byCode.slice(0, 3).map((i) => codes.get(i.no))).toEqual(['153', '770.01', '770.02']);
    expect(byCode.slice(3).every((i) => !codes.has(i.no))).toBe(true);
    // azalan yönde de atanmamışlar sonda
    const desc = sortPlan(list, { primary: 'code', dir: 'desc', secondary: 'no', dir2: 'asc', groupSupplier: false }, codes);
    expect(desc.slice(0, 3).map((i) => codes.get(i.no))).toEqual(['770.02', '770.01', '153']);
  });
  it('satıcı A→Z, içinde tarih', () => {
    const r = sortPlan(list, { primary: 'supplier', dir: 'asc', secondary: 'date', dir2: 'asc', groupSupplier: true }, codes).map((i) => i.supplierVkn + ':' + i.date.slice(0, 2));
    expect(r).toEqual(['A:30', 'A:30', 'B:29', 'B:29', 'C:30', 'C:30', 'D:28']);
  });
  it('açıklama düz Türkçe ve uçları söyler', () => {
    const items = sortPlan(list, DEFAULT_PLAN_SORT, codes);
    const d = describePlan(DEFAULT_PLAN_SORT, items, codes);
    expect(d.summary).toBe('Önce fatura tarihi: eskiden yeniye. Aynı gündekiler kendi içinde fatura numarası: A → Z / küçükten büyüğe.');
    expect(describePlan({ ...DEFAULT_PLAN_SORT, groupSupplier: true }, items, codes).summary).toContain('Aynı satıcının faturaları bir arada.');
    expect(d.top).toContain('28/09/2026');
    expect(d.bottom).toContain('30/09/2026');
    expect(describePlan({ ...DEFAULT_PLAN_SORT, primary: 'code' }, items, codes).summary).toContain('atanmamışlar en sonda');
  });
});
