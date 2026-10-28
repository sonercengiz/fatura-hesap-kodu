// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseUbl, parseLines, dominantMonth, sniffEncoding, UblParseError } from '../src/core/xml/parseUbl';
import { typeLabel, profileLabel, toDisplayDate } from '../src/core/types';

const read = (f: string) => readFileSync(resolve(process.cwd(), 'test/fixtures', f), 'utf8');

describe('UBL-TR XML ayrıştırma', () => {
  it('şirket faturası: başlık alanları, tutarlar ve gömülü XSLT', () => {
    const u = parseUbl(read('ubl-sirket.xml'));
    expect(u).toMatchObject({
      no: 'ABC2026000000001',
      uuid: '11111111-2222-3333-4444-555555555555',
      issueDate: '2026-09-10',
      issueTime: '10:15:00',
      profileId: 'TEMELFATURA',
      typeCode: 'SATIS',
      currency: 'TRY',
      supplierVkn: '1234567801',
      supplierName: 'ÖRNEK KIRTASİYE LTD. ŞTİ.',
      customerVkn: '1111111111',
      payable: 1500,
      taxExclusive: 1250,
      taxAmount: 250,
      lineCount: 2,
      itemText: 'kalem defteri | tükenmez kalem',
      xsltFileName: 'ornek.xslt',
    });
    expect(u.xslt).toContain('xsl:stylesheet');
    expect(u.xslt).toContain('Fatura No');
    // Saklanan XML'de XSLT içeriği boşaltılmış, geri kalanı korunmuş
    expect(u.xml).not.toContain('PD94bWwg');
    expect(u.xml).toContain('EmbeddedDocumentBinaryObject');
    expect(u.xml).toContain('<cbc:ID>ABC2026000000001</cbc:ID>');
    expect(u.xml.length).toBeLessThan(read('ubl-sirket.xml').length - 1000); // XSLT base64 çıkarıldı
  });
  it('şahıs faturası: TCKN + ad soyad, XSLT yok, QR eki korunur, döviz', () => {
    const u = parseUbl(read('ubl-sahis.xml'));
    expect(u).toMatchObject({ no: 'AYS2026000000007', supplierVkn: '12345678901', supplierName: 'AYŞE YILMAZ', currency: 'USD', payable: 400, profileId: 'TICARIFATURA', typeCode: 'ISTISNA', xslt: null });
    expect(u.xml).toContain('R0lGODlh'); // QR görseli yerinde
  });
  it('kurallar için kalem özeti ve KDV oranları', () => {
    const u = parseUbl(read('ubl-sirket.xml'));
    expect(u.lines).toEqual([
      { name: 'kalem defteri', label: 'Kalem defteri', qty: 10, unit: 'C62', vat: 20, price: 100, amount: 1000 },
      { name: 'tükenmez kalem', label: 'Tükenmez kalem', qty: 50, unit: 'C62', vat: 20, price: 5, amount: 250 },
    ]);
    expect(u.vatRates).toEqual([20]);
  });
  it('kalemler', () => {
    const lines = parseLines(parseUbl(read('ubl-sirket.xml')).xml);
    expect(lines).toEqual([
      { name: 'Kalem defteri', quantity: '10', unit: 'C62', price: 100, amount: 1000, taxAmount: 200, taxPercent: '20' },
      { name: 'Tükenmez kalem', quantity: '50', unit: 'C62', price: 5, amount: 250, taxAmount: 50, taxPercent: '20' },
    ]);
  });
  it('bozuk ve fatura olmayan belgeler anlaşılır hata verir', () => {
    expect(() => parseUbl(read('bozuk.xml'))).toThrow(UblParseError);
    expect(() => parseUbl(read('irsaliye.xml'))).toThrow(/e-İrsaliye dosyası/);
  });
  it('etiketler ve tarih biçimi', () => {
    expect(typeLabel('SATIS')).toBe('Satış');
    expect(typeLabel('ISTISNA')).toBe('İstisna');
    expect(typeLabel('Satış')).toBe('Satış'); // eski Excel partisi: zaten etiket
    expect(profileLabel('TICARIFATURA')).toBe('Ticari');
    expect(profileLabel('Temel')).toBe('Temel');
    expect(toDisplayDate('2026-09-10')).toBe('10/09/2026');
    expect(toDisplayDate('10/09/2026')).toBe('10/09/2026');
  });
  it('baskın ay ve karakter kümesi', () => {
    expect(dominantMonth(['2026-09-10', '2026-09-30', '2026-10-01'])).toBe('Eylül 2026');
    expect(dominantMonth([])).toBeNull();
    expect(sniffEncoding(new TextEncoder().encode('<?xml version="1.0" encoding="ISO-8859-9"?><a/>'))).toBe('iso-8859-9');
    expect(sniffEncoding(new TextEncoder().encode('<Invoice/>'))).toBe('utf-8');
  });

  it('KDV dökümü: oran başına matrah ve vergi; aynı oran toplanır, KDV dışı vergi (ÖTV) alınmaz, özet yoksa kalemlerden', () => {
    const base = read('ubl-sirket.xml');
    expect(parseUbl(base).vatBreakdown).toEqual([{ rate: 20, base: 1250, tax: 250 }]);
    const sub = (b: string, t: string, p: string, code = '0015', name = 'KDV') => `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="TRY">${b}</cbc:TaxableAmount><cbc:TaxAmount currencyID="TRY">${t}</cbc:TaxAmount><cbc:Percent>${p}</cbc:Percent><cac:TaxCategory><cac:TaxScheme><cbc:Name>${name}</cbc:Name><cbc:TaxTypeCode>${code}</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`;
    const top = base.match(/<cac:TaxTotal><cbc:TaxAmount currencyID="TRY">250.00<\/cbc:TaxAmount><cac:TaxSubtotal>.*?<\/cac:TaxTotal>\n/)![0];
    const multi = `<cac:TaxTotal><cbc:TaxAmount currencyID="TRY">0</cbc:TaxAmount>${sub('100.10', '10.01', '10')}${sub('200.20', '20.02', '10')}${sub('300', '0', '0')}${sub('50', '0.50', '1')}${sub('400', '32', '8')}${sub('1000', '250', '25', '0071', 'ÖTV')}</cac:TaxTotal>\n`;
    expect(parseUbl(base.replace(top, multi)).vatBreakdown).toEqual([
      { rate: 0, base: 300, tax: 0 }, { rate: 1, base: 50, tax: 0.5 }, { rate: 8, base: 400, tax: 32 }, { rate: 10, base: 300.3, tax: 30.03 },
    ]);
    // Oranı vergisini açıklamayan KDV satırı (operatör faturalarında oran alanına tutar yazılmış): oran sütununa girmez, matrahı sayılmaz
    const odd = `<cac:TaxTotal><cbc:TaxAmount currencyID="TRY">0</cbc:TaxAmount>${sub('148.85', '0.50', '0.5')}${sub('148.85', '1', '1')}${sub('9.98', '0.05', '0.05')}${sub('148.85', '29.77', '20')}</cac:TaxTotal>\n`;
    expect(parseUbl(base.replace(top, odd)).vatBreakdown).toEqual([{ rate: 20, base: 148.85, tax: 29.77 }, { rate: null, base: 0, tax: 1.55 }]);
    // Fatura düzeyinde özet yok: kalemlerin vergileri toplanır
    expect(parseUbl(base.replace(top, '')).vatBreakdown).toEqual([{ rate: 20, base: 1250, tax: 250 }]);
  });
});
