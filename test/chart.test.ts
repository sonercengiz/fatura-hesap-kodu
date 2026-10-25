import { describe, it, expect } from 'vitest';
import { searchAccounts, parseAccountText } from '../src/core/chart';

const list = [
  { code: '770.01', name: 'Kırtasiye giderleri' },
  { code: '770.02', name: 'Temizlik giderleri' },
  { code: '153', name: 'Ticari mallar' },
  { code: '760.02', name: 'Kargo ve nakliye' },
  { code: '191', name: 'İndirilecek KDV' },
];

describe('hesap listesi arama', () => {
  it('kod başlangıcı önce gelir', () => {
    expect(searchAccounts(list, '77').map((a) => a.code)).toEqual(['770.01', '770.02']);
  });
  it('isimden bulur, Türkçe küçük harf duyarsız', () => {
    expect(searchAccounts(list, 'KIRT').map((a) => a.code)).toEqual(['770.01']);
    expect(searchAccounts(list, 'kdv').map((a) => a.code)).toEqual(['191']);
    expect(searchAccounts(list, 'nakli').map((a) => a.code)).toEqual(['760.02']);
  });
  it('boş sorguda listeyi döner', () => {
    expect(searchAccounts(list, '', 3).length).toBe(3);
  });
  it('metinden ayrıştırır', () => {
    expect(parseAccountText('770.01 Kırtasiye\nHesap Kodu;İsim\n153;Ticari mallar\n\n191\tİndirilecek KDV')).toEqual([
      { code: '770.01', name: 'Kırtasiye' }, { code: '153', name: 'Ticari mallar' }, { code: '191', name: 'İndirilecek KDV' },
    ]);
  });
});
