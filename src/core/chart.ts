import type { CellValue } from './types';

export interface Account {
  code: string;
  name: string;
}

const lower = (s: string) => s.toLocaleLowerCase('tr');

/** Kod başlangıcı > kod içerir > isim kelime başlangıcı > isim içerir; her grupta koda göre sıralı. */
export function searchAccounts(list: Account[], query: string, limit = 12): Account[] {
  const q = lower(query.trim());
  if (!q) return list.slice(0, limit);
  const tiers: Account[][] = [[], [], [], []];
  for (const a of list) {
    const c = a.code;
    const n = lower(a.name);
    if (c.startsWith(q)) tiers[0].push(a);
    else if (c.includes(q)) tiers[1].push(a);
    else if (n.split(/\s+/).some((w) => w.startsWith(q))) tiers[2].push(a);
    else if (n.includes(q)) tiers[3].push(a);
  }
  return tiers.flatMap((t) => t.sort((x, y) => x.code.localeCompare(y.code))).slice(0, limit);
}

/** Excel/CSV'den kod + isim çiftleri: ilk iki dolu sütun; başlık satırı (kodda rakam yoksa) atlanır. */
export async function parseAccountSheet(data: ArrayBuffer | Uint8Array): Promise<Account[]> {
  const XLSX = await import('xlsx-js-style');
  const wb = XLSX.read(data, { type: 'array', raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const aoa = XLSX.utils.sheet_to_json<CellValue[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
  const out = new Map<string, string>();
  for (const row of aoa) {
    const cells = row.map((v) => (v == null ? '' : String(v).trim())).filter((v) => v !== '');
    if (cells.length === 0) continue;
    const code = cells[0];
    const name = cells.slice(1).join(' ');
    if (!/\d/.test(code)) continue; // başlık satırı
    out.set(code, name);
  }
  return Array.from(out, ([code, name]) => ({ code, name }));
}

/** Metin kutusundan hızlı giriş: her satır "kod isim" ya da "kod;isim" ya da "kod\tisim" */
export function parseAccountText(text: string): Account[] {
  const out: Account[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^([^\s;,\t]+)[\s;,\t]*(.*)$/);
    if (!m || !/\d/.test(m[1])) continue;
    out.push({ code: m[1], name: m[2].trim() });
  }
  return out;
}
