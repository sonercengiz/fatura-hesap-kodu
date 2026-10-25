import type { Invoice } from './types';

export type SortMode = 'excel' | 'date-supplier';

export const SORT_LABELS: Record<SortMode, string> = {
  excel: 'Excel sırası',
  'date-supplier': 'Tarih (eskiden yeniye), satıcı gruplu',
};

/** "GG/AA/YYYY" (veya "GG.AA.YYYY", "YYYY-AA-GG") → YYYYMMDD sayı; çözülemezse 0 */
export function dateKey(s: string): number {
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Number(iso[1]) * 10000 + Number(iso[2]) * 100 + Number(iso[3]);
  return 0;
}

/**
 * Tarih eskiden yeniye; aynı gün içinde faturalar fatura numarasına göre, ancak aynı satıcının
 * faturaları bir blok halinde tutulur (bloklar satıcının o günkü en küçük fatura numarasına göre sıralanır).
 * Çıktı sırasını etkilemez; yalnızca ekran listesi içindir.
 */
export function sortInvoices(list: Invoice[], mode: SortMode): Invoice[] {
  if (mode === 'excel') return list.slice().sort((a, b) => a.rowIndex - b.rowIndex);
  const minNoByDaySupplier = new Map<string, string>();
  for (const inv of list) {
    const k = `${dateKey(inv.date)}|${inv.supplierVkn}`;
    const cur = minNoByDaySupplier.get(k);
    if (cur === undefined || inv.no < cur) minNoByDaySupplier.set(k, inv.no);
  }
  return list.slice().sort((a, b) => {
    const da = dateKey(a.date);
    const db = dateKey(b.date);
    if (da !== db) return da - db;
    const ga = minNoByDaySupplier.get(`${da}|${a.supplierVkn}`) ?? '';
    const gb = minNoByDaySupplier.get(`${db}|${b.supplierVkn}`) ?? '';
    if (ga !== gb) return ga < gb ? -1 : 1;
    if (a.no !== b.no) return a.no < b.no ? -1 : 1;
    return a.rowIndex - b.rowIndex;
  });
}
