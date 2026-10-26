import * as XLSX from 'xlsx';
import type { CellValue, Invoice } from '../types';

/** EDM "Gelen Faturalar" Excel'inin sütun düzeni (A–T). GMS.NET'e verilen dosya bu başlıkları aynen taşır. */
export const EDM_HEADERS = [
  'Fatura No',
  'Fatura Tarihi',
  'Geliş Zamanı',
  'Fatura Tipi',
  'Fatura Türü',
  'Gönderen VKN/TCKN',
  'Gönderen Unvan/Ad Soyad',
  'Tutar',
  'Döviz Cinsi',
  'Durum',
  'Yanıt Durumu',
  'Yerele Aktarım Durumu',
  'Zarf No',
  'KEP İtiraz Durumu',
  'Gib Portal Fatura Iptal Durumu',
  'Resmi Yazı İtiraz Durumu',
  'Gib Portal Fatura İtiraz Durumu',
  'Şube',
  'Hash',
  'Etiket',
] as const;

export const EDM_SHEET_NAME = 'Sheet0';

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
