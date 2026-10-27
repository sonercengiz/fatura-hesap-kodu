import * as XLSX from 'xlsx';
import type { CellValue, Invoice } from '../types';
import { buildTemplateRows, textColumns, type OutputTemplate, type RowContext } from './template';

export { EDM_HEADERS, EDM_SHEET_NAME } from './edm';
import { EDM_HEADERS, EDM_SHEET_NAME } from './edm';

/**
 * Bir faturanın EDM satırı. XML'de karşılığı olmayan sütunlar (geliş zamanı, durumlar, zarf no, hash) boş kalır;
 * EDM bu bilgileri kendi sisteminden ekliyordu, hesap kodu aktarımı için gerekmezler.
 */
export function invoiceToEdmRow(inv: Invoice): CellValue[] {
  return [
    inv.no,
    inv.date,
    '',
    inv.invoiceType,
    inv.profile,
    inv.supplierVkn,
    inv.supplierName,
    inv.amount,
    inv.currency || 'TRY',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
}

export interface OutputOptions {
  codeColumnIndex: number; // 1 tabanlı; araya eklenir
  codeHeader: string;
  /** fatura no -> hesap kodu */
  codes: Map<string, string>;
}

export function codeColumnAt(codeColumnIndex: number): number {
  return Math.min(Math.max(codeColumnIndex, 1), EDM_HEADERS.length + 1) - 1;
}

/** Başlık + satırlar; Hesap Kodu sütunu araya eklenmiş hücre matrisi. Satır sırası verilen listeyi izler. */
export function buildOutputRows(invoices: Invoice[], opts: OutputOptions): CellValue[][] {
  const at = codeColumnAt(opts.codeColumnIndex);
  const insert = (row: CellValue[], v: CellValue): CellValue[] => {
    const copy = row.slice();
    copy.splice(at, 0, v);
    return copy;
  };
  const out: CellValue[][] = [insert(EDM_HEADERS.slice(), opts.codeHeader)];
  for (const inv of invoices) out.push(insert(invoiceToEdmRow(inv), opts.codes.get(inv.no) ?? ''));
  return out;
}

export function buildOutputWorkbook(invoices: Invoice[], opts: OutputOptions): Uint8Array {
  const aoa = buildOutputRows(invoices, opts);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Hesap kodu sütunu her zaman metin kalsın (600.002 sayıya dönüşmesin); VKN de metin
  const at = codeColumnAt(opts.codeColumnIndex);
  const vknCol = 5 + (at <= 5 ? 1 : 0);
  for (let r = 1; r < aoa.length; r++) {
    for (const c of [at, vknCol]) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const v = aoa[r][c];
      ws[addr] = { t: 's', v: v == null ? '' : String(v) };
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, EDM_SHEET_NAME);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

/** Faturaların çoğunun ait olduğu ay: "AA YYYY"; tarih yoksa null */
export function dominantMonthKey(invoices: Pick<Invoice, 'isoDate'>[]): { mm: string; yyyy: string } | null {
  const count = new Map<string, number>();
  for (const i of invoices) {
    const m = i.isoDate.match(/^(\d{4})-(\d{2})/);
    if (m) count.set(`${m[1]}-${m[2]}`, (count.get(`${m[1]}-${m[2]}`) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [k, c] of count) if (c > n || (c === n && best !== null && k > best)) { best = k; n = c; }
  if (!best) return null;
  const [yyyy, mm] = best.split('-');
  return { mm, yyyy };
}

/** Şablona göre çalışma kitabı: metin sütunları (hesap kodu, VKN, ETTN) metin tipinde kalır */
export function buildTemplateWorkbook(invoices: Invoice[], t: OutputTemplate, ctx: RowContext): Uint8Array {
  const aoa = buildTemplateRows(invoices, t, ctx);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const textCols = textColumns(t);
  for (let r = 1; r < aoa.length; r++) {
    for (const c of textCols) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const v = aoa[r][c];
      ws[addr] = { t: 's', v: v == null ? '' : String(v) };
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t.sheetName || EDM_SHEET_NAME);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

/** "AY YIL FİRMA_ADI FATURA.xlsx" — aylık işlendiği için gün yok; ay = faturaların baskın ayı, yoksa verilen tarih */
export function buildFileName(firmName: string, invoices: Pick<Invoice, 'isoDate'>[] = [], fallback: Date = new Date()): string {
  const dom = dominantMonthKey(invoices);
  const mm = dom?.mm ?? String(fallback.getMonth() + 1).padStart(2, '0');
  const yyyy = dom?.yyyy ?? String(fallback.getFullYear());
  const firm = (firmName || 'FIRMA')
    .trim()
    .toLocaleUpperCase('tr')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_');
  return `${mm} ${yyyy} ${firm} FATURA.xlsx`;
}
