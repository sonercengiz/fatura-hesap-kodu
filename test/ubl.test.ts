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
  it('kalemler', () => {
    const lines = parseLines(parseUbl(read('ubl-sirket.xml')).xml);
    expect(lines).toEqual([
      { name: 'Kalem defteri', quantity: '10', unit: 'C62', price: 100, amount: 1000, taxAmount: 200, taxPercent: '20' },
      { name: 'Tükenmez kalem', quantity: '50', unit: 'C62', price: 5, amount: 250, taxAmount: 50, taxPercent: '20' },
    ]);
  });
  it('bozuk ve fatura olmayan belgeler anlaşılır hata verir', () => {
    expect(() => parseUbl(read('bozuk.xml'))).toThrow(UblParseError);
    expect(() => parseUbl(read('irsaliye.xml'))).toThrow(/e-Fatura XML'i değil/);
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
});
