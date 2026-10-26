import { describe, it, expect } from 'vitest';
import { sortInvoices, dateKey } from '../src/core/sort';
import type { Invoice } from '../src/core/types';

const mk = (order: number, no: string, date: string, vkn: string): Invoice => ({ no, order, date, isoDate: '', uuid: '', supplierVkn: vkn, supplierName: vkn, amount: 1, taxExclusive: null, taxAmount: null, currency: 'TRY', invoiceType: '', profile: '', hasView: true });
const list = [
  mk(0, 'ZZZ2026000000009', '30/09/2026', 'A'),
  mk(1, 'BBB2026000000002', '29/09/2026', 'B'),
  mk(2, 'AAA2026000000005', '30/09/2026', 'C'), // C'nin en küçük no'su AAA...5
  mk(3, 'BBB2026000000001', '29/09/2026', 'B'),
  mk(4, 'CCC2026000000001', '30/09/2026', 'A'), // A'nın en küçük no'su CCC...1 → A bloğu C bloğundan sonra
  mk(5, 'AAA2026000000007', '30/09/2026', 'C'),
  mk(6, 'DDD2026000000001', '28/09/2026', 'D'),
];

describe('sıralama', () => {
  it('tarih anahtarı', () => {
    expect(dateKey('05/10/2026')).toBe(20261005);
    expect(dateKey('2026-10-05')).toBe(20261005);
    expect(dateKey('bozuk')).toBe(0);
  });
  it('yükleme sırası ekleniş sırasıdır', () => {
    expect(sortInvoices(list, 'added').map((i) => i.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it('tarih eskiden yeniye, gün içinde satıcı blokları ve fatura no', () => {
    expect(sortInvoices(list, 'date-supplier').map((i) => i.no)).toEqual([
      'DDD2026000000001', // 28/09
      'BBB2026000000001', 'BBB2026000000002', // 29/09, B bloğu no sırasıyla
      'AAA2026000000005', 'AAA2026000000007', // 30/09, C bloğu (en küçük no AAA...5)
      'CCC2026000000001', 'ZZZ2026000000009', // 30/09, A bloğu (en küçük no CCC...1), kendi içinde no sırası
    ]);
  });
});
