/**
 * Türkçe sayı okuma: virgül ondalık ayracı; nokta yalnızca üçerli gruplarda binlik ayracı.
 *   "3.000" → 3000 · "12.500,50" → 12500.5 · "0,5" → 0.5 · "0.5" → 0.5 · "1.25" → 1.25 · "1.000.000" → 1000000 · "" → null · "abc" → NaN
 * Kural pencereleri aynı kutuya aynı anlamı versin diye tek yerde (eleştiri turu A6).
 */
export function parseTrNumber(s: string): number | null {
  let t = (s ?? '').trim().replace(/\s/g, '').replace('₺', '');
  if (!t) return null;
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (t.includes('.')) {
    const parts = t.split('.');
    const grouped = parts.length >= 2 && parts.slice(1).every((p) => /^\d{3}$/.test(p)) && /^-?\d{1,3}$/.test(parts[0]);
    if (grouped) t = parts.join('');
    // aksi halde nokta ondalık sayılır ("0.5", "1.25")
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** Sayıyı Türkçe biçimde yazar (en çok 3 ondalık); null → "" */
export function fmtTrNumber(n: number | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(n) ? '' : n.toLocaleString('tr-TR', { maximumFractionDigits: 3 });
}
