import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { edmTemplate, DEFAULT_OUTPUT_TEMPLATE, normalizeTemplate, buildTemplateRows, isEdmDefault, codeColumnIndexOf, moneyColumns, FIELD_DEFS, KDV_FIELD_IDS, vatUncovered, vatFieldsFor, type OutputTemplate } from '../src/core/excel/template';
import { buildTemplateWorkbook, EDM_HEADERS } from '../src/core/excel/writeOutput';
import { unzipSync, strFromU8 } from 'fflate';
import type { Invoice } from '../src/core/types';

const mk = (no: string, over: Partial<Invoice> = {}): Invoice => ({
  no, order: 0, date: '10/09/2026', isoDate: '2026-09-10', uuid: 'u-1', supplierVkn: '1234567801', supplierName: 'ÖRNEK KIRTASİYE LTD. ŞTİ.',
  amount: 1500, taxExclusive: 1250, taxAmount: 250, currency: 'TRY', invoiceType: 'Satış', profile: 'Temel', hasView: true, itemText: '', lineCount: 2, typeCode: 'SATIS', lines: [], vatRates: [], vatBreakdown: [], excluded: false, ...over,
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
  it('özel şablon: sütun seçimi, başlık, ekstra alanlar; metin sütunları metin kalır', async () => {
    const t: OutputTemplate = { columns: [{ id: 'code', header: 'Hesap' }, { id: 'no', header: 'Belge No' }, { id: 'uuid', header: 'ETTN' }, { id: 'taxExclusive', header: 'Matrah' }, { id: 'source', header: 'Kaynak' }, { id: 'accountName', header: 'Hesap Adı' }, { id: 'firm', header: 'Firma' }, { id: 'blank', header: '' }], rowOrder: 'date-no', sheetName: 'GMS' };
    const rows = buildTemplateRows(list, t, ctx);
    expect(rows[0]).toEqual(['Hesap', 'Belge No', 'ETTN', 'Matrah', 'Kaynak', 'Hesap Adı', 'Firma', '']);
    expect(rows[1]).toEqual(['600.002', 'ABC2026000000001', 'u-1', 1250, 'Kural', 'Alıcılar', 'ABC', '']);
    expect(rows[2]).toEqual(['', 'ABC2026000000002', 'u-1', 1250, '', '', 'ABC', '']);
    const wb = XLSX.read(await buildTemplateWorkbook(list, t, ctx), { type: 'array' });
    expect(wb.SheetNames).toEqual(['GMS']);
    const ws = wb.Sheets.GMS;
    expect(ws['A2']).toMatchObject({ t: 's', v: '600.002' });
    expect(ws['C2']).toMatchObject({ t: 's', v: 'u-1' });
    expect(ws['D2'].t).toBe('n');
  });
  it('normalize: bozuk kayıt varsayılana, kod sütunu yoksa sona eklenir, bilinmeyen alan atılır', () => {
    expect(normalizeTemplate(undefined)).toEqual(DEFAULT_OUTPUT_TEMPLATE);
    const n = normalizeTemplate({ columns: [{ id: 'no', header: 'No' }, { id: 'x' as never, header: '?' }], rowOrder: 'bogus' as never, sheetName: ' ' });
    expect(n.columns.map((c) => c.id)).toEqual(['no']);
    expect(n.rowOrder).toBe('date-no');
    expect(n.sheetName).toBe('Sheet0');
  });
  it('EDM listesinden gelen sütunlar çıktıda birebir kullanılır; eksikler XML\'den', () => {
    const withEdm = mk('ABC2026000000003', { edm: { 'Geliş Zamanı': '10/09/2026 12:28:13', Durum: 'Fatura hazır', 'Zarf No': 'zarf-1', Hash: 'h1', 'Fatura Tipi': 'İstisna' } });
    const rows = buildTemplateRows([withEdm], DEFAULT_OUTPUT_TEMPLATE, ctx);
    const h = rows[0] as string[];
    const r = rows[1];
    expect(r[h.indexOf('Geliş Zamanı')]).toBe('10/09/2026 12:28:13');
    expect(r[h.indexOf('Durum')]).toBe('Fatura hazır');
    expect(r[h.indexOf('Zarf No')]).toBe('zarf-1');
    expect(r[h.indexOf('Hash')]).toBe('h1');
    expect(r[h.indexOf('Fatura Tipi')]).toBe('İstisna'); // EDM listesi varsa EDM'nin değeri birebir kullanılır
    expect(r[h.indexOf('Tutar')]).toBe(1500); // EDM satırında Tutar yoksa XML'den
  });
  it('çalışma kitabı EDM görünümünde: kalın başlık, 18,43 genişlik, tutar biçimi', async () => {
    const bytes = await buildTemplateWorkbook(list, DEFAULT_OUTPUT_TEMPLATE, ctx);
    const files = unzipSync(new Uint8Array(bytes));
    const styles = strFromU8(files['xl/styles.xml']);
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(styles).toContain('<b/>');
    expect(styles).toContain('#,##0.00');
    expect(sheet).toMatch(/<cols><col [^>]*min="1" max="1" width="18\.4\d+"/);
    const wb = XLSX.read(bytes, { type: 'array', cellNF: true });
    const ws = wb.Sheets.Sheet0;
    expect(ws['I2'].z).toContain('#,##0.00'); // Tutar
  });

  it('KDV dökümü: bugünkü oranlar + oranı uyuşmayan KDV; eski %8/%18 ayrı sütun; oran yoksa boş', () => {
    const t: OutputTemplate = { columns: [{ id: 'no', header: 'No' }, ...KDV_FIELD_IDS.map((id) => ({ id, header: FIELD_DEFS[id].header }))], rowOrder: 'date-no', sheetName: 'S' };
    const inv = mk('X1', { vatBreakdown: [{ rate: 0, base: 300, tax: 0 }, { rate: 20, base: 1250, tax: 250 }, { rate: null, base: 0, tax: 1.5 }] });
    const rows = buildTemplateRows([inv, mk('X2')], t, ctx);
    expect(rows[0]).toEqual(['No', 'Matrah %0', 'Matrah %1', 'KDV %1', 'Matrah %10', 'KDV %10', 'Matrah %20', 'KDV %20', 'Oranı Uyuşmayan KDV']);
    expect(rows[1]).toEqual(['X1', 300, null, null, null, null, 1250, 250, 1.5]);
    expect(rows[2].slice(1)).toEqual(Array(8).fill(null)); // XML'siz ya da dökümsüz fatura: boş
    expect(moneyColumns(t)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const old = mk('X3', { vatBreakdown: [{ rate: 8, base: 100, tax: 8 }, { rate: 18, base: 200.1, tax: 36.02 }] });
    const t2: OutputTemplate = { ...t, columns: [...t.columns, { id: 'vat8Base', header: 'M8' }, { id: 'vat8Tax', header: 'K8' }, { id: 'vat18Base', header: 'M18' }, { id: 'vat18Tax', header: 'K18' }] };
    expect(buildTemplateRows([old], t2, ctx)[1].slice(-4)).toEqual([100, 8, 200.1, 36.02]);
  });

  it('sütunu olmayan KDV oranı bildirilir; şablonda hiç KDV sütunu yoksa sorun sayılmaz', () => {
    const t: OutputTemplate = { columns: [{ id: 'no', header: 'No' }, ...KDV_FIELD_IDS.map((id) => ({ id, header: FIELD_DEFS[id].header }))], rowOrder: 'date-no', sheetName: 'S' };
    const inv = mk('X1', { vatBreakdown: [{ rate: 8, base: 100, tax: 8 }, { rate: 20, base: 10, tax: 2 }, { rate: null, base: 0, tax: 1 }] });
    expect(vatUncovered(inv, t)).toEqual([8]);
    expect(vatFieldsFor(8)).toEqual(['vat8Base', 'vat8Tax']);
    expect(vatUncovered(inv, { ...t, columns: t.columns.filter((c) => c.id !== 'vatOddTax') })).toEqual([8, null]);
    expect(vatUncovered(inv, DEFAULT_OUTPUT_TEMPLATE)).toEqual([]);
  });

  it('Hesap Kodu zorunlu değil; bugünkü "KDV Diğer" sütunu oranı uyuşmayan KDV\'ye çevrilir, "Matrah Diğer" atılır', () => {
    const n = normalizeTemplate({ columns: [{ id: 'no', header: 'No' }, { id: 'vatOtherBase' as never, header: 'Matrah Diğer' }, { id: 'vatOtherTax' as never, header: 'KDV Diğer' }], rowOrder: 'date-no', sheetName: 'S' });
    expect(n.columns).toEqual([{ id: 'no', header: 'No' }, { id: 'vatOddTax', header: 'Oranı Uyuşmayan KDV' }]);
    expect(codeColumnIndexOf(n)).toBe(-1);
    // kullanıcının yazdığı başlık korunur
    expect(normalizeTemplate({ columns: [{ id: 'vatOtherTax' as never, header: 'Ek KDV' }], rowOrder: 'date-no', sheetName: 'S' }).columns).toEqual([{ id: 'vatOddTax', header: 'Ek KDV' }]);
  });
});
