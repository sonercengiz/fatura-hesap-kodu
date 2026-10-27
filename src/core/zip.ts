import { inflateSync } from 'fflate';

/**
 * ZIP okuyucu: merkez dizini (central directory) kendimiz okuruz.
 *
 * Neden fflate'in unzipSync'i değil: EDM'nin ürettiği ZIP'lerde her girdinin 32 bitlik boyut alanları
 * "zip64 ek alanına bak" (FFFFFFFF) der ama dosyanın sonunda zip64 bitiş kaydı yoktur. fflate bu durumda
 * ek alanı okumaz, boyutu 4 GB sanır ve tarayıcıda "Array buffer allocation failed" ile çöker.
 * Burada ek alan her zaman okunur; boyut yine de bilinmezse akış sonuna kadar şişirilir.
 *
 * Dosya adları: UTF-8 bayrağı yoksa Türkçe DOS kod sayfası (CP857) ile çözülür — EDM adları böyle gelir.
 */
export interface ZipEntry {
  /** Arşiv içindeki tam yol (klasörler "/" ile) */
  path: string;
  bytes: Uint8Array;
}

const MAX32 = 0xffffffff;

function u16(d: Uint8Array, p: number) { return d[p] | (d[p + 1] << 8); }
function u32(d: Uint8Array, p: number) { return (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16)) + d[p + 3] * 0x1000000; }
function u64(d: Uint8Array, p: number) { return u32(d, p) + u32(d, p + 4) * 0x100000000; }

/** CP857 (Türkçe DOS) üst yarısı: 0x80–0xFF */
const CP857_HI = 'ÇüéâäàåçêëèïîıÄÅÉæÆôöòûùİÖÜø£ØŞşáíóúñÑĞğ¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ºªÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµ ×ÚÛÙìÿ¯´­± ¾¶§÷¸°¨·¹³²■ ';

export function decodeZipName(bytes: Uint8Array, utf8: boolean): string {
  if (utf8) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { /* bayrak yanlışsa aşağı düş */ }
  }
  let s = '';
  for (const b of bytes) s += b < 0x80 ? String.fromCharCode(b) : CP857_HI[b - 0x80];
  return s;
}

/** Ek alanlarda (extra field) zip64 kaydını (ID 0x0001) bulup bilinmeyen boyutları tamamlar. */
function zip64Sizes(d: Uint8Array, p: number, len: number, sizes: { comp: number; uncomp: number; offset: number }) {
  const end = p + len;
  while (p + 4 <= end) {
    const id = u16(d, p), l = u16(d, p + 2);
    if (id === 1) {
      let q = p + 4;
      if (sizes.uncomp === MAX32 && q + 8 <= p + 4 + l) { sizes.uncomp = u64(d, q); q += 8; }
      if (sizes.comp === MAX32 && q + 8 <= p + 4 + l) { sizes.comp = u64(d, q); q += 8; }
      if (sizes.offset === MAX32 && q + 8 <= p + 4 + l) { sizes.offset = u64(d, q); }
      return;
    }
    p += 4 + l;
  }
}

export class ZipError extends Error {}

/** Arşivdeki dosyaları (klasör girdileri hariç) döndürür. Desteklenen sıkıştırma: yok (0) ve deflate (8). */
export function readZip(d: Uint8Array): ZipEntry[] {
  // Bitiş kaydını (EOCD) sondan arayarak bul
  let e = d.length - 22;
  const min = Math.max(0, d.length - 22 - 0xffff);
  for (; e >= min; e--) if (u32(d, e) === 0x06054b50) break;
  if (e < min) throw new ZipError('ZIP bitiş kaydı bulunamadı (dosya bozuk ya da yarım inmiş olabilir)');
  let count = u16(d, e + 10);
  let cd = u32(d, e + 16);
  // Varsa zip64 bitiş kaydı (EDM'de yoktur; standart arşivlerde olabilir)
  if ((count === 0xffff || cd === MAX32) && e >= 20 && u32(d, e - 20) === 0x07064b50) {
    const z = u64(d, e - 12);
    if (u32(d, z) === 0x06064b50) { count = u64(d, z + 32); cd = u64(d, z + 48); }
  }
  const out: ZipEntry[] = [];
  let p = cd;
  for (let i = 0; i < count; i++) {
    if (p + 46 > d.length || u32(d, p) !== 0x02014b50) throw new ZipError('ZIP merkez dizini bozuk');
    const flags = u16(d, p + 8), method = u16(d, p + 10);
    const sizes = { comp: u32(d, p + 20), uncomp: u32(d, p + 24), offset: u32(d, p + 42) };
    const nameLen = u16(d, p + 28), extraLen = u16(d, p + 30), commentLen = u16(d, p + 32);
    const path = decodeZipName(d.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0);
    zip64Sizes(d, p + 46 + nameLen, extraLen, sizes);
    p += 46 + nameLen + extraLen + commentLen;
    if (path.endsWith('/')) continue;
    if (flags & 1) throw new ZipError(`ZIP şifreli (${path})`);
    // Yerel başlık → veri başlangıcı
    const lh = sizes.offset;
    if (lh + 30 > d.length || u32(d, lh) !== 0x04034b50) throw new ZipError('ZIP girdisi bozuk');
    const dataStart = lh + 30 + u16(d, lh + 26) + u16(d, lh + 28);
    const compEnd = sizes.comp === MAX32 ? d.length : Math.min(d.length, dataStart + sizes.comp);
    const raw = d.subarray(dataStart, compEnd);
    let bytes: Uint8Array;
    if (method === 0) bytes = sizes.uncomp === MAX32 ? raw.slice() : raw.slice(0, sizes.uncomp);
    else if (method === 8) bytes = sizes.uncomp === MAX32 || sizes.uncomp > 512 * 1024 * 1024 ? inflateSync(raw) : inflateSync(raw, { out: new Uint8Array(sizes.uncomp) });
    else throw new ZipError(`Desteklenmeyen ZIP sıkıştırması (${method}) — arşivi açıp XML'leri yükleyin`);
    out.push({ path, bytes });
  }
  return out;
}
