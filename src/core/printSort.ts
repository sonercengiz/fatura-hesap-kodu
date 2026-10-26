import type { Invoice } from './types';
import { dateKey } from './sort';

/** Yazdırma sırası ölçütleri */
export type SortKey = 'date' | 'supplier' | 'code' | 'amount' | 'no' | 'added';
export type Dir = 'asc' | 'desc';

export interface PlanSort {
  primary: SortKey;
  dir: Dir;
  secondary: SortKey;
  dir2: Dir;
  /** Birincil ölçütte eşit olanlar içinde aynı satıcının faturalarını bir arada tut */
  groupSupplier: boolean;
}

/** Varsayılan: yalnızca tarih, sonra fatura numarası. Satıcı gruplama kullanıcı isterse açılır. */
export const DEFAULT_PLAN_SORT: PlanSort = { primary: 'date', dir: 'asc', secondary: 'no', dir2: 'asc', groupSupplier: false };

export const KEY_LABELS: Record<SortKey, string> = {
  date: 'Fatura tarihi',
  supplier: 'Satıcı adı',
  code: 'Hesap kodu',
  amount: 'Tutar',
  no: 'Fatura numarası',
  added: 'Yükleme sırası',
};

/** Yön etiketleri ölçüte göre anlamlı kelimelerle */
export const DIR_LABELS: Record<SortKey, [string, string]> = {
  date: ['Eskiden yeniye (ayın 1\'i üstte)', 'Yeniden eskiye (ayın sonu üstte)'],
  supplier: ['A → Z', 'Z → A'],
  code: ['Küçükten büyüğe', 'Büyükten küçüğe'],
  amount: ['Küçükten büyüğe', 'Büyükten küçüğe'],
  no: ['A → Z / küçükten büyüğe', 'Z → A / büyükten küçüğe'],
  added: ['İlk yüklenen üstte', 'Son yüklenen üstte'],
};

type Val = number | string | null;

export function keyValue(inv: Invoice, key: SortKey, codes: Map<string, string>): Val {
  switch (key) {
    case 'date': return dateKey(inv.date) || null;
    case 'supplier': return inv.supplierName.toLocaleLowerCase('tr');
    case 'code': return codes.get(inv.no) ?? null; // atanmamış → en sona
    case 'amount': return inv.amount;
    case 'no': return inv.no;
    case 'added': return inv.order;
  }
}

function cmp(a: Val, b: Val, dir: Dir): number {
  if (a === b) return 0;
  if (a === null) return 1; // boş değerler yön ne olursa olsun sonda
  if (b === null) return -1;
  let r: number;
  if (typeof a === 'number' && typeof b === 'number') r = a - b;
  else r = String(a).localeCompare(String(b), 'tr', { numeric: true });
  return dir === 'asc' ? r : -r;
}

/** Planı sıralar; satıcı gruplama açıksa birincil ölçütte eşit olanlar içinde satıcılar blok halinde kalır. */
export function sortPlan(list: Invoice[], s: PlanSort, codes: Map<string, string>): Invoice[] {
  const base = list.slice().sort((a, b) =>
    cmp(keyValue(a, s.primary, codes), keyValue(b, s.primary, codes), s.dir) ||
    cmp(keyValue(a, s.secondary, codes), keyValue(b, s.secondary, codes), s.dir2) ||
    cmp(a.no, b.no, 'asc'));
  if (!s.groupSupplier || s.primary === 'supplier') return base;
  const out: Invoice[] = [];
  let i = 0;
  while (i < base.length) {
    const v = keyValue(base[i], s.primary, codes);
    let j = i;
    while (j < base.length && keyValue(base[j], s.primary, codes) === v) j++;
    const run = base.slice(i, j);
    const bySupplier = new Map<string, Invoice[]>();
    for (const inv of run) {
      const k = inv.supplierVkn || inv.supplierName;
      const arr = bySupplier.get(k);
      if (arr) arr.push(inv); else bySupplier.set(k, [inv]);
    }
    for (const arr of bySupplier.values()) out.push(...arr); // Map ekleme sırası = ilk görülme = ikincil ölçüt sırası
    i = j;
  }
  return out;
}

const SAME: Record<SortKey, string> = { date: 'Aynı gündekiler', supplier: 'Aynı satıcıdakiler', code: 'Aynı koddakiler', amount: 'Aynı tutardakiler', no: 'Aynı numaradakiler', added: 'Aynı sıradakiler' };

/** Düz Türkçe özet: ne yapıldığını ve en üstte/altta ne olduğunu söyler */
export function describePlan(s: PlanSort, items: Invoice[], codes: Map<string, string>): { summary: string; top: string; bottom: string } {
  const dirWord = (k: SortKey, d: Dir) => { const l = DIR_LABELS[k][d === 'asc' ? 0 : 1].replace(/\s*\(.*\)$/, ''); return /→/.test(l) ? l : l.toLocaleLowerCase('tr'); };
  const parts = [`Önce ${KEY_LABELS[s.primary].toLocaleLowerCase('tr')}: ${dirWord(s.primary, s.dir)}.`];
  if (s.secondary !== s.primary) parts.push(`${SAME[s.primary]} kendi içinde ${KEY_LABELS[s.secondary].toLocaleLowerCase('tr')}: ${dirWord(s.secondary, s.dir2)}.`);
  if (s.groupSupplier && s.primary !== 'supplier') parts.push('Aynı satıcının faturaları bir arada.');
  if (s.primary === 'code') parts.push('Hesap kodu atanmamışlar en sonda.');
  const show = (inv: Invoice | undefined) => {
    if (!inv) return '—';
    const v = s.primary === 'code' ? codes.get(inv.no) ?? 'kodsuz' : s.primary === 'amount' ? `${inv.amount?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${inv.currency}` : s.primary === 'date' ? inv.date : s.primary === 'added' ? `${inv.order + 1}. yüklenen` : '';
    return `${v ? v + ' · ' : ''}${inv.supplierName} · ${inv.no}`;
  };
  return { summary: parts.join(' '), top: show(items[0]), bottom: show(items[items.length - 1]) };
}
