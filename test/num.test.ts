import { describe, it, expect } from 'vitest';
import { parseTrNumber, fmtTrNumber, fmtMoney, fmtCell } from '../src/core/num';

describe('Türkçe sayı okuma', () => {
  it('virgül ondalık', () => { expect(parseTrNumber('0,5')).toBe(0.5); expect(parseTrNumber('12.500,50')).toBe(12500.5); expect(parseTrNumber('1,')).toBe(1); });
  it('nokta üçerli gruplarda binlik', () => { expect(parseTrNumber('3.000')).toBe(3000); expect(parseTrNumber('1.000.000')).toBe(1000000); expect(parseTrNumber('12.500')).toBe(12500); });
  it('nokta aksi halde ondalık', () => { expect(parseTrNumber('0.5')).toBe(0.5); expect(parseTrNumber('1.25')).toBe(1.25); expect(parseTrNumber('3.0')).toBe(3); expect(parseTrNumber('1234.5')).toBe(1234.5); });
  it('düz sayı, boşluk, ₺, eksi', () => { expect(parseTrNumber('3000')).toBe(3000); expect(parseTrNumber(' 1 500 ')).toBe(1500); expect(parseTrNumber('9.900 ₺')).toBe(9900); expect(parseTrNumber('-2,5')).toBe(-2.5); });
  it('boş → null, saçma → NaN', () => { expect(parseTrNumber('')).toBeNull(); expect(parseTrNumber('  ')).toBeNull(); expect(Number.isNaN(parseTrNumber('abc') as number)).toBe(true); expect(Number.isNaN(parseTrNumber('1.2.3') as number)).toBe(true); });
  it('biçimleme', () => { expect(fmtTrNumber(3000)).toBe('3.000'); expect(fmtTrNumber(0.5)).toBe('0,5'); expect(fmtTrNumber(null)).toBe(''); expect(fmtTrNumber(NaN)).toBe(''); });
  it('para her yerde 2 ondalık, önizleme hücresi alana göre', () => {
    expect(fmtMoney(5748)).toBe('5.748,00'); expect(fmtMoney(2534.4)).toBe('2.534,40'); expect(fmtMoney(null)).toBe('');
    expect(fmtCell(2534.4, true)).toBe('2.534,40'); expect(fmtCell(0.125, false)).toBe('0,125'); expect(fmtCell('TRY', true)).toBe('TRY'); expect(fmtCell(null, true)).toBe('');
  });
});
