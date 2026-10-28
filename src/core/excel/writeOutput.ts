import type { Invoice } from '../types';
import { buildTemplateRows, textColumns, moneyColumns, dateColumns, excelDateSerial, type OutputTemplate, type RowContext } from './template';

export { EDM_HEADERS, EDM_SHEET_NAME } from './edm';
import { EDM_SHEET_NAME } from './edm';

/** Excel kütüphanesi (~500 KB) yalnızca ilk kullanımda yüklenir */
export const loadXlsx = () => import('xlsx-js-style');

/** Şablona göre çalışma kitabı: metin sütunları (hesap kodu, VKN, ETTN) metin tipinde kalır; görünüm EDM dosyasıyla aynı */
export async function buildTemplateWorkbook(invoices: Invoice[], t: OutputTemplate, ctx: RowContext): Promise<Uint8Array> {
  const XLSX = await loadXlsx();
  const aoa = buildTemplateRows(invoices, t, ctx);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const textCols = textColumns(t);
  const moneyCols = new Set(moneyColumns(t));
  const dateCols = dateColumns(t);
  // EDM dosyasıyla aynı görünüm: kalın başlık, 18,43 genişlik, tutarlar #,##0.00.
  // Başlık her zaman metin: "%20" gibi başlıklar sayıya (0,2) dönmez
  for (let c = 0; c < aoa[0].length; c++) {
    ws[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: String(aoa[0][c] ?? ''), s: { font: { bold: true, name: 'Calibri', sz: 11 } } };
  }
  ws['!cols'] = aoa[0].map(() => ({ wch: 17.6 })); // Excel'de 18,43 görünür (EDM dosyasıyla aynı)
  for (let r = 1; r < aoa.length; r++) {
    for (const c of textCols) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const v = aoa[r][c];
      ws[addr] = { t: 's', v: v == null ? '' : String(v) };
    }
    for (const c of moneyCols) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === 'n') cell.z = '#,##0.00\\ ';
    }
    // Gerçek tarih: Excel seri günü + tarih biçimi (saat dilimi kayması olmaz); tanınmayan değer olduğu gibi kalır
    for (const c of dateCols) {
      const d = excelDateSerial(aoa[r][c]);
      if (d) ws[XLSX.utils.encode_cell({ r, c })] = { t: 'n', v: d.serial, z: d.time ? 'dd.mm.yyyy hh:mm' : 'dd.mm.yyyy' };
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t.sheetName || EDM_SHEET_NAME);
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
