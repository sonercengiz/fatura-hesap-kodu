import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildOutputRows, buildOutputWorkbook, buildFileName, EDM_HEADERS, invoiceToEdmRow } from '../src/core/excel/writeOutput';
import type { Invoice } from '../src/core/types';

const mk = (no: string, over: Partial<Invoice> = {}): Invoice => ({
  no, order: 0, date: '10/09/2026', isoDate: '2026-09-10', uuid: 'u', supplierVkn: '1234567801', supplierName: 'ÖRNEK KIRTASİYE LTD. ŞTİ.',
  amount: 1500, taxExclusive: 1250, taxAmount: 250, currency: 'TRY', invoiceType: 'Satış', profile: 'Temel', hasView: true, itemText: '', lineCount: null, ...over,
});
const list = [mk('ABC2026000000001'), mk('ABC2026000000002', { amount: 27000 }), mk('AYS2026000000007', { currency: 'USD', invoiceType: 'İstisna', profile: 'Ticari', supplierVkn: '12345678901' })];
const codes = new Map([['ABC2026000000001', '600.002'], ['ABC2026000000002', '153']]);

describe('EDM düzeninde çıktı', () => {
  it('EDM başlıkları 20 sütundur ve satır XML alanlarıyla dolar', () => {
    expect(EDM_HEADERS.length).toBe(20);
    const row = invoiceToEdmRow(list[0]);
    expect(row.length).toBe(20);
    expect(row.slice(0, 9)).toEqual(['ABC2026000000001', '10/09/2026', '', 'Satış', 'Temel', '1234567801', 'ÖRNEK KIRTASİYE LTD. ŞTİ.', 1500, 'TRY']);
    expect(row.slice(9).every((v) => v === '')).toBe(true);
  });
  it('Hesap Kodu sütununu 3. sütuna araya ekler, hiçbir sütunu silmez', () => {
    const rows = buildOutputRows(list, { codeColumnIndex: 3, codeHeader: 'Hesap Kodu', codes });
    expect(rows.length).toBe(4);
    expect(rows[0].length).toBe(21);
    expect(rows[0][2]).toBe('Hesap Kodu');
    expect(rows[0][3]).toBe('Geliş Zamanı');
    expect(rows[0].slice(0, 2)).toEqual(['Fatura No', 'Fatura Tarihi']);
    expect(rows[0][20]).toBe('Etiket');
    expect(rows[1][2]).toBe('600.002');
    expect(rows[3][2]).toBe('');
    expect(rows[3][9]).toBe('USD');
  });
  it('yazılan dosya tekrar okununca hesap kodu ve VKN metin, tutar sayı kalır', () => {
    const bytes = buildOutputWorkbook(list, { codeColumnIndex: 3, codeHeader: 'Hesap Kodu', codes });
    const wb = XLSX.read(bytes, { type: 'array' });
    expect(wb.SheetNames).toEqual(['Sheet0']);
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws['C2'].t).toBe('s');
    expect(ws['C2'].v).toBe('600.002');
    expect(ws['C3'].v).toBe('153');
    expect(ws['G2'].t).toBe('s'); // VKN
    expect(ws['G2'].v).toBe('1234567801');
    expect(ws['I2'].t).toBe('n'); // Tutar artık I sütununda
    expect(ws['I3'].v).toBe(27000);
    expect(ws['A2'].v).toBe('ABC2026000000001');
    expect(ws['U1'].v).toBe('Etiket');
  });
  it('sütun konumu uçlarda da çalışır', () => {
    expect(buildOutputRows(list, { codeColumnIndex: 1, codeHeader: 'HK', codes })[0][0]).toBe('HK');
    expect(buildOutputRows(list, { codeColumnIndex: 99, codeHeader: 'HK', codes })[0][20]).toBe('HK');
    const bytes = buildOutputWorkbook(list, { codeColumnIndex: 1, codeHeader: 'HK', codes });
    const ws = XLSX.read(bytes, { type: 'array' }).Sheets['Sheet0'];
    expect(ws['G2'].t).toBe('s'); // VKN kod sütunundan sonra olduğu için G'de
  });
  it('dosya adı AY YIL FİRMA FATURA biçimindedir; ay faturaların baskın ayıdır', () => {
    expect(buildFileName('Abc Ltd. Şti', [{ isoDate: '2026-09-10' }, { isoDate: '2026-09-30' }, { isoDate: '2026-10-01' }])).toBe('09 2026 ABC_LTD._ŞTİ FATURA.xlsx');
    expect(buildFileName('Abc', [], new Date(2026, 9, 25))).toBe('10 2026 ABC FATURA.xlsx');
  });
});
