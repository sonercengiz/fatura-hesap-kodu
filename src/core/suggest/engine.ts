export interface HistoryEntry {
  vkn: string;
  code: string;
  count: number;
  lastUsed: number;
}

/**
 * Boş kısayol yuvalarında "hayalet" olarak gösterilecek adaylar: genel kullanım sayısı eşiği aşan,
 * henüz bir yuvaya kaydedilmemiş kodlar; en sık kullanılan önce. Sıralama yalnızca kullanıcı
 * kaydedince yuvaya işlendiği için kısayollar kendiliğinden yer değiştirmez.
 */
export function ghostCandidates(history: HistoryEntry[], pinned: (string | null)[], minCount = 3): { code: string; count: number }[] {
  const taken = new Set(pinned.filter((c): c is string => !!c));
  const total = new Map<string, { count: number; lastUsed: number }>();
  for (const h of history) {
    const t = total.get(h.code) ?? { count: 0, lastUsed: 0 };
    t.count += h.count;
    t.lastUsed = Math.max(t.lastUsed, h.lastUsed);
    total.set(h.code, t);
  }
  return Array.from(total.entries())
    .filter(([code, t]) => !taken.has(code) && t.count >= minCount)
    .sort((a, b) => b[1].count - a[1].count || b[1].lastUsed - a[1].lastUsed || a[0].localeCompare(b[0]))
    .map(([code, t]) => ({ code, count: t.count }));
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
