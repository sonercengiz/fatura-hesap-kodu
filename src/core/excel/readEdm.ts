import type { CellValue } from '../types';
import type { EdmSheet } from '../legacy';

const norm = (s: unknown) => String(s ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();

/** EDM "Gelen Faturalar" Excel'ini olduğu gibi okur (ilk sayfa, başlık satırı + hücreler). */
export async function readEdmSheet(data: ArrayBuffer | Uint8Array): Promise<EdmSheet> {
  const XLSX = await import('xlsx-js-style');
  const wb = XLSX.read(data, { type: 'array', raw: true, cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('Excel dosyasında sayfa bulunamadı.');
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<CellValue[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
  if (aoa.length === 0) throw new Error('Excel dosyası boş.');
  const headers = (aoa[0] ?? []).map((h) => String(h ?? '').trim());
  const width = headers.length;
  const rows = aoa.slice(1).map((r) => {
    const row = r.slice(0, width);
    while (row.length < width) row.push(null);
    return row.map((v) => (typeof v === 'string' ? v.trim() : v));
  });
  if (!headers.some((h) => norm(h) === 'fatura no')) throw new Error('"Fatura No" sütunu yok; bu dosya EDM fatura listesi değil.');
  return { sheetName, headers, rows };
}

/** Satırları fatura numarasına göre, başlık → değer sözlüğü olarak verir */
export function edmRowsByNo(sheet: EdmSheet): Map<string, Record<string, CellValue>> {
  const iNo = sheet.headers.findIndex((h) => norm(h) === 'fatura no');
  const out = new Map<string, Record<string, CellValue>>();
  for (const r of sheet.rows) {
    const no = String(r[iNo] ?? '').trim().toUpperCase();
    if (!no) continue;
    const rec: Record<string, CellValue> = {};
    sheet.headers.forEach((h, k) => { if (h) rec[h] = r[k] ?? null; });
    out.set(no, rec);
  }
  return out;
}
