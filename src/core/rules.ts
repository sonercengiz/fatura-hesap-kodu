/**
 * Otomatik atama kuralları: firmaya özel "belirteç → hesap kodu" eşlemeleri.
 * Belirteç satıcının VKN/TCKN'si, unvanında geçen bir metin ya da kalem adında geçen bir metin olabilir.
 * Eşleştirme yerelde, düz metin karşılaştırmasıyla yapılır (ağ yok, düzenli ifade yok).
 */
export type RuleKind = 'vkn' | 'name' | 'item';

export interface Rule {
  id: string;
  firmId: string;
  kind: RuleKind;
  /** VKN/TCKN için rakamlar; diğerlerinde aranan metin (büyük/küçük harf önemsiz) */
  pattern: string;
  code: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  vkn: 'VKN / TCKN',
  name: 'Satıcı unvanı içerir',
  item: 'Kalem adı içerir',
};

/** Kural öncelik sırası: kesin kimlik önce, sonra unvan, en son kalem */
const PRIORITY: Record<RuleKind, number> = { vkn: 0, name: 1, item: 2 };

/** Türkçe küçük harf, tek boşluk, kırpılmış */
export function normText(s: string): string {
  return s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
}

export function normPattern(kind: RuleKind, pattern: string): string {
  return kind === 'vkn' ? pattern.replace(/\D/g, '') : normText(pattern);
}

export interface RuleTarget {
  supplierVkn: string;
  supplierName: string;
  /** Kalem adlarının birleştirilmiş, normalize edilmiş metni */
  itemText: string;
}

export function ruleMatches(rule: Rule, t: RuleTarget): boolean {
  const p = normPattern(rule.kind, rule.pattern);
  if (!p) return false;
  switch (rule.kind) {
    case 'vkn': return t.supplierVkn.replace(/\D/g, '') === p;
    case 'name': return normText(t.supplierName).includes(p);
    case 'item': return t.itemText.includes(p);
  }
}

/** Uyan kurallardan en öncelikli olanı (aynı türde en son güncellenen). Yoksa null. */
export function matchRules(t: RuleTarget, rules: Rule[]): Rule | null {
  let best: Rule | null = null;
  for (const r of rules) {
    if (!r.enabled || !ruleMatches(r, t)) continue;
    if (!best || PRIORITY[r.kind] < PRIORITY[best.kind] || (PRIORITY[r.kind] === PRIORITY[best.kind] && r.updatedAt > best.updatedAt)) best = r;
  }
  return best;
}

export function ruleLabel(r: Rule): string {
  return `${RULE_KIND_LABELS[r.kind]}: ${r.pattern}`;
}

/** Kural geçerliliği; hata metni ya da null */
export function validateRule(kind: RuleKind, pattern: string, code: string): string | null {
  const p = normPattern(kind, pattern);
  if (!code.trim()) return 'Hesap kodu boş olamaz.';
  if (kind === 'vkn' && !/^\d{10,11}$/.test(p)) return 'VKN 10, TCKN 11 rakam olmalı.';
  if (kind !== 'vkn' && p.length < 3) return 'Aranan metin en az 3 karakter olmalı.';
  return null;
}

/** Kural dosyası (.json) biçimi: yalnızca kurallar, firma adıyla; başka kullanıcıya verilebilir */
export interface RulesFile {
  app: 'fatura-hesap-kodu';
  kind: 'rules';
  version: 1;
  exportedAt: string;
  firmName: string;
  rules: Pick<Rule, 'kind' | 'pattern' | 'code' | 'enabled'>[];
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
  const rules = r.rules
    .filter((x) => x && typeof x.pattern === 'string' && typeof x.code === 'string' && (x.kind === 'vkn' || x.kind === 'name' || x.kind === 'item'))
    .map((x) => ({ kind: x.kind as RuleKind, pattern: String(x.pattern), code: String(x.code), enabled: x.enabled !== false }));
  return { app: 'fatura-hesap-kodu', kind: 'rules', version: 1, exportedAt: String(r.exportedAt ?? ''), firmName: String(r.firmName ?? ''), rules };
}
