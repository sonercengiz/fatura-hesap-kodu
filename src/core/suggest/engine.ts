export interface HistoryEntry {
  vkn: string;
  code: string;
  count: number;
  lastUsed: number;
}

/** Bu satıcıya daha önce en çok verilen kod (varsa). */
export function supplierHint(history: HistoryEntry[], vkn: string): { code: string; count: number } | null {
  let best: HistoryEntry | null = null;
  for (const h of history) {
    if (h.vkn !== vkn) continue;
    if (!best || h.count > best.count || (h.count === best.count && h.lastUsed > best.lastUsed)) best = h;
  }
  return best ? { code: best.code, count: best.count } : null;
}

/** Hesap kodu tamamlama: başlangıç eşleşmesi önce, sonra içerme. */
export function completeCode(prefix: string, candidates: Iterable<string>, limit = 8): string[] {
  const p = prefix.trim();
  if (!p) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const c of candidates) {
    if (c.startsWith(p)) starts.push(c);
    else if (c.includes(p)) contains.push(c);
  }
  return [...starts.sort(), ...contains.sort()].slice(0, limit);
}
