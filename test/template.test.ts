import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { edmTemplate, DEFAULT_OUTPUT_TEMPLATE, normalizeTemplate, buildTemplateRows, isEdmDefault, codeColumnIndexOf, type OutputTemplate } from '../src/core/excel/template';
import { buildTemplateWorkbook, EDM_HEADERS } from '../src/core/excel/writeOutput';
import { unzipSync, strFromU8 } from 'fflate';
import type { Invoice } from '../src/core/types';

const mk = (no: string, over: Partial<Invoice> = {}): Invoice => ({
  no, order: 0, date: '10/09/2026', isoDate: '2026-09-10', uuid: 'u-1', supplierVkn: '1234567801', supplierName: 'ÖRNEK KIRTASİYE LTD. ŞTİ.',
  amount: 1500, taxExclusive: 1250, taxAmount: 250, currency: 'TRY', invoiceType: 'Satış', profile: 'Temel', hasView: true, itemText: '', lineCount: 2, ...over,
});
const list = [mk('ABC2026000000001'), mk('ABC2026000000002', { amount: 27000 })];
const ctx = { codes: new Map([['ABC2026000000001', '600.002']]), accountNames: new Map([['600.002', 'Alıcılar']]), sources: new Map([['ABC2026000000001', 'rule' as const]]), firmName: 'ABC', batchName: 'Eylül 2026' };

describe('çıktı şablonu', () => {
  it('varsayılan EDM 20 sütun + C\'de Hesap Kodu, eski ayarla birebir', () => {
    const t = DEFAULT_OUTPUT_TEMPLATE;
    expect(t.columns.length).toBe(21);
    expect(codeColumnIndexOf(t)).toBe(2);
    const rows = buildTemplateRows(list, t, ctx);
    expect(rows[0]).toEqual([...EDM_HEADERS.slice(0, 2), 'Hesap Kodu', ...EDM_HEADERS.slice(2)]);
    expect(rows[1].slice(0, 10)).toEqual(['ABC2026000000001', '10/09/2026', '600.002', '', 'Satış', 'Temel', '1234567801', 'ÖRNEK KIRTASİYE LTD. ŞTİ.', 1500, 'TRY']);
    expect(rows[2][2]).toBe('');
    expect(isEdmDefault(t)).toBe(true);
    expect(isEdmDefault(edmTemplate(1))).toBe(false);
    expect(codeColumnIndexOf(edmTemplate(99, 'HK'))).toBe(20);
  });
  it('özel şablon: sütun seçimi, başlık, ekstra alanlar; metin sütunları metin kalır', () => {
    const t: OutputTemplate = { columns: [{ id: 'code', header: 'Hesap' }, { id: 'no', header: 'Belge No' }, { id: 'uuid', header: 'ETTN' }, { id: 'taxExclusive', header: 'Matrah' }, { id: 'source', header: 'Kaynak' }, { id: 'accountName', header: 'Hesap Adı' }, { id: 'firm', header: 'Firma' }, { id: 'blank', header: '' }], rowOrder: 'date-no', sheetName: 'GMS' };
    const rows = buildTemplateRows(list, t, ctx);
    expect(rows[0]).toEqual(['Hesap', 'Belge No', 'ETTN', 'Matrah', 'Kaynak', 'Hesap Adı', 'Firma', '']);
    expect(rows[1]).toEqual(['600.002', 'ABC2026000000001', 'u-1', 1250, 'Kural', 'Alıcılar', 'ABC', '']);
    expect(rows[2]).toEqual(['', 'ABC2026000000002', 'u-1', 1250, '', '', 'ABC', '']);
    const wb = XLSX.read(buildTemplateWorkbook(list, t, ctx), { type: 'array' });
    expect(wb.SheetNames).toEqual(['GMS']);
    const ws = wb.Sheets.GMS;
    expect(ws['A2']).toMatchObject({ t: 's', v: '600.002' });
    expect(ws['C2']).toMatchObject({ t: 's', v: 'u-1' });
    expect(ws['D2'].t).toBe('n');
  });
  it('normalize: bozuk kayıt varsayılana, kod sütunu yoksa sona eklenir, bilinmeyen alan atılır', () => {
    expect(normalizeTemplate(undefined)).toEqual(DEFAULT_OUTPUT_TEMPLATE);
    const n = normalizeTemplate({ columns: [{ id: 'no', header: 'No' }, { id: 'x' as never, header: '?' }], rowOrder: 'bogus' as never, sheetName: ' ' });
    expect(n.columns.map((c) => c.id)).toEqual(['no', 'code']);
    expect(n.rowOrder).toBe('date-no');
    expect(n.sheetName).toBe('Sheet0');
  });
  it('EDM listesinden gelen sütunlar çıktıda dolar; XML alanları öncelikli', () => {
    const withEdm = mk('ABC2026000000003', { edm: { 'Geliş Zamanı': '10/09/2026 12:28:13', Durum: 'Fatura hazır', 'Zarf No': 'zarf-1', Hash: 'h1', 'Fatura Tipi': 'İstisna' } });
    const rows = buildTemplateRows([withEdm], DEFAULT_OUTPUT_TEMPLATE, ctx);
    const h = rows[0] as string[];
    const r = rows[1];
    expect(r[h.indexOf('Geliş Zamanı')]).toBe('10/09/2026 12:28:13');
    expect(r[h.indexOf('Durum')]).toBe('Fatura hazır');
    expect(r[h.indexOf('Zarf No')]).toBe('zarf-1');
    expect(r[h.indexOf('Hash')]).toBe('h1');
    expect(r[h.indexOf('Fatura Tipi')]).toBe('Satış'); // XML'den gelen tip korunur
  });
  it('çalışma kitabı EDM görünümünde: kalın başlık, 18,43 genişlik, tutar biçimi', () => {
    const bytes = buildTemplateWorkbook(list, DEFAULT_OUTPUT_TEMPLATE, ctx);
    const files = unzipSync(new Uint8Array(bytes));
    const styles = strFromU8(files['xl/styles.xml']);
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(styles).toContain('<b/>');
    expect(styles).toContain('#,##0.00');
    expect(sheet).toMatch(/<cols><col [^>]*min="1" max="1" width="18\.4\d+"/);
    const wb = XLSX.read(bytes, { type: 'array' });
    const ws = wb.Sheets.Sheet0;
    expect(ws['A1'].s?.font?.bold ?? ws['A1'].s).toBeTruthy();
    expect(ws['I2'].z).toBe('#,##0.00\\ ');
  });
});
