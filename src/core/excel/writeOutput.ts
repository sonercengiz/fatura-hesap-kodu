import * as XLSX from 'xlsx';
import type { CellValue, EdmSheet } from '../types';

export interface OutputOptions {
  codeColumnIndex: number; // 1 tabanlı; araya eklenir
  codeHeader: string;
  /** rowIndex -> hesap kodu */
  codes: Map<number, string>;
}

/** Girdi sayfası + araya eklenmiş Hesap Kodu sütunu; hücre matrisi olarak. */
export function buildOutputRows(sheet: EdmSheet, opts: OutputOptions): CellValue[][] {
  const width = sheet.headers.length;
  const at = Math.min(Math.max(opts.codeColumnIndex, 1), width + 1) - 1;
  const insert = (row: CellValue[], v: CellValue): CellValue[] => {
    const copy = row.slice();
    copy.splice(at, 0, v);
    return copy;
  };
  const out: CellValue[][] = [insert(sheet.headers, opts.codeHeader)];
  sheet.rows.forEach((r, i) => out.push(insert(r, opts.codes.get(i) ?? '')));
  return out;
}

export function buildOutputWorkbook(sheet: EdmSheet, opts: OutputOptions): Uint8Array {
  const aoa = buildOutputRows(sheet, opts);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Hesap kodu sütunu her zaman metin kalsın (600.002 sayıya dönüşmesin)
  const at = Math.min(Math.max(opts.codeColumnIndex, 1), sheet.headers.length + 1) - 1;
  for (let r = 1; r < aoa.length; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: at });
    const v = aoa[r][at];
    ws[addr] = { t: 's', v: v == null ? '' : String(v) };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName || 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

/** "GÜN AY YIL FİRMA_ADI FATURA.xlsx" */
export function buildFileName(firmName: string, date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const firm = (firmName || 'FIRMA')
    .trim()
    .toLocaleUpperCase('tr')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_');
  return `${dd} ${mm} ${yyyy} ${firm} FATURA.xlsx`;
}
