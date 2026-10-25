import * as XLSX from 'xlsx';
import type { CellValue, EdmSheet, Invoice } from '../types';

const norm = (s: unknown) =>
  String(s ?? '')
    .toLocaleLowerCase('tr')
    .replace(/\s+/g, ' ')
    .trim();

/** Başlık adıyla sütun bul; birkaç olası ad verilebilir. */
export function findColumn(headers: string[], ...names: string[]): number {
  const wanted = names.map(norm);
  const normalized = headers.map(norm);
  for (const w of wanted) {
    const i = normalized.indexOf(w);
    if (i >= 0) return i;
  }
  for (const w of wanted) {
    const i = normalized.findIndex((h) => h.includes(w));
    if (i >= 0) return i;
  }
  return -1;
}

export function readEdmSheet(data: ArrayBuffer | Uint8Array): EdmSheet {
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
  if (findColumn(headers, 'Fatura No') < 0) {
    throw new Error('"Fatura No" sütunu bulunamadı. Bu dosya EDM fatura listesi gibi görünmüyor.');
  }
  return { sheetName, headers, rows };
}

export function toNumber(v: CellValue): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const s = v.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    if (!Number.isNaN(n)) return n;
    const n2 = Number(v);
    return Number.isNaN(n2) ? null : n2;
  }
  return null;
}

export function extractInvoices(sheet: EdmSheet): Invoice[] {
  const h = sheet.headers;
  const cNo = findColumn(h, 'Fatura No');
  const cDate = findColumn(h, 'Fatura Tarihi');
  const cVkn = findColumn(h, 'Gönderen VKN/TCKN', 'VKN');
  const cName = findColumn(h, 'Gönderen Unvan/Ad Soyad', 'Unvan');
  const cAmt = findColumn(h, 'Tutar');
  const cCur = findColumn(h, 'Döviz Cinsi');
  const cType = findColumn(h, 'Fatura Tipi');
  const cProf = findColumn(h, 'Fatura Türü');
  const str = (r: CellValue[], i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '');
  const out: Invoice[] = [];
  sheet.rows.forEach((r, rowIndex) => {
    const no = str(r, cNo).toUpperCase();
    if (!no) return;
    out.push({
      no,
      rowIndex,
      date: str(r, cDate),
      supplierVkn: str(r, cVkn),
      supplierName: str(r, cName),
      amount: cAmt >= 0 ? toNumber(r[cAmt]) : null,
      currency: str(r, cCur) || 'TRY',
      invoiceType: str(r, cType),
      profile: str(r, cProf),
    });
  });
  return out;
}
