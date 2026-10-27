/**
 * Otomatik atama kuralları: firmaya özel "koşullar → hesap kodu" tanımları.
 *
 * Bir kural 1–4 koşuldan oluşur; hepsi tutmalıdır (VE). Koşul türleri: satıcı VKN/TCKN, unvanda geçen metin,
 * kalem adında geçen metin, KDV oranı, kalem miktarı aralığı, fatura tutarı aralığı, fatura tipi.
 * Aynı faturaya birden çok kural uyarsa en belirgin olan kazanır (bkz. `beats`).
 * Eşleştirme yerelde, düz metin karşılaştırmasıyla yapılır (ağ yok, düzenli ifade yok).
 */
import { TYPE_LABELS } from './types';

export type CondKind = 'vkn' | 'name' | 'item' | 'vat' | 'qty' | 'amount' | 'type';

export interface Cond {
  kind: CondKind;
  /** vkn: rakamlar; name/item: aranan metin; vat: oran (örn. "10"); type: fatura tipi kodu (SATIS, IADE…) */
  text?: string;
  /** qty/amount: aralık; null ya da yok = o yönde sınırsız */
  min?: number | null;
  max?: number | null;
}

export interface Rule {
  id: string;
  firmId: string;
  /** null = kalıcı (firma geneli); dolu = yalnızca o dönemde (ay) geçerli */
  batchId: string | null;
  conds: Cond[];
  code: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export const MAX_CONDS = 4;

export const COND_LABELS: Record<CondKind, string> = {
  vkn: 'Satıcı VKN / TCKN',
  name: 'Satıcı unvanı içerir',
  item: 'Kalem adı içerir',
  vat: 'KDV oranı',
  qty: 'Kalem miktarı',
  amount: 'Fatura tutarı (KDV dahil)',
  type: 'Fatura tipi',
};

/** Sık kullanılan KDV oranları (seçenek listesi için) */
export const VAT_PRESETS = ['0', '1', '10', '20'];

/** Kural öncelik sırası (küçük = güçlü): kesin kimlik önce, en sona tutar */
const PRIORITY: Record<CondKind, number> = { vkn: 0, name: 1, item: 2, type: 3, vat: 4, qty: 5, amount: 6 };

/**
 * Türkçe küçük harf, tek boşluk, kırpılmış; ayrıca ı → i (XML'lerde "ENERJI" gibi noktasız yazımlar
 * Türkçe küçültmede "enerjı" olur ve kullanıcının yazdığı "enerji" ile tutmaz; iki taraf da aynı biçime getirilir).
 */
export function normText(s: string): string {
  return s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
}

const digits = (s: string | undefined) => (s ?? '').replace(/\D/g, '');

/** Metin koşullarının normalize belirteci (vkn: rakamlar; diğerleri: küçük harf) */
export function normCondText(c: Cond): string {
  if (c.kind === 'vkn') return digits(c.text);
  if (c.kind === 'type') return (c.text ?? '').trim().toUpperCase();
  if (c.kind === 'vat') { const n = toRate(c.text); return n === null ? '' : String(n); }
  return normText(c.text ?? '');
}

/** "10", "%10", "10,00" → 10; geçersizse null */
export function toRate(s: string | undefined): number | null {
  const t = (s ?? '').replace('%', '').replace(',', '.').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
}

/** Kural eşleştirmesinde kullanılan kalem bilgisi (adı normalize) */
export interface RuleLine {
  name: string;
  qty: number | null;
  unit: string;
  vat: number | null;
}

export interface RuleTarget {
  supplierVkn: string;
  supplierName: string;
  /** Kalem adlarının birleştirilmiş, normalize edilmiş metni (kalemler yoksa yedek) */
  itemText: string;
  /** SATIS, IADE, TEVKIFAT… */
  typeCode?: string;
  /** Ödenecek tutar (KDV dahil) */
  amount?: number | null;
  /** Faturadaki KDV oranları (yüzde) */
  vatRates?: number[];
  lines?: RuleLine[];
}

const inRange = (v: number | null | undefined, c: Cond) =>
  v !== null && v !== undefined && Number.isFinite(v) && (c.min === null || c.min === undefined || v >= c.min) && (c.max === null || c.max === undefined || v <= c.max);

/**
 * Kalem koşulları: her "kalem adı içerir" koşulu en az bir kalemde geçmeli; "miktar" koşulu,
 * kuralda kalem adı koşulu varsa o kalemlerden birinde, yoksa herhangi bir kalemde tutmalı.
 */
function linesMatch(conds: Cond[], t: RuleTarget): boolean {
  const items = conds.filter((c) => c.kind === 'item').map(normCondText);
  const qtys = conds.filter((c) => c.kind === 'qty');
  if (items.length === 0 && qtys.length === 0) return true;
  const lines = (t.lines ?? []).map((l) => ({ ...l, name: normText(l.name) }));
  if (lines.length === 0) {
    // Kalem ayrıntısı yok (listeden gelen kayıt ya da eski kayıt): ad için birleşik metin, miktar için eşleşme yok
    if (qtys.length) return false;
    const all = normText(t.itemText);
    return items.every((p) => p && all.includes(p));
  }
  for (const p of items) if (!p || !lines.some((l) => l.name.includes(p))) return false;
  for (const q of qtys) {
    const ok = lines.some((l) => inRange(l.qty, q) && (items.length === 0 || items.some((p) => l.name.includes(p))));
    if (!ok) return false;
  }
  return true;
}

export function condMatches(c: Cond, t: RuleTarget): boolean {
  switch (c.kind) {
    case 'vkn': { const p = digits(c.text); return !!p && digits(t.supplierVkn) === p; }
    case 'name': { const p = normText(c.text ?? ''); return !!p && normText(t.supplierName).includes(p); }
    case 'type': { const p = normCondText(c); return !!p && (t.typeCode ?? '').toUpperCase() === p; }
    case 'vat': { const v = toRate(c.text); return v !== null && (t.vatRates ?? []).some((r) => Math.abs(r - v) < 0.005); }
    case 'amount': return inRange(t.amount, c);
    case 'item': case 'qty': return linesMatch([c], t);
  }
}

export function ruleMatches(rule: Pick<Rule, 'conds'>, t: RuleTarget): boolean {
  if (!rule.conds.length) return false;
  for (const c of rule.conds) if (c.kind !== 'item' && c.kind !== 'qty' && !condMatches(c, t)) return false;
  return linesMatch(rule.conds, t);
}

/** Bu dönemde geçerli kurallar: kalıcılar + yalnızca bu dönemdekiler */
export function activeRules(rules: Rule[], batchId: string | null): Rule[] {
  return rules.filter((r) => r.batchId === null || r.batchId === batchId);
}

const strength = (r: Rule) => Math.min(...r.conds.map((c) => PRIORITY[c.kind]));

/**
 * a, b'den önce mi gelir: dönem kuralı kalıcıdan önce; sonra daha çok koşullu (daha belirgin) olan;
 * sonra en güçlü koşul türü (VKN › unvan › kalem › tip › KDV › miktar › tutar); sonra en son güncellenen.
 */
export function beats(a: Rule, b: Rule): boolean {
  const sa = a.batchId ? 0 : 1;
  const sb = b.batchId ? 0 : 1;
  if (sa !== sb) return sa < sb;
  if (a.conds.length !== b.conds.length) return a.conds.length > b.conds.length;
  const pa = strength(a), pb = strength(b);
  if (pa !== pb) return pa < pb;
  return a.updatedAt > b.updatedAt;
}

/** Öncelik açıklaması (arayüz için) */
export const PRIORITY_TEXT = 'Birden çok kural uyarsa: önce döneme özel olan, sonra daha çok koşullu (daha belirgin) olan, sonra VKN › unvan › kalem › tip › KDV › miktar › tutar sırası, sonra en son güncellenen.';

/**
 * Uyan kurallardan en öncelikli olanı. `batchId` verilirse yalnızca kalıcılar ve o dönemin kuralları değerlendirilir;
 * dönem kuralı kalıcı kuralın önüne geçer. Yoksa null.
 */
export function matchRules(t: RuleTarget, rules: Rule[], batchId: string | null = null): Rule | null {
  let best: Rule | null = null;
  for (const r of rules) {
    if (!r.enabled || (r.batchId !== null && r.batchId !== batchId) || !ruleMatches(r, t)) continue;
    if (!best || beats(r, best)) best = r;
  }
  return best;
}

/** Yalnızca kalıcı kurallar arasında en öncelikli uyan (dönem kuralının neyi geçersiz kıldığını göstermek için) */
export function matchPermanent(t: RuleTarget, rules: Rule[]): Rule | null {
  return matchRules(t, rules.filter((r) => r.batchId === null), null);
}

const fmtNum = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/** Aralık metni: "1–1000", "≥ 1000", "≤ 10000" */
export function rangeText(c: Cond, suffix = ''): string {
  const lo = c.min ?? null, hi = c.max ?? null;
  if (lo !== null && hi !== null) return `${fmtNum(lo)}–${fmtNum(hi)}${suffix}`;
  if (lo !== null) return `≥ ${fmtNum(lo)}${suffix}`;
  if (hi !== null) return `≤ ${fmtNum(hi)}${suffix}`;
  return '—';
}

export function condLabel(c: Cond): string {
  switch (c.kind) {
    case 'vkn': return `VKN/TCKN ${digits(c.text)}`;
    case 'name': return `unvan "${(c.text ?? '').trim()}"`;
    case 'item': return `kalem "${(c.text ?? '').trim()}"`;
    case 'vat': { const v = toRate(c.text); return `KDV %${v === null ? '?' : fmtNum(v)}`; }
    case 'qty': return `miktar ${rangeText(c)}`;
    case 'amount': return `tutar ${rangeText(c, ' ₺')}`;
    case 'type': return `tip ${TYPE_LABELS[normCondText(c)] ?? c.text ?? ''}`;
  }
}

/** Kuralın okunur özeti: koşullar " + " ile */
export function ruleLabel(r: Pick<Rule, 'conds'>): string {
  return r.conds.map(condLabel).join(' + ');
}

/** Tek koşulun geçerliliği; hata metni ya da null */
export function validateCond(c: Cond): string | null {
  switch (c.kind) {
    case 'vkn': return /^\d{10,11}$/.test(digits(c.text)) ? null : 'VKN 10, TCKN 11 rakam olmalı.';
    case 'name': case 'item': return normText(c.text ?? '').length >= 3 ? null : `${COND_LABELS[c.kind]}: en az 3 karakter yazın.`;
    case 'vat': return toRate(c.text) === null ? 'KDV oranı 0–100 arası bir sayı olmalı (örn. 10).' : null;
    case 'type': return normCondText(c) ? null : 'Fatura tipi seçin.';
    case 'qty': case 'amount': {
      const lo = c.min ?? null, hi = c.max ?? null;
      if (lo === null && hi === null) return `${COND_LABELS[c.kind]}: alt ya da üst sınır girin.`;
      if ((lo !== null && !Number.isFinite(lo)) || (hi !== null && !Number.isFinite(hi))) return `${COND_LABELS[c.kind]}: sınırlar sayı olmalı.`;
      if (lo !== null && hi !== null && lo > hi) return `${COND_LABELS[c.kind]}: alt sınır üst sınırdan büyük olamaz.`;
      return null;
    }
  }
}

/** Kural geçerliliği; hata metni ya da null */
export function validateRule(conds: Cond[], code: string): string | null {
  if (!code.trim()) return 'Hesap kodu boş olamaz.';
  if (!conds.length) return 'En az bir koşul gerekir.';
  if (conds.length > MAX_CONDS) return `En çok ${MAX_CONDS} koşul olabilir.`;
  for (const c of conds) { const e = validateCond(c); if (e) return e; }
  const keys = conds.map(condKey);
  if (new Set(keys).size !== keys.length) return 'Aynı koşul iki kez yazılmış.';
  return null;
}

/** Koşulu kaydedilecek biçime getirir (metin kırpılmış, vkn rakam, sınırlar sayı ya da null) */
export function cleanCond(c: Cond): Cond {
  if (c.kind === 'qty' || c.kind === 'amount') {
    const n = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : v);
    return { kind: c.kind, min: n(c.min), max: n(c.max) };
  }
  return { kind: c.kind, text: c.kind === 'vkn' ? digits(c.text) : (c.text ?? '').trim() };
}

function condKey(c: Cond): string {
  return c.kind === 'qty' || c.kind === 'amount' ? `${c.kind}:${c.min ?? ''}:${c.max ?? ''}` : `${c.kind}:${normCondText(c)}`;
}

/** Aynı kuralı tanımak için anahtar (koşul sırası önemsiz) */
export function ruleKey(conds: Cond[]): string {
  return conds.map(condKey).sort().join('|');
}

/** Eski (tek belirteçli: kind + pattern) ya da yeni kayıttan kural; tanınmazsa null */
export function upgradeRule(raw: unknown): (Omit<Rule, 'id' | 'firmId' | 'batchId' | 'createdAt' | 'updatedAt'> & Partial<Rule>) | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Rule> & { kind?: string; pattern?: string };
  let conds: Cond[] | null = null;
  if (Array.isArray(r.conds)) {
    conds = r.conds.filter((c): c is Cond => !!c && typeof c === 'object' && typeof (c as Cond).kind === 'string' && (c as Cond).kind in COND_LABELS).map(cleanCond);
  } else if (typeof r.kind === 'string' && typeof r.pattern === 'string' && (r.kind === 'vkn' || r.kind === 'name' || r.kind === 'item')) {
    conds = [cleanCond({ kind: r.kind, text: r.pattern })];
  }
  if (!conds || !conds.length || typeof r.code !== 'string' || !r.code.trim()) return null;
  const { kind: _k, pattern: _p, ...rest } = r;
  return { ...rest, conds, code: r.code.trim(), enabled: r.enabled !== false };
}

/** Kural dosyası (.json) biçimi: yalnızca kalıcı kurallar, firma adıyla; başka kullanıcıya verilebilir */
export interface RulesFile {
  app: 'fatura-hesap-kodu';
  kind: 'rules';
  version: 2;
  exportedAt: string;
  firmName: string;
  rules: Pick<Rule, 'conds' | 'code' | 'enabled'>[];
}

export function parseRulesFile(text: string): RulesFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Dosya okunamadı (JSON değil).');
  }
  const r = raw as Partial<RulesFile>;
  if (r?.app !== 'fatura-hesap-kodu' || r.kind !== 'rules' || !Array.isArray(r.rules)) throw new Error('Bu dosya bir kural dosyası değil.');
  const rules = r.rules.map(upgradeRule).filter((x): x is NonNullable<typeof x> => !!x && validateRule(x.conds, x.code) === null).map(({ conds, code, enabled }) => ({ conds, code, enabled }));
  return { app: 'fatura-hesap-kodu', kind: 'rules', version: 2, exportedAt: String(r.exportedAt ?? ''), firmName: String(r.firmName ?? ''), rules };
}
