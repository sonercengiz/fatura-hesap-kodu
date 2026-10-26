import type { CellValue } from './types';

/** Eski (Excel tabanlı) partilerin sayfa yapısı; yalnızca v6 geçişi ve eski yedekler için. */
export interface EdmSheet {
  sheetName: string;
  headers: string[];
  rows: CellValue[][];
}

export interface LegacyInvoiceFields {
  no: string;
  issueDate: string;
  typeCode: string;
  profileId: string;
  supplierVkn: string;
  supplierName: string;
  payable: number | null;
  currency: string;
  order: number;
}

const norm = (s: unknown) => String(s ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();

function findColumn(headers: string[], ...names: string[]): number {
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

function toNumber(v: CellValue): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/\./g, '').replace(',', '.'));
    if (!Number.isNaN(n)) return n;
    const n2 = Number(v);
    return Number.isNaN(n2) ? null : n2;
  }
  return null;
}

/** GG/AA/YYYY → YYYY-AA-GG; çözülemezse olduğu gibi */
function toIso(s: string): string {
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s;
}

/** Excel satırlarını fatura alanlarına çevirir (tip/tür etiketleri olduğu gibi taşınır). */
export function sheetToInvoices(sheet: EdmSheet): LegacyInvoiceFields[] {
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
  const out: LegacyInvoiceFields[] = [];
  sheet.rows.forEach((r, order) => {
    const no = str(r, cNo).toUpperCase();
    if (!no) return;
    out.push({
      no,
      issueDate: toIso(str(r, cDate)),
      typeCode: str(r, cType),
      profileId: str(r, cProf),
      supplierVkn: str(r, cVkn),
      supplierName: str(r, cName),
      payable: cAmt >= 0 ? toNumber(r[cAmt]) : null,
      currency: str(r, cCur) || 'TRY',
      order,
    });
  });
  return out;
}
