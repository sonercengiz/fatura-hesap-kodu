import { describe, it, expect } from 'vitest';
import { zipSync, deflateSync } from 'fflate';
import { readZip, decodeZipName } from '../src/core/zip';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

/**
 * EDM'nin ürettiği biçimi taklit eder: her girdide 32 bit boyutlar FFFFFFFF, gerçek boyutlar zip64 ek alanında (ID 1),
 * ama dosya sonunda zip64 bitiş kaydı YOK; adlar UTF-8 bayrağı olmadan CP857.
 */
function edmStyleZip(files: { nameBytes: Uint8Array; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  const le64 = (n: number) => [...le32(n % 0x100000000), ...le32(Math.floor(n / 0x100000000))];
  for (const f of files) {
    const comp = deflateSync(f.data);
    const extra = [...le16(1), ...le16(16), ...le64(f.data.length), ...le64(comp.length)];
    const local = new Uint8Array([...le32(0x04034b50), ...le16(45), ...le16(0), ...le16(8), ...le16(0), ...le16(0), ...le32(0),
      ...le32(0xffffffff), ...le32(0xffffffff), ...le16(f.nameBytes.length), ...le16(extra.length), ...f.nameBytes, ...extra]);
    parts.push(local, comp);
    central.push(new Uint8Array([...le32(0x02014b50), ...le16(51), ...le16(45), ...le16(0), ...le16(8), ...le16(0), ...le16(0), ...le32(0),
      ...le32(0xffffffff), ...le32(0xffffffff), ...le16(f.nameBytes.length), ...le16(extra.length), ...le16(0), ...le16(0), ...le16(0), ...le32(0),
      ...le32(offset), ...f.nameBytes, ...extra]));
    offset += local.length + comp.length;
  }
  const cdLen = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array([...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(files.length), ...le16(files.length), ...le32(cdLen), ...le32(offset), ...le16(0)]);
  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

describe('ZIP okuma', () => {
  it('standart arşiv (fflate zipSync): klasörler, UTF-8 adlar, sıkıştırmasız ve deflate', () => {
    const z = zipSync({ 'a.xml': enc('<a/>'), 'Eylül/b.xml': [enc('<b/>'.repeat(50)), { level: 6 }], 'oku.txt': [enc('x'), { level: 0 }] });
    const entries = readZip(z);
    expect(entries.map((e) => e.path).sort()).toEqual(['Eylül/b.xml', 'a.xml', 'oku.txt']);
    expect(dec(entries.find((e) => e.path === 'Eylül/b.xml')!.bytes)).toBe('<b/>'.repeat(50));
    expect(dec(entries.find((e) => e.path === 'a.xml')!.bytes)).toBe('<a/>');
  });

  it('EDM biçimi: zip64 ek alanlı boyutlar, zip64 bitiş kaydı yok, CP857 adlar', () => {
    // "CEPTAŞ_İLETİŞİM" CP857: Ş=0x9E, İ=0x98 ; "Doğalgaz_Dağıtım": ğ=0xA7, ı=0x8D
    const name1 = new Uint8Array([...enc('CPM2026000000001 - 2060661423 - CEPTA'), 0x9e, 0x5f, 0x98, ...enc('LET'), 0x98, 0x9e, 0x98, ...enc('M.xml')]);
    const name2 = new Uint8Array([...enc('KRG2026000000002 - Do'), 0xa7, ...enc('algaz_Da'), 0xa7, 0x8d, ...enc('t'), 0x8d, ...enc('m.xml')]);
    const xml1 = enc('<?xml version="1.0"?><Invoice><ID>CPM2026000000001</ID></Invoice>'.repeat(20));
    const xml2 = enc('<Invoice><ID>KRG2026000000002</ID></Invoice>');
    const z = edmStyleZip([{ nameBytes: name1, data: xml1 }, { nameBytes: name2, data: xml2 }]);
    const entries = readZip(z);
    expect(entries.map((e) => e.path)).toEqual(['CPM2026000000001 - 2060661423 - CEPTAŞ_İLETİŞİM.xml', 'KRG2026000000002 - Doğalgaz_Dağıtım.xml']);
    expect(entries[0].bytes).toEqual(xml1);
    expect(dec(entries[1].bytes)).toBe('<Invoice><ID>KRG2026000000002</ID></Invoice>');
  });

  it('bozuk/yarım dosya anlaşılır hata verir', () => {
    expect(() => readZip(enc('bu bir zip değil, düz metin'))).toThrow(/bitiş kaydı/);
  });

  it('ad çözme: UTF-8 bayrağı yanlışsa CP857\'ye düşer', () => {
    expect(decodeZipName(enc('Şişli.xml'), true)).toBe('Şişli.xml');
    expect(decodeZipName(new Uint8Array([0x9e, 0x69, 0x9f, 0x6c, 0x69]), false)).toBe('Şişli');
    expect(decodeZipName(new Uint8Array([0x9e, 0x69, 0x9f, 0x6c, 0x69]), true)).toBe('Şişli');
  });
});
