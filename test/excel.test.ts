import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { readEdmSheet, extractInvoices } from '../src/core/excel/readEdm';
import { buildOutputRows, buildOutputWorkbook, buildFileName } from '../src/core/excel/writeOutput';

const data = readFileSync(new URL('./fixtures/edm-ornek.xlsx', import.meta.url));

describe('EDM Excel okuma', () => {
  const sheet = readEdmSheet(data);
  it('20 sütun ve 249 satır okur', () => {
    expect(sheet.headers.length).toBe(20);
    expect(sheet.headers[0]).toBe('Fatura No');
    expect(sheet.rows.length).toBe(249);
  });
  it('faturaları çıkarır', () => {
    const inv = extractInvoices(sheet);
    expect(inv.length).toBe(249);
    expect(new Set(inv.map((i) => i.no)).size).toBe(249);
    expect(inv[0]).toMatchObject({ no: 'ABC2026000000001', date: '30/09/2026', supplierVkn: '1234567801', amount: 16950, currency: 'TRY' });
  });
});

describe('Çıktı Excel', () => {
  const sheet = readEdmSheet(data);
  const codes = new Map<number, string>([[0, '600.002'], [1, '153'], [2, '770']]);
  it('Hesap Kodu sütununu 3. sütuna araya ekler, hiçbir sütunu silmez', () => {
    const rows = buildOutputRows(sheet, { codeColumnIndex: 3, codeHeader: 'Hesap Kodu', codes });
    expect(rows[0].length).toBe(21);
    expect(rows[0][2]).toBe('Hesap Kodu');
    expect(rows[0][3]).toBe('Geliş Zamanı');
    expect(rows[0].slice(0, 2)).toEqual(['Fatura No', 'Fatura Tarihi']);
    expect(rows[1][2]).toBe('600.002');
    expect(rows[4][2]).toBe('');
    expect(rows[1][0]).toBe('ABC2026000000001');
  });
  it('yazılan dosya tekrar okununca hesap kodu metin, tutar sayı kalır', () => {
    const bytes = buildOutputWorkbook(sheet, { codeColumnIndex: 3, codeHeader: 'Hesap Kodu', codes });
    const wb = XLSX.read(bytes, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws['C2'].t).toBe('s');
    expect(ws['C2'].v).toBe('600.002');
    expect(ws['C3'].v).toBe('153');
    expect(ws['I2'].t).toBe('n'); // Tutar artık I sütununda
    expect(ws['I2'].v).toBe(16950);
    expect(ws['A2'].v).toBe('ABC2026000000001');
    expect(ws['U1'].v).toBe('Etiket');
  });
  it('sütun konumu uçlarda da çalışır', () => {
    expect(buildOutputRows(sheet, { codeColumnIndex: 1, codeHeader: 'HK', codes })[0][0]).toBe('HK');
    expect(buildOutputRows(sheet, { codeColumnIndex: 99, codeHeader: 'HK', codes })[0][20]).toBe('HK');
  });
  it('dosya adı GÜN AY YIL FİRMA FATURA biçimindedir', () => {
    expect(buildFileName('Abc Ltd. Şti', new Date(2026, 9, 25))).toBe('25 10 2026 ABC_LTD._ŞTİ FATURA.xlsx');
  });
});
